"use client";
import { useRef, useCallback, useState, useEffect } from "react";
import { useChat } from "../ChatContext";
import { creditCost } from "@/lib/credits";
import { useLang } from "@/lib/i18n/context";
import type { Attachment } from "../types";

// The V1 preset spec + dispatch helper moved to the leaf module `./presets`
// so ChatContext can read them without importing this component (which imports
// ChatContext → cycle). Imported here for the picker's own use, and re-exported
// so existing callers that import them from `./ChatInput` (e.g. ModelsPanel)
// keep resolving.
import { VIRTUALS_PRESETS_V1, formatContextTokens, normalizeChatTier, type VirtualsPresetV1 } from "./presets";
export { VIRTUALS_PRESETS_V1, resolvePresetDispatch, formatContextTokens } from "./presets";
export type { VirtualsPresetV1 } from "./presets";
import ProviderMark from "./ProviderMark";
import { isVeniceTeeModelId, type TeeAttestationEvidence } from "@/lib/venice-privacy";
import { generateAttestationNonce } from "@/lib/venice-e2ee";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const TEXT_EXTS = new Set([
  "sol", "ts", "tsx", "js", "jsx", "py", "rs", "go",
  "md", "txt", "json", "yaml", "yml", "toml", "env",
  "html", "css", "sh", "bash", "zsh",
]);

interface SlashCommand {
  cmd: string; icon: string; label: string; hint: string; example: string;
}

// Slash commands are natural language now — only 3 utility commands remain.
// /skill is handled client-side in ChatContext.tsx.
const SLASH_COMMANDS: SlashCommand[] = [
  { cmd: "skill",   icon: "📦", label: "Skill Packs", hint: "install / list / remove GitHub skill packs",      example: "/skill install owner/repo" },
];

export interface ModelTier {
  id: string; label: string;
  // No `model`. It had ZERO readers (both `modelId={…}` reads below take the
  // LIVE VirtualsPresetV1 record, not a tier), and it held three ids Virtuals
  // has never listed — `deepseek-v4-flash`, `claude-fable-5`,
  // `e2ee-gemma-3-27b-p`. Same reasoning as the `"bankr"` group member below:
  // a dead field keeps stale model ids in every grep of this file and reads
  // like a live model choice. scripts/model-id-check.ts now fails if any model
  // id is minted outside the three declaration sites, so re-adding a literal
  // here is caught rather than argued about.
  color: string; badge: string; note: string;
  // A "bankr" member sat in this union, justified as "a legacy alias so
  // localStorage state written by older clients still round-trips". MEASURED
  // 2026-09-25: that justification was false. `ModelTier` types a static
  // in-code table, nothing deserializes a ModelTier out of storage, and `group`
  // has ZERO readers anywhere in src/ — no row even sets it to "bankr". The
  // alias protected nothing and kept a dead provider in every grep of this file.
  group: "venice" | "privacy" | "virtuals";
  credits: number; // cost per msg
}

// User-facing model list — locked at 5 active models (one per preset).
// The previous 14-model raw menu has been retired in favour of preset-only
// selection. The cost-lookup tables in /lib/credits.ts and /lib/credit-
// pricing.ts keep all 14 IDs around so legacy chatTier values cached in
// localStorage still resolve to a price; the ChatContext bootstrap below
// starts on DEFAULT_CHAT_PRESET ("balanced", presets.ts) and the picker maps
// any unknown ID through normalizeChatTier, so it never lands on a model that
// doesn't exist in the UI any more.

// ⚠️ LEGACY COSMETIC TABLE — renamed from `BANKR_TIERS` on 2026-09-18. It never
// described Bankr by then and Bankr has been 403-banned since 2026-07-20, but
// the name kept a dead provider alive in every grep of this file.
//
// What is actually READ off these rows is narrow: `color` and `badge` for the
// collapsed picker pill, plus `label` as a last-resort fallback. `credits` is
// DEAD — nothing reads it. The `model` field was also dead and is now GONE
// (2026-09-26): it said `anthropic-claude-sonnet-5` on all six rows here and
// three never-listed ids in the two tables below, all of it a stale copy left
// from when the picker collapsed to a single Virtuals model. The live per-preset
// model comes from VIRTUALS_PRESETS (server-side `getModelLabel` was fixed the
// same day for exactly this reason — it had copied the same constant).
//
// `label`/`note` still SAY "Sonnet 5" and that is cosmetic text, not a model id;
// only `fast` maps to a live preset, so these strings describe nothing dispatched.
//
// Only `fast` still matches a live preset id; the other seven presets (free,
// balanced, deep, private, flash, grok, search) miss and take the `[1]` fallback
// below, so this table contributes a colour and nothing more. Kept rather than
// deleted because that fallback is load-bearing for the pill's styling.
export const LEGACY_TIERS: ModelTier[] = [
  { id: "fast",     label: "Sonnet 5 · Fast",   color: "#34D399", badge: "", note: "Sonnet 5 via Virtuals",         group: "virtuals", credits: 10  },
  { id: "pro",      label: "Sonnet 5 · Chat",   color: "#4FC3F7", badge: "", note: "Sonnet 5 via Virtuals",         group: "virtuals", credits: 50  },
  { id: "max",      label: "Sonnet 5 · Deep",   color: "#A78BFA", badge: "", note: "Sonnet 5 via Virtuals (deep)",  group: "virtuals", credits: 200 },
  { id: "deepseek", label: "Sonnet 5 · Long",   color: "#F59E0B", badge: "", note: "Sonnet 5 via Virtuals (long)",  group: "virtuals", credits: 10  },
  { id: "gemini",   label: "Sonnet 5 · Google", color: "#4285F4", badge: "", note: "Sonnet 5 via Virtuals",         group: "virtuals", credits: 20  },
  { id: "kimi",     label: "Sonnet 5 · Kimi",   color: "#06B6D4", badge: "", note: "Sonnet 5 via Virtuals",         group: "virtuals", credits: 20  },
];

export const VENICE_TIERS: ModelTier[] = [
  { id: "venice-deepseek", label: "V4 Flash",   color: "#34D399", badge: "V", note: "Fastest · 1M ctx", group: "venice", credits: 10  },
  { id: "venice-grok",     label: "Grok 4",     color: "#E879F9", badge: "V", note: "X search",         group: "venice", credits: 60  },
  { id: "venice-fable",    label: "Fable 5",    color: "#F472B6", badge: "V", note: "Claude · 1M ctx",   group: "venice", credits: 120 },
];

export const PRIVACY_TIERS: ModelTier[] = [
  { id: "venice-e2ee-gemma", label: "Private Gemma", color: "#6EE7B7", badge: "🔒", note: "E2EE · No logs", group: "privacy", credits: 30 },
];

export const ALL_TIERS: ModelTier[] = [...LEGACY_TIERS, ...VENICE_TIERS, ...PRIVACY_TIERS];

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
 *     trade-fee partnership — Bankr accepts $BLUEAGENT for compute, and we
 *     earn $BLUEAGENT from Bankr trade fees. Closed loop.
 *   - Venice-tier models (Fast, Web Search, Private) are paid in USDC
 *     directly. Cheap enough that the credit price (1 cr = $0.0005)
 *     gives 17-25x margin on DeepSeek Flash / E2EE Gemma.
 *
 * A 6th "🛠️ Code" preset is planned for when a code-specialised model
 * lands; the slot is intentionally left for it.
 */
// All-Bankr lineup (funded by the $BLUEAGENT × Bankr loop). Web search is a
// separate tool (Anthropic web_search server-tool) toggled with 🔍 in the
// composer, so it works on any of these models — no Venice model in the picker.
// Deprecated. The V1 preset spec (`VIRTUALS_PRESETS_V1` above) is the
// source of truth. This array is kept only as a static fallback for
// `activePreset`/label lookups until the catalog fetch resolves — every
// entry maps 1:1 to a V1 preset id so the picker highlight stays sane.
export const MODEL_PRESETS: ModelPreset[] = [
  { id: "fast",     label: "Fast",     desc: "DeepSeek V4 Flash · cheapest, snappy",   icon: "⚡", tier: "fast",     webSearch: false },
  { id: "balanced", label: "Balanced", desc: "Claude Sonnet 5 · default for most work", icon: "💬", tier: "balanced", webSearch: false },
  { id: "deep",     label: "Deep",     desc: "Claude Opus 4.8 · heavy reasoning",       icon: "🔬", tier: "deep",     webSearch: false },
  { id: "private",  label: "Private",  desc: "E2EE · no logs · DeepSeek V4",            icon: "🔒", tier: "private",  webSearch: false },
  { id: "grok",     label: "Grok",     desc: "Grok 4 · 2M context window",              icon: "🧠", tier: "grok",     webSearch: false },
];

export default function ChatInput() {
  const {
    input, setInput, send, stop, streaming, outOfCredits,
    error, notice, credits, cost, chatTier, holderTier, setChatTier,
    cmdMenu, setCmdMenu, cmdFilter, setCmdFilter,
    // `webSearch` / `setWebSearch` intentionally NOT destructured — the toggle
    // that used them is removed (see the comment where it stood). They remain on
    // the context and in the request payload so re-enabling is a small revert.
    strictE2ee, setStrictE2ee,
    pendingFiles, setPendingFiles,
  } = useChat();
  const { t } = useLang();

  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [modelOpen,   setModelOpen]   = useState(false);
  const [cmdOpen,     setCmdOpen]     = useState(false);
  const [attestOpen,  setAttestOpen]  = useState(false);
  const [attestState, setAttestState] = useState<{ loading: boolean; data: TeeAttestationEvidence | null; err: string | null }>({ loading: false, data: null, err: null });

  // Catalog-driven V1 preset list. Starts as the static fallback so the
  // picker renders instantly; the /api/chat/presets fetch then trims
  // anything whose Virtuals model id has disappeared from /v1/models.
  // See `_lib/llm.ts` `getVirtualsCatalog` for the 6h cache + fail-open
  // semantics.
  const [virtualsPresets, setVirtualsPresets] = useState<VirtualsPresetV1[]>(VIRTUALS_PRESETS_V1);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/chat/presets")
      .then((r) => r.ok ? r.json() : null)
      .then((body: { ok?: boolean; presets?: VirtualsPresetV1[] } | null) => {
        if (cancelled) return;
        if (body && body.ok && Array.isArray(body.presets) && body.presets.length > 0) {
          setVirtualsPresets(body.presets);
        }
      })
      .catch(() => { /* fail-open — keep the static fallback */ });
    return () => { cancelled = true; };
  }, []);

  // Reset auto-grown textarea height whenever input is cleared after sending.
  useEffect(() => {
    if (!input && textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input]);

  // Active preset — highlighted in the picker when chatTier === preset.id.
  // V1 preset ids ARE the chatTier values (fast, balanced, deep, private,
  // grok), so the lookup is 1:1. A legacy id highlights what the server runs
  // for it (normalizeChatTier → balanced), never simply the first row.
  const activeVirtualsPreset = virtualsPresets.find(p => p.id === normalizeChatTier(chatTier)) ?? virtualsPresets[0];
  const activePreset = MODEL_PRESETS.find(p => p.id === chatTier);
  const activeTier = ALL_TIERS.find(t => t.id === chatTier) ?? LEGACY_TIERS[1];
  const isVeniceTeeActive = activeVirtualsPreset?.provider === "venice" && isVeniceTeeModelId(activeVirtualsPreset.model);

  async function inspectAttestation() {
    if (!activeVirtualsPreset) return;
    if (attestOpen) { setAttestOpen(false); return; }
    setAttestOpen(true);
    setModelOpen(false);
    setCmdOpen(false);
    setAttestState({ loading: true, data: null, err: null });
    try {
      const nonce = generateAttestationNonce();
      const res = await fetch(`/api/chat/tee-attestation?model=${encodeURIComponent(activeVirtualsPreset.model)}&nonce=${nonce}`);
      const json = (await res.json()) as TeeAttestationEvidence;
      if (!res.ok || !json.ok) {
        setAttestState({ loading: false, data: json, err: json.error ?? `HTTP ${res.status}` });
      } else {
        setAttestState({ loading: false, data: json, err: null });
      }
    } catch (e) {
      setAttestState({ loading: false, data: null, err: e instanceof Error ? e.message : "Attestation lookup failed" });
    }
  }

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
    if (e.key === "Escape") { setCmdMenu(false); setCmdOpen(false); setModelOpen(false); return; }
    if (e.nativeEvent.isComposing || e.repeat) return;
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  }

  function selectCommand(cmd: SlashCommand) {
    const needsArg = !["credits", "help", "pick", "models", "skills", "status"].includes(cmd.cmd);
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
    <div className="border-t border-[#202a3a] bg-[#070b12] px-4 sm:px-6 py-3 flex-shrink-0">
      <div className="max-w-4xl mx-auto relative">

        {/* ── Slash command menu (typed /) ─────────────────────────────────── */}
        {cmdMenu && filteredCmds.length > 0 && (
          <div className="absolute bottom-full mb-2 left-0 right-0 bg-[#0D0D14] border border-[#2A2A4E] rounded-xl overflow-hidden shadow-2xl z-20 max-h-72 overflow-y-auto">
            <div className="px-3 pt-2.5 pb-1.5 border-b border-[#1A1A2E]">
              <span className="font-mono text-[13px] text-slate-600 tracking-widest">COMMANDS</span>
            </div>
            {filteredCmds.map((c) => (
              <button
                key={c.cmd}
                onMouseDown={(e) => { e.preventDefault(); selectCommand(c); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 min-h-[44px] hover:bg-[#1A1A2E] transition-colors text-left group"
              >
                <span className="text-base w-5 text-center shrink-0">{c.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-[#4FC3F7]">/{c.cmd}</span>
                    <span className="font-mono text-xs text-slate-400">{c.label}</span>
                  </div>
                  <span className="font-mono text-[13px] text-slate-600 truncate block">{c.hint}</span>
                </div>
                <span className="font-mono text-[13px] text-slate-700 group-hover:text-slate-500 shrink-0 hidden sm:block">{c.example}</span>
              </button>
            ))}
          </div>
        )}

        {/* ── Commands popover (toolbar button) ───────────────────────────── */}
        {cmdOpen && (
          <div className="absolute bottom-full mb-2 left-0 bg-[#0D0D14] border border-[#2A2A4E] rounded-xl overflow-hidden shadow-2xl z-20 w-72 max-h-80 overflow-y-auto">
            <div className="px-3 pt-2.5 pb-1.5 border-b border-[#1A1A2E]">
              <span className="font-mono text-[13px] text-slate-600 tracking-widest">COMMANDS</span>
            </div>
            {SLASH_COMMANDS.map((c) => (
              <button
                key={c.cmd}
                onMouseDown={(e) => { e.preventDefault(); selectCommand(c); }}
                className="w-full flex items-center gap-3 px-4 py-3 min-h-[44px] hover:bg-[#1A1A2E] transition-colors text-left group"
              >
                <span className="text-sm w-5 text-center shrink-0">{c.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-[13px] text-slate-300 group-hover:text-white">/{c.cmd} · {c.label}</p>
                  <p className="font-mono text-[12px] text-slate-600 truncate">{c.hint}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ── Model selector popover — presets first, advanced behind toggle ── */}
        {modelOpen && (
          <div className="absolute bottom-full mb-2 left-0 bg-[#0D0D14] border border-[#2A2A4E] rounded-xl overflow-hidden shadow-2xl z-20 w-[360px] sm:w-[410px] max-w-[calc(100vw-2rem)] max-h-[min(600px,72vh)] overflow-y-auto">
            <div className="px-3.5 pt-2.5 pb-1.5 border-b border-[#1A1A2E] sticky top-0 bg-[#0D0D14] z-10 flex items-center justify-between">
              <span className="font-mono text-[12px] text-slate-500 tracking-widest">CHOOSE A MODE</span>
              <span className="font-mono text-[11px] text-slate-600">{virtualsPresets.length}/{VIRTUALS_PRESETS_V1.length} live</span>
            </div>

            <div className="py-1">
              {virtualsPresets.map((p, idx) => {
                const isActive = chatTier === p.id;
                const accentByCost: Record<"●" | "●●" | "●●●", string> = {
                  "●":   "#34D399",
                  "●●":  "#4FC3F7",
                  "●●●": "#A78BFA",
                };
                const accent = p.privacy ? "#6EE7B7" : accentByCost[p.cost];
                const prevOptional = virtualsPresets[idx - 1]?.optional === true;
                const showDividerBefore = p.optional && !prevOptional;
                return (
                  <div key={p.id}>
                    {showDividerBefore && (
                      <div className="px-3.5 py-1">
                        <div className="border-t border-[#1A1A2E]" />
                        <p className="font-mono text-[11px] uppercase tracking-wider text-slate-600 pt-1.5">Optional</p>
                      </div>
                    )}
                    <button
                      onClick={() => {
                        setChatTier(p.id);
                        setModelOpen(false);
                        textareaRef.current?.focus();
                      }}
                      className="w-full text-left flex items-center gap-2.5 px-3.5 py-2 hover:bg-white/[0.03] transition-colors relative"
                      style={isActive ? { background: `${accent}0d` } : undefined}
                    >
                      {isActive && (
                        <span aria-hidden className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r"
                              style={{ background: accent, boxShadow: `0 0 8px ${accent}80` }} />
                      )}
                      <ProviderMark modelId={p.model} size={22} className="!rounded-lg shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-nowrap overflow-hidden">
                          <span className="font-mono text-[14px] font-bold whitespace-nowrap shrink-0" style={{ color: isActive ? accent : "#e2e8f0" }}>
                            {p.label}
                          </span>
                          <span className="font-mono text-[12px] tracking-tighter whitespace-nowrap shrink-0" style={{ color: accent }}>{p.cost}</span>
                          <span className="font-mono text-[11px] text-slate-500 whitespace-nowrap shrink-0">{formatContextTokens(p.contextTokens)} ctx</span>
                          {isActive && (
                            <span className="font-mono text-[11px] shrink-0" style={{ color: accent }}>✓</span>
                          )}
                          {p.noTools && (
                            <span
                              title="Chat only — no on-chain or Hub tools"
                              className="font-mono text-[10px] leading-none text-slate-400 border border-[#263249] bg-[#101827] rounded px-1.5 py-0.5 whitespace-nowrap shrink-0"
                            >
                              chat only
                            </span>
                          )}
                        </div>
                        <p className="font-mono text-[12px] text-slate-500 leading-snug truncate mt-0.5">{p.desc}</p>
                      </div>
                      <span className="font-mono text-[12px] whitespace-nowrap shrink-0 pl-2" style={{ color: accent }}>
                        {p.credits === 0
                          ? <span className="font-bold">Free</span>
                          : <>{p.credits}<span className="text-slate-600"> cr</span></>}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="px-3.5 py-1.5 border-t border-[#1A1A2E]">
              <p className="font-mono text-[11px] text-slate-600 leading-relaxed">
                Catalog-driven · ● cheap · ●● mid · ●●● deep
              </p>
            </div>
          </div>
        )}

        {/* ── TEE Attestation Proof popover ────────────────────────────────── */}
        {attestOpen && isVeniceTeeActive && (
          <div className="absolute bottom-full mb-2 left-0 bg-[#0D0D14] border border-[#10B981]/40 rounded-xl overflow-hidden shadow-2xl z-20 w-[340px] sm:w-[400px] p-3.5 font-mono text-[12px]">
            <div className="flex items-center justify-between border-b border-[#1A1A2E] pb-2 mb-2.5">
              <span className="text-[#10B981] font-semibold tracking-wider">TEE ENCLAVE ATTESTATION</span>
              <button type="button" onClick={() => setAttestOpen(false)} className="text-slate-500 hover:text-slate-200">Close</button>
            </div>
            {attestState.loading && <p className="text-slate-400">Fetching fresh hardware quote from Venice…</p>}
            {attestState.err && <p className="text-red-400">{attestState.err}</p>}
            {attestState.data && (
              <div className="space-y-1.5 text-slate-300">
                <div className="flex justify-between gap-2"><span className="text-slate-500">Model</span><span className="truncate">{attestState.data.model}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">TEE Provider</span><span>{attestState.data.teeProvider ?? "—"}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">Nonce Verified</span><span className={attestState.data.nonceMatches ? "text-[#10B981]" : "text-slate-400"}>{attestState.data.nonceMatches === true ? "MATCH" : attestState.data.nonceMatches === false ? "MISMATCH" : "—"}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">Intel TDX Quote</span><span>{attestState.data.hasIntelQuote ? "Present" : "—"}</span></div>
                <div className="flex justify-between gap-2"><span className="text-slate-500">NVIDIA GPU Attestation</span><span>{attestState.data.hasNvidiaPayload ? "Present" : "—"}</span></div>
                {attestState.data.signingKey && (
                  <div className="pt-1 border-t border-[#1A1A2E]">
                    <span className="text-slate-500 block mb-0.5">Enclave Signing Key ({attestState.data.signingAlgo ?? "ecdsa"})</span>
                    <span className="block break-all text-[11px] text-[#6EE7B7]">{attestState.data.signingKey}</span>
                  </div>
                )}
                {attestState.data.intelQuotePreview && (
                  <div className="pt-1">
                    <span className="text-slate-500 block mb-0.5">Quote Preview</span>
                    <span className="block break-all text-[11px] text-slate-400">{attestState.data.intelQuotePreview}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── File chips ───────────────────────────────────────────────────── */}
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {pendingFiles.map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-[13px]"
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
            <span className="font-mono text-[13px] text-[#4FC3F7] border border-[#4FC3F7]/30 bg-[#4FC3F7]/5 px-2 py-0.5 rounded">
              {activeCmdDef.icon} /{activeCmdDef.cmd} · {activeCmdDef.label}
            </span>
            <span className="font-mono text-[13px] text-slate-600">{activeCmdDef.hint}</span>
          </div>
        )}

        {/* ── Out-of-credits upgrade card ──────────────────────────────── */}
        {outOfCredits && (
          <div className="mb-2 rounded-xl border border-[#F59E0B20] bg-[#F59E0B06] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#F59E0B15]">
              <div className="flex items-center gap-2">
                <span className="text-xs">⚡</span>
                <span className="font-mono text-[14px] font-bold text-[#F59E0B]">Out of credits</span>
                <span className="font-mono text-[13px] text-slate-600">
                  {credits} left · need {cost}/msg
                </span>
              </div>
              <span className="font-mono text-[13px] text-slate-500">resets daily</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2">
              {/* Current daily allowance */}
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: holderTier.color }} />
              <span className="font-mono text-[13px]" style={{ color: holderTier.color }}>{holderTier.tier}</span>
              <span className="font-mono text-[13px] text-slate-600">
                {holderTier.dailyCr.toLocaleString()} cr/day · USDC credit packs coming soon
              </span>
            </div>
          </div>
        )}
        {notice && !error && (
          <p className="font-mono text-xs mb-2 px-1 text-[#4FC3F7]">{notice}</p>
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
          className="chat-composer rounded-2xl border transition-colors overflow-hidden"
          style={{ background: "#0e1624", borderColor: outOfCredits ? "#EF444430" : "#2a3850" }}
        >
          {/* Textarea row */}
          <div className="flex items-end gap-2.5 px-4 pt-3 pb-2.5">
            <textarea
              ref={textareaRef}
              id="chat-composer"
              value={input}
              onChange={(e) => handleInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={outOfCredits ? "No credits left — resets daily" : t("chat.placeholder")}
              rows={1}
              disabled={streaming || outOfCredits}
              className="flex-1 resize-none bg-transparent border-0 outline-none focus:outline-none focus-visible:outline-none focus:ring-0 font-mono text-sm text-white placeholder:text-slate-500 leading-6 py-1 min-h-[32px]"
              style={{ outline: "none", boxShadow: "none", maxHeight: 160, overflowY: "auto" }}
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

            {/* Model selector pill */}
            <button
              onMouseDown={(e) => { e.preventDefault(); setModelOpen(!modelOpen); setCmdOpen(false); }}
              className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg border font-mono text-[14px] font-medium transition-all"
              style={{ color: activeTier.color, background: `${activeTier.color}10`, borderColor: `${activeTier.color}30` }}
            >
              {activeVirtualsPreset
                ? <ProviderMark modelId={activeVirtualsPreset.model} size={16} className="!rounded-md !border-0 !bg-transparent" />
                : <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: activeTier.color }} />}
              {/* Show the V1 preset label (Fast / Balanced / Deep / Private / Grok)
                  with its cost dots. Fall back to the legacy static preset
                  or tier label so the collapsed button never shows raw ids. */}
              {activeVirtualsPreset
                ? <>{activeVirtualsPreset.label} <span className="opacity-70">{activeVirtualsPreset.cost}</span></>
                : (activePreset?.label ?? activeTier.label)}
              {activeTier.badge && <span className="text-[11px] opacity-60">{activeTier.badge}</span>}
              <svg className="w-2.5 h-2.5 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Commands button */}
            <button
              onMouseDown={(e) => { e.preventDefault(); setCmdOpen(!cmdOpen); setModelOpen(false); setAttestOpen(false); }}
              className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg border font-mono text-[14px] transition-all"
              style={cmdOpen
                ? { color: "#4FC3F7", background: "#4FC3F710", borderColor: "#4FC3F730" }
                : { color: "#475569", borderColor: "transparent" }}
              title="Commands"
            >
              <span className="text-[14px]">/</span>
              <span className="hidden sm:inline">Cmds</span>
            </button>

            {/* Verify Enclave + Strict E2EE controls (Venice TEE presets only) */}
            {isVeniceTeeActive && (
              <>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); inspectAttestation(); }}
                  className="flex items-center h-7 px-2.5 rounded-lg border font-mono text-[12px] transition-all"
                  style={attestOpen
                    ? { color: "#10B981", background: "#10B98118", borderColor: "#10B98150" }
                    : { color: "#6EE7B7", background: "#10B9810D", borderColor: "#10B98130" }}
                  title="Inspect live hardware TEE attestation from Venice"
                >
                  Verify Enclave
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const nextOn = !strictE2ee;
                    setStrictE2ee(nextOn);
                    if (nextOn && pendingFiles.length > 0) setPendingFiles([]);
                  }}
                  className="flex items-center h-7 px-2.5 rounded-lg border font-mono text-[12px] transition-all"
                  style={strictE2ee
                    ? { color: "#10B981", background: "#10B98120", borderColor: "#10B98160" }
                    : { color: "#94a3b8", background: "transparent", borderColor: "#2a3850" }}
                  title="Client-side secp256k1 + AES-256-GCM encryption to enclave (disables tools, files & memory)"
                >
                  {strictE2ee ? "Strict E2EE: ON" : "Strict E2EE: OFF"}
                </button>
              </>
            )}

            {/* Web search toggle — REMOVED, deliberately, not lost.
                It was a no-op that looked like a feature. Flipping it set
                `webSearch: true` on the request, and the ONLY branch the web
                client can reach is the Virtuals one, where `virtualsAutoSearch`
                is hard-coded `false` and no `web_search` tool is registered. The
                server read the flag and ignored it.
                (The Venice branch does honour it — but `chatTier` comes from
                VIRTUALS_PRESETS_V1, whose ids are fast/balanced/deep/private/
                grok. None start with "venice", and `provider` is derived as
                `chatTier.startsWith("venice") ? "venice" : "virtuals"`, so that
                branch is unreachable from this UI. VENICE_TIERS survives only as
                an `ALL_TIERS.find()` lookup that can never match.)
                That made it worse than merely useless: the button turned green
                and said "Search on", so a user had MORE confidence in an answer
                the model had produced from stale training data. A control that
                raises trust while doing nothing is the exact opposite of what
                this product sells.
                `webSearch` / `setWebSearch` state and the request field are left
                intact on purpose — when a real web_search tool is registered on
                the Virtuals branch, restoring this button is a small revert, not
                a rebuild. */}

            <div className="flex-1" />

            <span className="font-mono text-[13px] text-slate-700">{`${cost}cr/msg`}</span>
          </div>

          {/* Footer hint */}
          <div className="flex items-center justify-between px-3 pb-2.5">
            <span className="hidden md:inline font-mono text-[13px] text-slate-700">Enter ↵ send · Shift+Enter newline</span>
            <span className="font-mono text-[13px] text-slate-700">{`${credits} credits left`}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ModelGroup sub-component retired alongside the Advanced submenu — the
// preset grid in the main popover handles every model now.
