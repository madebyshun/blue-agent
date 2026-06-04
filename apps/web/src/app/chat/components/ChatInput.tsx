"use client";
import { useRef, useCallback } from "react";
import { useChat } from "../ChatContext";
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
  { cmd: "idea",   icon: "💡", label: "Idea Brief",      hint: "Fundable brief — problem, MVP, 24h plan",      example: "/idea <concept>" },
  { cmd: "build",  icon: "🛠️", label: "Architecture",    hint: "Stack, folder structure, key integrations",    example: "/build <project>" },
  { cmd: "audit",  icon: "🛡️", label: "Audit",           hint: "Security + product risk review, GO/NO-GO",    example: "/audit <code or plan>" },
  { cmd: "ship",   icon: "🚀", label: "Ship Checklist",  hint: "Deploy steps, verify, monitor for Base",       example: "/ship <project>" },
  { cmd: "raise",  icon: "💰", label: "Pitch",           hint: "Narrative, ask, target investors",             example: "/raise <project>" },
  { cmd: "pick",   icon: "🎯", label: "Token Pick",      hint: "AI-powered token pick on Base",               example: "/pick" },
  { cmd: "scan",   icon: "🔍", label: "Scan Token",      hint: "Honeypot + risk check before buying",          example: "/scan <token_address>" },
  { cmd: "wallet", icon: "👛", label: "Wallet Analysis", hint: "Analyze on-chain activity and strategy",      example: "/wallet <address>" },
  { cmd: "models", icon: "🤖", label: "Models",          hint: "List all available AI models + credit costs",  example: "/models" },
  { cmd: "skills", icon: "⚡", label: "Skills / Tools",  hint: "List all Hub tools available in chat",         example: "/skills" },
  { cmd: "status", icon: "📡", label: "Status",          hint: "Check Bankr, Venice, and Hub health",          example: "/status" },
  { cmd: "help",   icon: "📖", label: "Help",            hint: "Show all available commands",                  example: "/help" },
];

const BANKR_TIERS = [
  { id: "fast", label: "Fast",   model: "Haiku",  color: "#64748b" },
  { id: "pro",  label: "Pro",    model: "Sonnet", color: "#4FC3F7" },
  { id: "max",  label: "Max",    model: "Opus",   color: "#A78BFA" },
];
const VENICE_TIERS = [
  { id: "venice-deepseek", label: "V4 Flash",   model: "DeepSeek", color: "#34D399", badge: "V", note: "1M ctx" },
  { id: "venice-grok",     label: "Grok 4",     model: "xAI",      color: "#E879F9", badge: "V", note: "X search" },
  { id: "venice-uncut",    label: "Uncensored", model: "Venice",   color: "#FB923C", badge: "V", note: "No filter" },
  { id: "venice-mistral",  label: "Mistral",    model: "Mistral",  color: "#60A5FA", badge: "V", note: "256K ctx" },
];
const ALL_TIERS = [...BANKR_TIERS, ...VENICE_TIERS];

export default function ChatInput() {
  const {
    input, setInput, send, stop, streaming, outOfCredits,
    error, credits, cost, chatTier, holderTier, setChatTier,
    cmdMenu, setCmdMenu, cmdFilter, setCmdFilter,
    setBuyOpen, webSearch, setWebSearch, pendingFiles, setPendingFiles,
  } = useChat();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList) return;
    const newFiles: Attachment[] = [];

    for (const file of Array.from(fileList)) {
      if (file.size > MAX_FILE_SIZE) {
        alert(`${file.name} is too large (max 10MB)`);
        continue;
      }
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const isText = TEXT_EXTS.has(ext) || file.type.startsWith("text/");

      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        if (isText) {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsText(file);
        } else {
          reader.onload = () => {
            const result = reader.result as string;
            // strip data:...;base64, prefix
            resolve(result.split(",")[1] ?? result);
          };
          reader.readAsDataURL(file);
        }
        reader.onerror = reject;
      });

      newFiles.push({ name: file.name, mimeType: file.type || "application/octet-stream", size: file.size, data, isText });
    }

    if (newFiles.length) setPendingFiles([...pendingFiles, ...newFiles]);
    // reset input so same file can be re-attached
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [pendingFiles, setPendingFiles]);

  const activeTier = ALL_TIERS.find(t => t.id === chatTier) ?? BANKR_TIERS[1];

  const filteredCmds = SLASH_COMMANDS.filter(c =>
    !cmdFilter || c.cmd.startsWith(cmdFilter) || c.label.toLowerCase().includes(cmdFilter)
  );

  const activeCmd    = input.match(/^\/(\w+)/)?.[1]?.toLowerCase();
  const activeCmdDef = SLASH_COMMANDS.find(c => c.cmd === activeCmd);

  function handleInput(val: string) {
    setInput(val);
    if (val.startsWith("/")) {
      const filter = val.slice(1).toLowerCase();
      setCmdFilter(filter);
      setCmdMenu(true);
    } else {
      setCmdMenu(false);
      setCmdFilter("");
    }
  }

  function selectCommand(cmd: SlashCommand) {
    const needsArg = !["pick", "help", "models", "skills", "status"].includes(cmd.cmd);
    const newVal = needsArg ? `/${cmd.cmd} ` : `/${cmd.cmd}`;
    setInput(newVal);
    setCmdMenu(false);
    setCmdFilter("");
    textareaRef.current?.focus();
    if (!needsArg) {
      setTimeout(() => send(`/${cmd.cmd}`), 50);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") { setCmdMenu(false); return; }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  }

  return (
    <div className="border-t border-[#1A1A2E] bg-[#050508] px-4 sm:px-6 py-4 flex-shrink-0">
      <div className="max-w-3xl mx-auto relative">

        {/* Slash command menu */}
        {cmdMenu && filteredCmds.length > 0 && (
          <div className="absolute bottom-full mb-2 left-0 right-0 bg-[#0D0D14] border border-[#2A2A4E] rounded-xl overflow-hidden shadow-2xl z-10 max-h-72 overflow-y-auto">
            <div className="px-3 pt-2.5 pb-1.5 border-b border-[#1A1A2E]">
              <span className="font-mono text-[10px] text-slate-600 tracking-widest">COMMANDS</span>
            </div>
            {filteredCmds.map((c) => (
              <button
                key={c.cmd}
                onMouseDown={(e) => { e.preventDefault(); selectCommand(c); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#1A1A2E] transition-colors text-left group"
              >
                <span className="text-base w-5 text-center">{c.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-[#4FC3F7]">/{c.cmd}</span>
                    <span className="font-mono text-xs text-slate-400">{c.label}</span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-600 truncate block">{c.hint}</span>
                </div>
                <span className="font-mono text-[10px] text-slate-700 group-hover:text-slate-500 shrink-0">{c.example}</span>
              </button>
            ))}
          </div>
        )}

        {/* Active command badge */}
        {activeCmdDef && !cmdMenu && (
          <div className="flex items-center gap-2 mb-2 px-1">
            <span className="font-mono text-[10px] text-[#4FC3F7] border border-[#4FC3F7]/30 bg-[#4FC3F7]/5 px-2 py-0.5 rounded">
              {activeCmdDef.icon} /{activeCmdDef.cmd} · {activeCmdDef.label}
            </span>
            <span className="font-mono text-[10px] text-slate-600">{activeCmdDef.hint}</span>
          </div>
        )}

        {/* Mobile: tier picker */}
        <div className="lg:hidden flex gap-1.5 mb-3 flex-wrap">
          {ALL_TIERS.map((t) => {
            const c = creditCost(t.id, holderTier);
            const badge = (t as { badge?: string }).badge;
            return (
              <button
                key={t.id}
                onClick={() => setChatTier(t.id)}
                className="font-mono text-xs px-2.5 py-1 rounded-lg transition-all border"
                style={chatTier === t.id
                  ? { color: t.color, background: `${t.color}10`, borderColor: `${t.color}40` }
                  : { color: "#475569", borderColor: "transparent" }}
              >
                {t.label}
                {badge && <span className="ml-0.5 text-[8px] opacity-60">{badge}</span>}
                <span className="ml-1 opacity-50">{c}cr</span>
              </button>
            );
          })}
          <span className="font-mono text-[10px] text-slate-600 ml-auto self-center">{credits} cr</span>
        </div>

        {/* Out-of-credits banner */}
        {outOfCredits && (
          <div className="mb-3 px-4 py-2.5 rounded-xl bg-[#EF444410] border border-[#EF444430] font-mono text-xs text-red-400 flex items-center justify-between gap-3">
            <span>Out of credits ({credits} left, need {cost}).</span>
            <button
              onClick={() => setBuyOpen(true)}
              className="flex-shrink-0 text-[#F59E0B] hover:underline"
            >
              Buy BLUE →
            </button>
          </div>
        )}

        {/* Error */}
        {error && !outOfCredits && (
          <p className="font-mono text-xs mb-2 px-1 text-red-400">{error}</p>
        )}

        {/* File attachment chips */}
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
                <button
                  onClick={() => setPendingFiles(pendingFiles.filter((_, j) => j !== i))}
                  className="ml-0.5 text-slate-600 hover:text-red-400 transition-colors"
                >×</button>
              </div>
            ))}
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept=".sol,.ts,.tsx,.js,.jsx,.py,.rs,.go,.md,.txt,.json,.yaml,.yml,.toml,.pdf,.png,.jpg,.jpeg,.gif,.webp"
          onChange={e => handleFiles(e.target.files)}
        />

        {/* Input box */}
        <div
          className="flex gap-3 items-end rounded-xl px-4 py-3 border transition-colors"
          style={{ background: "#0D0D14", borderColor: outOfCredits ? "#EF444430" : "#2A2A4E" }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={outOfCredits ? "No credits — get more $BLUEAGENT" : "Message Blue Agent… or type / for commands"}
            rows={1}
            disabled={streaming || outOfCredits}
            className="flex-1 resize-none bg-transparent outline-none font-mono text-sm text-white placeholder:text-slate-600 leading-relaxed"
            style={{ maxHeight: 160, overflowY: "auto" }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 160) + "px";
            }}
          />
          {!streaming && (
            <>
              {/* Slash commands */}
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleInput("/");
                  setCmdMenu(true);
                  textareaRef.current?.focus();
                }}
                className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center font-mono text-sm text-slate-500 hover:text-[#4FC3F7] hover:bg-[#4FC3F7]/5 transition-all border border-transparent hover:border-[#4FC3F7]/20"
                title="Slash commands"
              >
                /
              </button>

              {/* Attach file */}
              <button
                onMouseDown={(e) => { e.preventDefault(); fileInputRef.current?.click(); }}
                className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all border"
                style={pendingFiles.length > 0
                  ? { color: "#4FC3F7", background: "#4FC3F710", borderColor: "#4FC3F730" }
                  : { color: "#475569", borderColor: "transparent" }}
                title="Attach file (.sol, .ts, .pdf, image…)"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                    d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              </button>

              {/* Web search toggle — Venice models only */}
              <button
                onMouseDown={(e) => { e.preventDefault(); setWebSearch(!webSearch); }}
                className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all border"
                style={webSearch
                  ? { color: "#34D399", background: "#34D39910", borderColor: "#34D39930" }
                  : { color: "#475569", borderColor: "transparent" }}
                title={webSearch ? "Web search ON (Venice only)" : "Enable web search (Venice models)"}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                    d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
              </button>
            </>
          )}
          {streaming ? (
            <button
              onClick={stop}
              className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-[#EF444415] border border-[#EF444430] text-red-400 hover:bg-[#EF444425] transition-all font-mono text-xs"
            >
              ■
            </button>
          ) : (
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || outOfCredits}
              className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-bold transition-all disabled:opacity-30"
              style={{ background: "#4FC3F7", color: "#050508" }}
            >
              ↑
            </button>
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center justify-between mt-2 px-1">
          <span className="font-mono text-[10px] text-slate-700 flex items-center gap-2">
            Enter ↵ send · Shift+Enter newline · <span className="text-slate-600">/ commands</span>
            {webSearch && (
              <span className="font-mono text-[9px] px-1.5 py-0.5 rounded" style={{ color: "#34D399", background: "#34D39912", border: "1px solid #34D39930" }}>
                🌐 web search on
              </span>
            )}
          </span>
          <span className="font-mono text-[10px] text-slate-700">
            {cost} credits/msg · {activeTier.label}
            {(activeTier as { badge?: string }).badge && (
              <span className="ml-1 opacity-60">{(activeTier as { badge?: string }).badge}</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
