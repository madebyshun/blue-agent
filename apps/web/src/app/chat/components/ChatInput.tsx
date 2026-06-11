"use client";
import { useRef, useCallback, useState } from "react";
import { useChat } from "../ChatContext";
import { PERSONAS } from "../personas";
import { creditCost } from "@/lib/credits";
import type { Attachment } from "../types";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const TEXT_EXTS = new Set([
  "sol", "ts", "tsx", "js", "jsx", "py", "rs", "go",
  "md", "txt", "json", "yaml", "yml", "toml", "env",
  "html", "css", "sh", "bash", "zsh",
]);

interface SlashCommand {
  cmd: string; icon: string; label: string; hint: string; example: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { cmd: "idea",   icon: "💡", label: "Idea Brief",      hint: "Fundable brief — problem, MVP, 24h plan",   example: "/idea <concept>" },
  { cmd: "build",  icon: "🛠️", label: "Architecture",    hint: "Stack, folder structure, integrations",     example: "/build <project>" },
  { cmd: "audit",  icon: "🛡️", label: "Audit",           hint: "Security + product risk, GO/NO-GO",         example: "/audit <code>" },
  { cmd: "ship",   icon: "🚀", label: "Ship Checklist",  hint: "Deploy steps, verify, monitor for Base",    example: "/ship <project>" },
  { cmd: "raise",  icon: "💰", label: "Pitch",           hint: "Narrative, ask, target investors",          example: "/raise <project>" },
  { cmd: "pick",   icon: "🎯", label: "Token Pick",      hint: "AI-powered token pick on Base",             example: "/pick" },
  { cmd: "scan",   icon: "🔍", label: "Scan Token",      hint: "Honeypot + risk check before buying",       example: "/scan <address>" },
  { cmd: "wallet", icon: "👛", label: "Wallet Analysis", hint: "Analyze on-chain activity and strategy",    example: "/wallet <address>" },
  { cmd: "pnl",     icon: "📊", label: "Wallet PnL",      hint: "Deep PnL report for any Base wallet",        example: "/pnl <address>" },
  { cmd: "aml",     icon: "🛡️", label: "AML Screen",      hint: "AML compliance — CLEAN / SUSPICIOUS",        example: "/aml <address>" },
  { cmd: "quantum", icon: "⚛",  label: "Quantum Scan",    hint: "Quantum vulnerability score for a wallet",   example: "/quantum <address>" },
  { cmd: "airdrop", icon: "🪂", label: "Airdrop Check",   hint: "Base airdrop eligibility + activity score",  example: "/airdrop <address>" },
  { cmd: "yield",   icon: "💰", label: "Yield Optimizer", hint: "Best APY opportunities on Base DeFi",        example: "/yield" },
  { cmd: "dex",     icon: "📈", label: "DEX Flow",        hint: "Live buy/sell pressure for a token",         example: "/dex <token>" },
  { cmd: "whale",   icon: "🐋", label: "Whale Tracker",   hint: "Smart money flow for any token",             example: "/whale <token>" },
  { cmd: "launch",  icon: "🚀", label: "Launch Token",    hint: "Deploy a real token on Base via Bankr",       example: "/launch <token>" },
  { cmd: "credits", icon: "⚡", label: "Credits",         hint: "Show balance, tier, and how to earn more",   example: "/credits" },
  { cmd: "models",  icon: "🤖", label: "Models",          hint: "List all available AI models + costs",       example: "/models" },
  { cmd: "skills",  icon: "⚡", label: "Skills / Tools",  hint: "List all Hub tools available in chat",       example: "/skills" },
  { cmd: "help",    icon: "📖", label: "Help",            hint: "Show all available commands",                example: "/help" },
];

export interface ModelTier {
  id: string; label: string; model: string;
  color: string; badge: string; note: string;
  group: "bankr" | "venice" | "privacy";
  credits: number; // cost per msg
}

// User-facing model list — locked at 5 active models (one per preset).
// The previous 14-model raw menu has been retired in favour of preset-only
// selection. The cost-lookup tables in /lib/credits.ts and /lib/credit-
// pricing.ts keep all 14 IDs around so legacy chatTier values cached in
// localStorage still resolve to a price; the ChatContext bootstrap below
// remaps any unknown ID back to "pro" so the picker never lands on a
// model that doesn't exist in the UI any more.

export const BANKR_TIERS: ModelTier[] = [
  { id: "pro",  label: "Pro", model: "Sonnet", color: "#4FC3F7", badge: "", note: "Balanced", group: "bankr", credits: 50  },
  { id: "max",  label: "Max", model: "Opus",   color: "#A78BFA", badge: "", note: "Smartest", group: "bankr", credits: 200 },
];

export const VENICE_TIERS: ModelTier[] = [
  { id: "venice-deepseek", label: "V4 Flash",   model: "deepseek-v4-flash", color: "#34D399", badge: "V", note: "Fastest · 1M ctx", group: "venice", credits: 10  },
  { id: "venice-grok",     label: "Grok 4",     model: "grok-4-3",          color: "#E879F9", badge: "V", note: "X search",         group: "venice", credits: 60  },
  { id: "venice-fable",    label: "Fable 5",    model: "claude-fable-5",    color: "#F472B6", badge: "V", note: "Claude · 1M ctx",   group: "venice", credits: 120 },
];

export const PRIVACY_TIERS: ModelTier[] = [
  { id: "venice-e2ee-gemma", label: "Private Gemma", model: "e2ee-gemma-3-27b-p", color: "#6EE7B7", badge: "🔒", note: "E2EE · No logs", group: "privacy", credits: 30 },
];

export const ALL_TIERS: ModelTier[] = [...BANKR_TIERS, ...VENICE_TIERS, ...PRIVACY_TIERS];

/**
 * Use-case presets — what most users actually want at the moment of
 * choosing. Each preset maps to one underlying tier ID so the rest of the
 * pipeline (cost, system prompt, tool routing) doesn't need to change.
 *
 * The raw 14-model list still ships behind an "Advanced ▾" expander for
 * power users; presets are the default landing.
 */
export interface ModelPreset {
  id:       string;
  label:    string;
  desc:     string;
  icon:     string;
  tier:     string;     // maps to a ModelTier id
  webSearch?: boolean;  // suggested webSearch default when picked
}

/**
 * 5 use-case presets, ordered by likely user intent (chat-first, then
 * cheap fast, then specialised web/deep/private). Each maps to one
 * underlying model tier + a sensible webSearch default so picking a
 * preset is a one-click setup.
 *
 * Funding model context:
 *   - Bankr-tier models (Chat, Deep Think) are funded via the $BLUEAGENT
 *     trade-fee partnership — Bankr accepts $BLUE for compute, and we
 *     earn $BLUE from Bankr trade fees. Closed loop.
 *   - Venice-tier models (Fast, Web Search, Private) are paid in USDC
 *     directly. Cheap enough that the credit price (1 cr = $0.0005)
 *     gives 17-25x margin on DeepSeek Flash / E2EE Gemma.
 *
 * A 6th "🛠️ Code" preset is planned for when a code-specialised model
 * lands; the slot is intentionally left for it.
 */
export const MODEL_PRESETS: ModelPreset[] = [
  { id: "chat",       label: "Chat",        desc: "Balanced default · Sonnet · 200K ctx", icon: "💬", tier: "pro",                webSearch: false },
  { id: "fast",       label: "Fast",        desc: "Cheapest · DeepSeek · 1M ctx",         icon: "⚡", tier: "venice-deepseek",    webSearch: false },
  { id: "web-search", label: "Web Search",  desc: "~2s live multi-source · Grok 4",       icon: "🔍", tier: "venice-grok",        webSearch: true  },
  { id: "deep-think", label: "Deep Think",  desc: "Heavy reasoning + web · Opus",         icon: "🔬", tier: "max",                webSearch: true  },
  { id: "fable",      label: "Fable 5",     desc: "Creative Claude · 1M ctx · Venice",    icon: "✍️", tier: "venice-fable",       webSearch: false },
  { id: "private",    label: "Private",     desc: "E2EE · no logs · Gemma 27B",           icon: "🔒", tier: "venice-e2ee-gemma",  webSearch: false },
];

export default function ChatInput() {
  const {
    input, setInput, send, stop, streaming, outOfCredits,
    error, credits, cost, chatTier, holderTier, setChatTier,
    cmdMenu, setCmdMenu, cmdFilter, setCmdFilter,
    setBuyOpen, webSearch, setWebSearch, pendingFiles, setPendingFiles,
    personaId, setPersonaId,
  } = useChat();

  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [modelOpen,   setModelOpen]   = useState(false);
  const [cmdOpen,     setCmdOpen]     = useState(false);
  const [personaOpen, setPersonaOpen] = useState(false);

  const activePersona = PERSONAS.find(p => p.id === personaId) ?? PERSONAS[0];

  // Active preset (if the current tier matches a preset's underlying tier).
  // Used to highlight the right card when the popover opens.
  const activePreset = MODEL_PRESETS.find(p => p.tier === chatTier);

  const activeTier = ALL_TIERS.find(t => t.id === chatTier) ?? BANKR_TIERS[1];

  // ── File handling ────────────────────────────────────────────────────────────
  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList) return;
    const newFiles: Attachment[] = [];

    for (const file of Array.from(fileList)) {
      if (file.size > MAX_FILE_SIZE) { alert(`${file.name} is too large (max 10MB)`); continue; }
      const ext    = file.name.split(".").pop()?.toLowerCase() ?? "";
      const isText = TEXT_EXTS.has(ext) || file.type.startsWith("text/");

      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        if (isText) {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsText(file);
        } else {
          reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
          reader.readAsDataURL(file);
        }
        reader.onerror = reject;
      });

      newFiles.push({ name: file.name, mimeType: file.type || "application/octet-stream", size: file.size, data, isText });
    }

    if (newFiles.length) setPendingFiles([...pendingFiles, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [pendingFiles, setPendingFiles]);

  // ── Input handling ───────────────────────────────────────────────────────────
  function handleInput(val: string) {
    setInput(val);
    if (val.startsWith("/")) {
      const filter = val.slice(1).toLowerCase();
      setCmdFilter(filter);
      setCmdMenu(true);
      setCmdOpen(false);
    } else {
      setCmdMenu(false);
      setCmdFilter("");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") { setCmdMenu(false); setCmdOpen(false); setModelOpen(false); setPersonaOpen(false); return; }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  }

  function selectCommand(cmd: SlashCommand) {
    const needsArg = !["pick", "help", "models", "skills", "status"].includes(cmd.cmd);
    const newVal   = needsArg ? `/${cmd.cmd} ` : `/${cmd.cmd}`;
    setInput(newVal);
    setCmdMenu(false);
    setCmdFilter("");
    setCmdOpen(false);
    textareaRef.current?.focus();
    if (!needsArg) setTimeout(() => send(`/${cmd.cmd}`), 50);
  }

  const filteredCmds = SLASH_COMMANDS.filter(c =>
    !cmdFilter || c.cmd.startsWith(cmdFilter) || c.label.toLowerCase().includes(cmdFilter)
  );

  const activeCmd    = input.match(/^\/(\w+)/)?.[1]?.toLowerCase();
  const activeCmdDef = SLASH_COMMANDS.find(c => c.cmd === activeCmd);

  return (
    <div className="border-t border-[#1A1A2E] bg-[#050508] px-4 sm:px-6 py-3 flex-shrink-0">
      <div className="max-w-4xl mx-auto relative">

        {/* ── Slash command menu (typed /) ─────────────────────────────────── */}
        {cmdMenu && filteredCmds.length > 0 && (
          <div className="absolute bottom-full mb-2 left-0 right-0 bg-[#0D0D14] border border-[#2A2A4E] rounded-xl overflow-hidden shadow-2xl z-20 max-h-72 overflow-y-auto">
            <div className="px-3 pt-2.5 pb-1.5 border-b border-[#1A1A2E]">
              <span className="font-mono text-[10px] text-slate-600 tracking-widest">COMMANDS</span>
            </div>
            {filteredCmds.map((c) => (
              <button
                key={c.cmd}
                onMouseDown={(e) => { e.preventDefault(); selectCommand(c); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#1A1A2E] transition-colors text-left group"
              >
                <span className="text-base w-5 text-center shrink-0">{c.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-[#4FC3F7]">/{c.cmd}</span>
                    <span className="font-mono text-xs text-slate-400">{c.label}</span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-600 truncate block">{c.hint}</span>
                </div>
                <span className="font-mono text-[10px] text-slate-700 group-hover:text-slate-500 shrink-0 hidden sm:block">{c.example}</span>
              </button>
            ))}
          </div>
        )}

        {/* ── Commands popover (toolbar button) ───────────────────────────── */}
        {cmdOpen && (
          <div className="absolute bottom-full mb-2 left-0 bg-[#0D0D14] border border-[#2A2A4E] rounded-xl overflow-hidden shadow-2xl z-20 w-72 max-h-80 overflow-y-auto">
            <div className="px-3 pt-2.5 pb-1.5 border-b border-[#1A1A2E]">
              <span className="font-mono text-[10px] text-slate-600 tracking-widest">COMMANDS</span>
            </div>
            {SLASH_COMMANDS.map((c) => (
              <button
                key={c.cmd}
                onMouseDown={(e) => { e.preventDefault(); selectCommand(c); }}
                className="w-full flex items-center gap-3 px-4 py-2 hover:bg-[#1A1A2E] transition-colors text-left group"
              >
                <span className="text-sm w-5 text-center shrink-0">{c.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-[10px] text-slate-300 group-hover:text-white">/{c.cmd} · {c.label}</p>
                  <p className="font-mono text-[9px] text-slate-600 truncate">{c.hint}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ── Persona selector popover ─────────────────────────────────────── */}
        {personaOpen && (
          <div className="absolute bottom-full mb-2 left-0 bg-[#0D0D14] border border-[#2A2A4E] rounded-xl overflow-hidden shadow-2xl z-20 w-80 max-h-[420px] overflow-y-auto">
            <div className="px-3 pt-2.5 pb-1.5 border-b border-[#1A1A2E] sticky top-0 bg-[#0D0D14] z-10">
              <span className="font-mono text-[10px] text-slate-600 tracking-widest">PERSONA · EXPERT ROLE</span>
            </div>
            <div className="py-1.5">
              {PERSONAS.map(p => {
                const isActive = personaId === p.id;
                return (
                  <button key={p.id}
                    onClick={() => { setPersonaId(p.id); setPersonaOpen(false); textareaRef.current?.focus(); }}
                    className="w-full text-left flex items-center gap-2.5 px-3 py-2 hover:bg-white/[0.02] transition-colors relative"
                    style={isActive ? { background: `${p.color}0a` } : undefined}>
                    {isActive && (
                      <span aria-hidden className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r"
                            style={{ background: p.color, boxShadow: `0 0 8px ${p.color}80` }} />
                    )}
                    <span className="text-base shrink-0 w-5 text-center">{p.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-[12px] font-bold" style={{ color: isActive ? p.color : "#e2e8f0" }}>
                          {p.label}
                        </span>
                        {isActive && <span className="font-mono text-[9px]" style={{ color: p.color }}>✓</span>}
                      </div>
                      <p className="font-mono text-[10px] text-slate-500 leading-snug truncate">{p.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Model selector popover — presets first, advanced behind toggle ── */}
        {modelOpen && (
          <div className="absolute bottom-full mb-2 left-0 bg-[#0D0D14] border border-[#2A2A4E] rounded-xl overflow-hidden shadow-2xl z-20 w-80 max-h-[520px] overflow-y-auto">
            <div className="px-3 pt-2.5 pb-1.5 border-b border-[#1A1A2E] sticky top-0 bg-[#0D0D14] z-10">
              <span className="font-mono text-[10px] text-slate-600 tracking-widest">CHOOSE A MODE</span>
            </div>

            {/* Use-case presets — single-column row list. Each preset is one
                line: icon + label on the left, terse description and credit
                cost on the right. Tier accent shows as a 2px left bar on the
                active row instead of a full card outline; way less ink than
                the previous 2×3 card grid + the whole popover collapses to
                about half the height. The Code placeholder still appears as
                a muted row so the roadmap stays visible. */}
            <div className="py-1.5">
              {MODEL_PRESETS.map(p => {
                const isActive = activePreset?.id === p.id;
                const tierMeta = ALL_TIERS.find(t => t.id === p.tier);
                const accent   = tierMeta?.color ?? "#4FC3F7";
                return (
                  <button key={p.id}
                    onClick={() => {
                      setChatTier(p.tier);
                      if (typeof p.webSearch === "boolean") setWebSearch(p.webSearch);
                      setModelOpen(false);
                      textareaRef.current?.focus();
                    }}
                    className="w-full text-left flex items-center gap-2.5 px-3 py-2 hover:bg-white/[0.02] transition-colors relative"
                    style={isActive ? { background: `${accent}0a` } : undefined}>
                    {/* Active indicator bar */}
                    {isActive && (
                      <span aria-hidden className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r"
                            style={{ background: accent, boxShadow: `0 0 8px ${accent}80` }} />
                    )}
                    <span className="text-base shrink-0 w-5 text-center">{p.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-[12px] font-bold" style={{ color: isActive ? accent : "#e2e8f0" }}>
                          {p.label}
                        </span>
                        {isActive && (
                          <span className="font-mono text-[9px]" style={{ color: accent }}>✓</span>
                        )}
                      </div>
                      <p className="font-mono text-[10px] text-slate-500 leading-snug truncate">{p.desc}</p>
                    </div>
                    {tierMeta && (
                      <span className="font-mono text-[10px] shrink-0" style={{ color: accent }}>
                        {tierMeta.credits}<span className="text-slate-700"> cr</span>
                      </span>
                    )}
                  </button>
                );
              })}

              {/* Roadmap placeholder — Code preset coming when a code-tuned
                  model lands. Non-interactive row, muted styling. */}
              <div className="w-full text-left flex items-center gap-2.5 px-3 py-2 opacity-50 cursor-default select-none">
                <span className="text-base shrink-0 w-5 text-center">🛠️</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[12px] font-bold text-slate-500">Code</span>
                    <span className="font-mono text-[9px] text-slate-700">coming soon</span>
                  </div>
                  <p className="font-mono text-[10px] text-slate-600 leading-snug truncate">Solidity · viem · Foundry</p>
                </div>
                <span className="font-mono text-[10px] text-slate-700 shrink-0">tbd</span>
              </div>
            </div>

            {/* Tiny footnote — the raw model list used to live behind an
                "Advanced" toggle here; the presets now cover every active
                model 1:1 so the toggle was pure noise. Bankr / Venice
                badges are still surfaced inside each preset card. */}
            <div className="px-3 py-1.5 border-t border-[#1A1A2E]">
              <p className="font-mono text-[9px] text-slate-700 leading-relaxed">
                Bankr {BANKR_TIERS.length} · Venice {VENICE_TIERS.length} · Privacy {PRIVACY_TIERS.length} · Each preset maps to one model.
              </p>
            </div>
          </div>
        )}

        {/* ── File chips ───────────────────────────────────────────────────── */}
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {pendingFiles.map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-[10px]"
                style={{ borderColor: "#4FC3F730", background: "#4FC3F708", color: "#94A3B8" }}
              >
                <span>{f.mimeType.startsWith("image/") ? "🖼" : f.name.endsWith(".pdf") ? "📄" : "📎"}</span>
                <span className="max-w-[120px] truncate">{f.name}</span>
                <span className="text-slate-600">({(f.size / 1024).toFixed(0)}KB)</span>
                <button onClick={() => setPendingFiles(pendingFiles.filter((_, j) => j !== i))} className="ml-0.5 text-slate-600 hover:text-red-400">×</button>
              </div>
            ))}
          </div>
        )}

        {/* ── Active command badge ─────────────────────────────────────────── */}
        {activeCmdDef && !cmdMenu && (
          <div className="flex items-center gap-2 mb-2 px-1">
            <span className="font-mono text-[10px] text-[#4FC3F7] border border-[#4FC3F7]/30 bg-[#4FC3F7]/5 px-2 py-0.5 rounded">
              {activeCmdDef.icon} /{activeCmdDef.cmd} · {activeCmdDef.label}
            </span>
            <span className="font-mono text-[10px] text-slate-600">{activeCmdDef.hint}</span>
          </div>
        )}

        {/* ── Out-of-credits upgrade card ──────────────────────────────── */}
        {outOfCredits && (
          <div className="mb-2 rounded-xl border border-[#F59E0B20] bg-[#F59E0B06] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#F59E0B15]">
              <div className="flex items-center gap-2">
                <span className="text-xs">⚡</span>
                <span className="font-mono text-[11px] font-bold text-[#F59E0B]">Out of credits</span>
                <span className="font-mono text-[10px] text-slate-600">
                  {credits} left · need {cost}/msg
                </span>
              </div>
              <button
                onClick={() => setBuyOpen(true)}
                className="font-mono text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all"
                style={{ background: "#F59E0B18", color: "#F59E0B", border: "1px solid #F59E0B30" }}
              >
                Buy BLUE →
              </button>
            </div>
            <div className="flex items-center gap-4 px-4 py-2">
              {/* Current tier */}
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: holderTier.color }} />
                <span className="font-mono text-[10px]" style={{ color: holderTier.color }}>{holderTier.tier}</span>
                <span className="font-mono text-[10px] text-slate-600">
                  {holderTier.dailyCr === -1 ? "∞" : holderTier.dailyCr} cr/day
                </span>
              </div>
              {/* Arrow + next tier */}
              {holderTier.nextTier && (
                <>
                  <span className="font-mono text-[10px] text-slate-700">→</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-slate-400 font-bold">{holderTier.nextTier.name}</span>
                    <span className="font-mono text-[10px] text-slate-600">
                      {holderTier.nextTier.dailyCr === -1 ? "∞" : holderTier.nextTier.dailyCr} cr/day
                    </span>
                    <span className="font-mono text-[9px] text-slate-700">
                      (+{(holderTier.nextTier.need / 1_000_000).toFixed(1)}M BLUE)
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        {error && !outOfCredits && (
          <p className="font-mono text-xs mb-2 px-1 text-red-400">{error}</p>
        )}

        {/* ── Hidden file input ────────────────────────────────────────────── */}
        <input
          ref={fileInputRef}
          id="blue-chat-file-input"
          type="file"
          className="hidden"
          multiple
          accept=".sol,.ts,.tsx,.js,.jsx,.py,.rs,.go,.md,.txt,.json,.yaml,.yml,.toml,.pdf,.png,.jpg,.jpeg,.gif,.webp"
          onChange={e => handleFiles(e.target.files)}
        />

        {/* ── Main input card ──────────────────────────────────────────────── */}
        <div
          className="rounded-2xl border transition-colors overflow-hidden"
          style={{ background: "#0D0D14", borderColor: outOfCredits ? "#EF444430" : "#1E1E30" }}
        >
          {/* Textarea row */}
          <div className="flex items-end gap-2 px-4 pt-3.5 pb-3">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => handleInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={outOfCredits ? "No credits — get more $BLUEAGENT" : "Message Blue Agent… or / for commands"}
              rows={1}
              disabled={streaming || outOfCredits}
              className="flex-1 resize-none bg-transparent outline-none font-mono text-sm text-white placeholder:text-slate-700 leading-relaxed"
              style={{ maxHeight: 160, overflowY: "auto" }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 160) + "px";
              }}
            />
            {/* Send / Stop */}
            {streaming ? (
              <button
                onClick={stop}
                className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center bg-[#EF444415] border border-[#EF444430] text-red-400 hover:bg-[#EF444425] transition-all font-mono text-xs"
              >■</button>
            ) : (
              <button
                onClick={() => send(input)}
                disabled={(!input.trim() && pendingFiles.length === 0) || outOfCredits}
                className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center font-bold transition-all disabled:opacity-25"
                style={{ background: activeTier.color, color: "#050508" }}
              >↑</button>
            )}
          </div>

          {/* Toolbar row */}
          <div className="flex items-center gap-1.5 px-3 pb-2.5 pt-1 border-t border-[#1A1A2E]/60">

            {/* Attach file — plus icon */}
            <label
              htmlFor="blue-chat-file-input"
              className="flex items-center justify-center w-7 h-7 rounded-lg cursor-pointer transition-all border"
              style={pendingFiles.length > 0
                ? { color: "#4FC3F7", background: "#4FC3F710", borderColor: "#4FC3F730" }
                : { color: "#64748b", borderColor: "transparent" }}
              title="Attach file"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4v16m8-8H4" />
              </svg>
            </label>

            {/* Persona selector pill — surfaces the active expert role so it's
                visible in the chat tab (not just buried in Settings) and lets
                the user switch inline. Mirrors the model pill pattern. */}
            <button
              onMouseDown={(e) => { e.preventDefault(); setPersonaOpen(!personaOpen); setModelOpen(false); setCmdOpen(false); }}
              className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg border font-mono text-[11px] font-medium transition-all"
              style={{ color: activePersona.color, background: `${activePersona.color}10`, borderColor: `${activePersona.color}30` }}
              title={`Persona: ${activePersona.label}`}
            >
              <span className="text-[11px] leading-none">{activePersona.icon}</span>
              <span className="hidden sm:inline">{activePersona.label}</span>
              <svg className="w-2.5 h-2.5 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Model selector pill */}
            <button
              onMouseDown={(e) => { e.preventDefault(); setModelOpen(!modelOpen); setCmdOpen(false); setPersonaOpen(false); }}
              className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg border font-mono text-[11px] font-medium transition-all"
              style={{ color: activeTier.color, background: `${activeTier.color}10`, borderColor: `${activeTier.color}30` }}
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: activeTier.color }} />
              {activeTier.label}
              {activeTier.badge && <span className="text-[8px] opacity-60">{activeTier.badge}</span>}
              <svg className="w-2.5 h-2.5 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Commands button */}
            <button
              onMouseDown={(e) => { e.preventDefault(); setCmdOpen(!cmdOpen); setModelOpen(false); setPersonaOpen(false); }}
              className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg border font-mono text-[11px] transition-all"
              style={cmdOpen
                ? { color: "#4FC3F7", background: "#4FC3F710", borderColor: "#4FC3F730" }
                : { color: "#475569", borderColor: "transparent" }}
              title="Commands"
            >
              <span className="text-[11px]">/</span>
              <span className="hidden sm:inline">Cmds</span>
            </button>

            {/* Web search toggle */}
            <button
              onMouseDown={(e) => { e.preventDefault(); setWebSearch(!webSearch); }}
              className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg border font-mono text-[11px] transition-all"
              style={webSearch
                ? { color: "#34D399", background: "#34D39910", borderColor: "#34D39930" }
                : { color: "#475569", borderColor: "transparent" }}
              title={webSearch ? "Web search ON" : "Web search OFF"}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              <span className="hidden sm:inline">{webSearch ? "Search on" : "Search"}</span>
            </button>

            <div className="flex-1" />

            <span className="font-mono text-[10px] text-slate-700">{cost}cr/msg</span>
          </div>

          {/* Footer hint */}
          <div className="flex items-center justify-between px-3 pb-2.5">
            <span className="font-mono text-[10px] text-slate-700">Enter ↵ send · Shift+Enter newline</span>
            <span className="font-mono text-[10px] text-slate-700">{credits} credits left</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ModelGroup sub-component retired alongside the Advanced submenu — the
// preset grid in the main popover handles every model now.
