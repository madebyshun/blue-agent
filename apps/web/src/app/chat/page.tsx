"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import WalletBar from "@/components/WalletBar";
import {
  TierInfo,
  creditCost,
  getCredits,
  deductCredits,
  getNextRefresh,
  refreshCreditsIfNeeded,
  getDailyCr,
} from "@/lib/credits";
import {
  buildMemoryContext,
  updateMemoryAfterChat,
  getMemory,
  clearMemory,
} from "@/lib/memory";

// ─── Chat persistence ─────────────────────────────────────────────────────────
const chatKey = (addr?: string) => `blue_chat_v1_${addr ?? "guest"}`;

// ─── Countdown helper ─────────────────────────────────────────────────────────
function formatCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

type ChatTier = string;
type ToolLog  = { tool: string; status: "running" | "done"; ms?: number };
type Message  = { role: "user" | "assistant"; content: string; toolLogs?: ToolLog[] };

interface TierConfig {
  id:        string;
  label:     string;
  model:     string;
  color:     string;
  provider:  "bankr" | "venice";
  modelId?:  string;
  badge?:    string;
  note?:     string;
}

const BANKR_TIERS: TierConfig[] = [
  { id: "fast", label: "Fast",   model: "Haiku",  color: "#64748b", provider: "bankr" },
  { id: "pro",  label: "Pro",    model: "Sonnet", color: "#4FC3F7", provider: "bankr" },
  { id: "max",  label: "Max",    model: "Opus",   color: "#A78BFA", provider: "bankr" },
];

const VENICE_TIERS: TierConfig[] = [
  { id: "venice-deepseek", label: "V4 Flash",   model: "DeepSeek", color: "#34D399", provider: "venice", modelId: "deepseek-v4-flash",              badge: "VENICE", note: "Fast · 1M ctx" },
  { id: "venice-grok",     label: "Grok 4",     model: "xAI",      color: "#E879F9", provider: "venice", modelId: "grok-4-3",                        badge: "VENICE", note: "X search · crypto" },
  { id: "venice-uncut",    label: "Uncensored", model: "Venice",   color: "#FB923C", provider: "venice", modelId: "venice-uncensored-1-2",           badge: "VENICE", note: "No filter" },
  { id: "venice-mistral",  label: "Mistral",    model: "Mistral",  color: "#60A5FA", provider: "venice", modelId: "mistral-small-3-2-24b-instruct", badge: "VENICE", note: "256K ctx" },
];

const ALL_TIERS = [...BANKR_TIERS, ...VENICE_TIERS];

const STARTERS = [
  { icon: "💡", text: "/idea USDC streaming payroll app on Base" },
  { icon: "🛠️", text: "/build ERC-4337 agent wallet" },
  { icon: "🛡️", text: "/audit my token launch plan" },
  { icon: "🚀", text: "/pick" },
];

// ─── Slash commands ───────────────────────────────────────────────────────────

interface SlashCommand {
  cmd:     string;
  icon:    string;
  label:   string;
  hint:    string;
  example: string;
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

const EXPLORER_TIER: TierInfo = {
  tier: "Explorer", blueBalance: 0, dailyCr: 150, discount: 0, color: "#475569",
};

export default function ChatPage() {
  const [chatTier,    setChatTier]    = useState<ChatTier>("pro");
  const [holderTier,  setHolderTier]  = useState<TierInfo>(EXPLORER_TIER);
  const [walletAddr,  setWalletAddr]  = useState<string | undefined>();
  const [credits,     setCredits]     = useState(0);
  const [messages,    setMessages]    = useState<Message[]>([]);
  const [input,       setInput]       = useState("");
  const [streaming,   setStreaming]   = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [cmdMenu,     setCmdMenu]     = useState(false);
  const [cmdFilter,   setCmdFilter]   = useState("");
  const [shareId,     setShareId]     = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [countdown,   setCountdown]   = useState("");

  // Daily refresh on wallet/balance change
  useEffect(() => {
    if (typeof window === "undefined") return;
    const result = refreshCreditsIfNeeded(holderTier.blueBalance, walletAddr);
    setCredits(result.credits);
  }, [walletAddr, holderTier.blueBalance]);

  // Countdown timer — update every 60s
  useEffect(() => {
    function tick() {
      const next = getNextRefresh(walletAddr);
      setCountdown(formatCountdown(next - Date.now()));
    }
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [walletAddr]);

  // Chat persistence — load
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(chatKey(walletAddr));
    if (saved) {
      try { setMessages(JSON.parse(saved) as Message[]); } catch { /* ignore */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddr]);

  // Chat persistence — save
  useEffect(() => {
    if (typeof window === "undefined" || messages.length === 0) return;
    localStorage.setItem(chatKey(walletAddr), JSON.stringify(messages));
  }, [messages, walletAddr]);

  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef    = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleWalletChange = useCallback((addr: string | undefined, tier: TierInfo) => {
    setWalletAddr(addr);
    setHolderTier(tier);
  }, []);

  const cost         = creditCost(chatTier, holderTier);
  const isUnlimited  = holderTier.dailyCr === -1 && !!walletAddr;
  const daily        = getDailyCr(holderTier, !!walletAddr);
  const outOfCredits = !isUnlimited && credits < cost;
  const activeTier = ALL_TIERS.find((t) => t.id === chatTier) ?? BANKR_TIERS[1];;

  // ── Client-side command handlers (no credits, no API call) ──────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  function handleClientCommand(userMsg: string): boolean {
    const match = userMsg.match(/^\/(\w+)(?:\s+(.*))?$/s);
    if (!match) return false;
    const cmd  = match[1].toLowerCase();
    const _args = (match[2] ?? "").trim();

    let reply = "";

    if (cmd === "models") {
      reply = `## 🤖 Available Models\n\n### BANKR · Claude\n${BANKR_TIERS.map(t => {
        const c = creditCost(t.id, holderTier);
        return `**${t.label}** (${t.model}) — ${c} credits/msg`;
      }).join("\n")}\n\n### VENICE · Privacy-first\n${VENICE_TIERS.map(t => {
        const c = creditCost(t.id, holderTier);
        return `**${t.label}** (${t.model}) — ${c} credits/msg · ${t.note ?? ""}`;
      }).join("\n")}\n\nSelect a model in the sidebar. Venice requires VENICE_API_KEY to be configured.`;
    }

    else if (cmd === "skills" || cmd === "tools") {
      const groups: Record<string, string[]> = {
        "📈 Market Intel":   ["token-pick-signal","narrative-position","whale-copy-signal","token-momentum-scanner","community-sentiment"],
        "🔍 Due Diligence":  ["deep-analysis","honeypot-check","risk-gate","contract-trust","protocol-risk-monitor"],
        "🏗️ Builder Tools":  ["market-fit","competitor-scan","gtm-brief","stack-recommender","repo-health","builder-score"],
        "💰 Fundraise":      ["investor-memo","fundraise-timing","pitch-intelligence","base-grant-finder"],
        "🚀 Launch":         ["token-launch-readiness","launch-advisor","token-distribution-plan","agent-token-strategy"],
        "🤝 Agent Network":  ["agent-collab-match","multi-agent-workflow","agent-revenue-optimizer","base-builder-network-match"],
        "🌐 Ecosystem":      ["ecosystem-digest","base-protocol-comparison","defi-opportunity","wallet-strategy-analyzer"],
      };
      const lines = Object.entries(groups).map(([cat, tools]) =>
        `**${cat}**\n${tools.map(t => `  /${t}`).join(" · ")}`
      ).join("\n\n");
      reply = `## ⚡ Hub Skills — ${Object.values(groups).flat().length} Tools\n\nAll tools are callable from Blue Chat via Hub tool routing.\nTrigger them naturally in conversation or use slash commands for direct access.\n\n${lines}\n\nFull catalog → [blueagent.dev/hub](/hub)`;
    }

    else if (cmd === "status") {
      // Show loading then fetch
      const userEntry: Message = { role: "user", content: userMsg };
      const loadingEntry: Message = { role: "assistant", content: "📡 Checking services…" };
      setMessages(prev => [...prev, userEntry, loadingEntry]);
      setCmdMenu(false);
      setInput("");

      fetch("/api/status")
        .then(r => r.json())
        .then((data: { status: string; ts: string; services: Array<{ name: string; ok: boolean; latency: number | null; detail: string }> }) => {
          const icon = data.status === "operational" ? "✅" : "⚠️";
          const lines = data.services.map((s: { name: string; ok: boolean; latency: number | null; detail: string }) =>
            `${s.ok ? "✅" : "❌"} **${s.name}** — ${s.detail}${s.latency != null ? ` (${s.latency}ms)` : ""}`
          ).join("\n");
          const statusReply = `## ${icon} System Status · ${data.status.toUpperCase()}\n\n${lines}\n\n_Checked at ${new Date(data.ts).toLocaleTimeString()}_`;
          setMessages(prev => [...prev.slice(0, -1), { role: "assistant", content: statusReply }]);
        })
        .catch(e => {
          setMessages(prev => [...prev.slice(0, -1), { role: "assistant", content: `❌ Status check failed: ${(e as Error).message}` }]);
        });
      return true;
    }

    else {
      return false; // not a client-side command
    }

    if (reply) {
      setMessages(prev => [
        ...prev,
        { role: "user",      content: userMsg },
        { role: "assistant", content: reply   },
      ]);
      setCmdMenu(false);
      setInput("");
    }
    return true;
  }

  const send = useCallback(async (text: string) => {
    const userMsg = text.trim();
    if (!userMsg || streaming) return;

    // Handle client-side commands first (no credits consumed)
    if (handleClientCommand(userMsg)) return;

    const currentCredits = getCredits(walletAddr);
    if (currentCredits < cost) {
      setError(`Not enough credits. Need ${cost}, have ${currentCredits}.`);
      return;
    }

    setError(null);
    const next: Message[] = [...messages, { role: "user", content: userMsg }];
    setMessages(next);
    setInput("");
    setStreaming(true);
    setMessages((m) => [...m, { role: "assistant", content: "" }]);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    abortRef.current = new AbortController();

    try {
      const memoryContext = buildMemoryContext(walletAddr);

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next,
          tier: chatTier,
          provider: activeTier.provider,
          ...(activeTier.modelId ? { modelId: activeTier.modelId } : {}),
          ...(memoryContext ? { memoryContext } : {}),
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? `Error ${res.status}`);
      }

      const remaining = deductCredits(cost, walletAddr);
      setCredits(remaining);

      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break;
          try {
            const parsed = JSON.parse(raw) as {
              type?: string; tool?: string; ms?: number;
              delta?: { text?: string; value?: string };
            };

            if (parsed.type === "tool_start") {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  const logs = [...(last.toolLogs ?? []), { tool: parsed.tool!, status: "running" as const }];
                  return [...prev.slice(0, -1), { ...last, toolLogs: logs }];
                }
                return prev;
              });
            } else if (parsed.type === "tool_done") {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  const logs = (last.toolLogs ?? []).map((l) =>
                    l.tool === parsed.tool ? { ...l, status: "done" as const, ms: parsed.ms } : l
                  );
                  return [...prev.slice(0, -1), { ...last, toolLogs: logs }];
                }
                return prev;
              });
            } else {
              const delta = parsed?.delta?.text ?? parsed?.delta?.value ?? "";
              if (delta) {
                setMessages((prev) => {
                  const last = prev[prev.length - 1];
                  if (last?.role === "assistant") {
                    return [...prev.slice(0, -1), { ...last, content: last.content + delta }];
                  }
                  return prev;
                });
              }
            }
          } catch {}
        }
      }

      // Update persistent memory
      setMessages((prev) => {
        const lastAssistant = prev[prev.length - 1];
        if (lastAssistant?.role === "assistant" && lastAssistant.content) {
          updateMemoryAfterChat(walletAddr, userMsg, lastAssistant.content);
        }
        return prev;
      });

    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError") {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setMessages((prev) => prev.slice(0, -1));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      textareaRef.current?.focus();
    }
  }, [messages, streaming, chatTier, walletAddr, cost]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  }

  function stop()  { abortRef.current?.abort(); }
  function clear() {
    setMessages([]); setError(null); setInput(""); setCmdMenu(false); setShareId(null);
    if (typeof window !== "undefined") localStorage.removeItem(chatKey(walletAddr));
    textareaRef.current?.focus();
  }

  async function shareConversation() {
    if (!messages.length) return;
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
      const { id } = await res.json() as { id: string };
      setShareId(id);
      const url = `${window.location.origin}/chat?s=${id}`;
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch { /* ignore */ }
  }

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
    const needsArg = !["pick", "help"].includes(cmd.cmd);
    setInput(needsArg ? `/${cmd.cmd} ` : `/${cmd.cmd}`);
    setCmdMenu(false);
    textareaRef.current?.focus();
    // If it's a standalone command, send immediately
    if (!needsArg) {
      setTimeout(() => send(`/${cmd.cmd}`), 50);
    }
  }

  const filteredCmds = SLASH_COMMANDS.filter(c =>
    !cmdFilter || c.cmd.startsWith(cmdFilter) || c.label.toLowerCase().includes(cmdFilter)
  );

  // Detect active command from current input
  const activeCmd = input.match(/^\/(\w+)/)?.[1]?.toLowerCase();
  const activeCmdDef = SLASH_COMMANDS.find(c => c.cmd === activeCmd);

  const isEmpty = messages.length === 0;
  const memory  = getMemory(walletAddr);
  const hasMemory = !!(memory.currentProject || memory.commandHistory.length > 0);

  return (
    <>
      <Navbar />
      <div className="flex bg-[#050508] font-mono pt-16 h-screen overflow-hidden">

        {/* ── Sidebar ──────────────────────────────────── */}
        <aside className="hidden lg:flex flex-col w-72 shrink-0 border-r border-[#1A1A2E] h-full">

          {/* Header */}
          <div className="px-5 pt-6 pb-4 border-b border-[#1A1A2E]">
            <p className="font-mono text-xs text-[#4FC3F7] tracking-widest">// BLUE CHAT</p>
          </div>

          {/* New chat + Share */}
          <div className="px-3 py-3 border-b border-[#1A1A2E] flex gap-1">
            <button
              onClick={clear}
              className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg font-mono text-xs text-slate-400 hover:text-white hover:bg-[#1A1A2E] transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New
            </button>
            {messages.length > 0 && (
              <button
                onClick={shareConversation}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-mono text-xs transition-all"
                style={shareCopied
                  ? { color: "#34D399", background: "#34D39915" }
                  : { color: "#64748b" }}
                title="Share conversation"
              >
                {shareCopied ? "✓ Copied" : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                )}
              </button>
            )}
          </div>

          {/* Model picker */}
          <div className="px-3 py-4 border-b border-[#1A1A2E]">
            {/* Bankr / Claude */}
            <p className="font-mono text-[10px] text-slate-600 tracking-widest px-2 mb-2">MODEL · BANKR</p>
            <div className="flex flex-col gap-0.5 mb-3">
              {BANKR_TIERS.map((t) => {
                const c = creditCost(t.id, holderTier);
                const isActive = chatTier === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setChatTier(t.id)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg transition-all text-left ${
                      isActive
                        ? "bg-[#4FC3F7]/5 text-white border-l-2 border-[#4FC3F7]"
                        : "text-slate-500 hover:text-white hover:bg-[#0D0D1A] border-l-2 border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: isActive ? t.color : "#374151" }} />
                      <span className="font-mono text-sm">{t.label}</span>
                      <span className="font-mono text-[10px] text-slate-600">{t.model}</span>
                    </div>
                    <span className="font-mono text-[10px]" style={{ color: isActive ? t.color : "#374151" }}>
                      {c} cr
                    </span>
                  </button>
                );
              })}
            </div>
            {/* Venice models */}
            <div className="flex items-center gap-2 px-2 mb-2">
              <p className="font-mono text-[10px] text-slate-600 tracking-widest">MODEL · VENICE</p>
              <span className="font-mono text-[8px] text-[#34D399] border border-[#34D399]/30 px-1 py-0.5 rounded">PRIVACY</span>
            </div>
            <div className="flex flex-col gap-0.5">
              {VENICE_TIERS.map((t) => {
                const c = creditCost(t.id, holderTier);
                const isActive = chatTier === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setChatTier(t.id)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg transition-all text-left ${
                      isActive
                        ? "text-white border-l-2"
                        : "text-slate-500 hover:text-white hover:bg-[#0D0D1A] border-l-2 border-transparent"
                    }`}
                    style={isActive ? { background: `${t.color}08`, borderLeftColor: t.color } : {}}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: isActive ? t.color : "#374151" }} />
                      <span className="font-mono text-sm">{t.label}</span>
                      {t.note && <span className="font-mono text-[9px] text-slate-700">{t.note}</span>}
                    </div>
                    <span className="font-mono text-[10px]" style={{ color: isActive ? t.color : "#374151" }}>
                      {c} cr
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Credits */}
          <div className="px-3 py-4 border-b border-[#1A1A2E]">
            <div className="flex items-center justify-between px-2 mb-2">
              <p className="font-mono text-[10px] text-slate-600 tracking-widest">CREDITS</p>
              <span className="font-mono text-[9px] px-1.5 py-0.5 rounded"
                style={{ color: holderTier.color, background: `${holderTier.color}15`, border: `1px solid ${holderTier.color}25` }}>
                {holderTier.tier}
              </span>
            </div>
            <div className="mx-1 px-3 py-2.5 rounded-lg bg-[#050508] border border-[#1A1A2E]">
              {/* Balance */}
              <div className="flex items-baseline justify-between mb-1">
                <span className="font-mono text-xl font-bold"
                  style={{ color: isUnlimited ? holderTier.color : credits <= 20 ? "#EF4444" : "#4FC3F7" }}>
                  {isUnlimited ? "∞" : credits.toLocaleString()}
                </span>
                {!isUnlimited && (
                  <span className="font-mono text-[10px] text-slate-600">/ {daily.toLocaleString()} today</span>
                )}
              </div>
              {/* Progress bar */}
              {!isUnlimited && daily > 0 && (
                <div className="h-0.5 bg-[#1A1A2E] rounded-full overflow-hidden mb-1.5">
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, (credits / daily) * 100)}%`, background: holderTier.color }} />
                </div>
              )}
              {/* Reset countdown */}
              <div className="font-mono text-[9px] text-slate-600">
                resets in {countdown}
              </div>
              {/* Discount badge */}
              {holderTier.discount > 0 && (
                <div className="font-mono text-[9px] mt-1" style={{ color: holderTier.color }}>
                  {Math.round(holderTier.discount * 100)}% discount on Hub tools
                </div>
              )}
              {/* Low credits CTA */}
              {!isUnlimited && credits <= 30 && (
                <a href="https://app.uniswap.org/swap?outputCurrency=0xf895783b2931c919955e18b5e3343e7c7c456ba3&chain=base"
                  target="_blank" rel="noopener noreferrer"
                  className="block font-mono text-[10px] text-[#F59E0B] hover:underline mt-1.5">
                  Hold more $BLUEAGENT →
                </a>
              )}
            </div>
            {/* Next tier hint */}
            {holderTier.nextTier && (
              <p className="font-mono text-[9px] text-slate-700 px-2 mt-1.5">
                {holderTier.nextTier.need.toLocaleString()} more BLUE →{" "}
                <span style={{ color: holderTier.color }}>
                  {holderTier.nextTier.dailyCr === -1 ? "∞" : holderTier.nextTier.dailyCr.toLocaleString()} cr/day
                </span>
              </p>
            )}
          </div>

          {/* Memory */}
          {hasMemory && (
            <div className="px-3 py-4 border-b border-[#1A1A2E]">
              <div className="flex items-center justify-between px-2 mb-2">
                <p className="font-mono text-[10px] text-slate-600 tracking-widest">MEMORY</p>
                <button
                  onClick={() => { clearMemory(walletAddr); }}
                  className="font-mono text-[10px] text-slate-700 hover:text-red-400 transition-colors"
                >
                  clear
                </button>
              </div>
              <div className="mx-1 px-3 py-2 rounded-lg bg-[#050508] border border-[#1A1A2E] space-y-1">
                {memory.currentProject && (
                  <div>
                    <span className="font-mono text-[10px] text-slate-600">project · </span>
                    <span className="font-mono text-[10px] text-[#4FC3F7]">{memory.currentProject.name}</span>
                    {memory.currentProject.stage && (
                      <span className="font-mono text-[10px] text-slate-600"> · {memory.currentProject.stage}</span>
                    )}
                  </div>
                )}
                {memory.commandHistory.length > 0 && (
                  <div>
                    <span className="font-mono text-[10px] text-slate-600">last · </span>
                    <span className="font-mono text-[10px] text-slate-400">blue {memory.commandHistory[0].command}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Wallet */}
          <div className="px-3 py-4 mt-auto border-t border-[#1A1A2E]">
            <p className="font-mono text-[10px] text-slate-600 tracking-widest px-2 mb-2">WALLET</p>
            <WalletBar onWalletChange={handleWalletChange} />
            {holderTier.tier !== "Explorer" && (
              <div
                className="mt-2 mx-1 px-3 py-1.5 rounded-lg font-mono text-xs"
                style={{ background: `${holderTier.color}15`, color: holderTier.color, border: `1px solid ${holderTier.color}25` }}
              >
                {holderTier.tier} · {holderTier.blueBalance.toFixed(0)} BLUE
              </div>
            )}
          </div>
        </aside>

        {/* ── Main ─────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 h-full">

          {/* Page hero */}
          {isEmpty && (
            <div className="text-center pt-16 pb-10 px-8 border-b border-[#1A1A2E]">
              <div className="inline-flex items-center gap-2 border border-[#4FC3F7]/20 bg-[#4FC3F7]/5 rounded-full px-4 py-1.5 mb-5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
                <span className="font-mono text-[10px] text-[#4FC3F7] tracking-widest">BLUE CHAT</span>
              </div>
              <h1 className="font-mono text-3xl sm:text-4xl font-bold text-white tracking-tight mb-3">
                Chat with <span className="text-[#4FC3F7]">Blue Agent</span>
              </h1>
              <p className="font-mono text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
                AI-native assistant for Base builders. Ask anything — ideas, code, audits, launches.
              </p>

              {/* Starter grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl mx-auto mt-8">
                {STARTERS.map((s) => (
                  <button
                    key={s.text}
                    onClick={() => send(s.text)}
                    disabled={outOfCredits}
                    className="text-left px-4 py-3 rounded-xl bg-[#0D0D14] border border-[#1A1A2E] hover:border-[#4FC3F7]/30 hover:bg-[#1A1A2E]/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed group"
                  >
                    <div className="text-base mb-1">{s.icon}</div>
                    <div className="font-mono text-xs text-slate-400 group-hover:text-slate-300 leading-relaxed">{s.text}</div>
                  </button>
                ))}
              </div>

              {/* Commands quick ref */}
              <div className="flex flex-wrap justify-center gap-2 mt-5 max-w-lg mx-auto">
                {SLASH_COMMANDS.slice(0, 7).map((c) => (
                  <button
                    key={c.cmd}
                    onClick={() => { const needsArg = !["pick","help"].includes(c.cmd); if (needsArg) { setInput(`/${c.cmd} `); textareaRef.current?.focus(); } else { send(`/${c.cmd}`); } }}
                    disabled={outOfCredits}
                    className="font-mono text-[11px] px-2.5 py-1 rounded-lg border border-[#1A1A2E] text-slate-600 hover:text-[#4FC3F7] hover:border-[#4FC3F7]/30 transition-all disabled:opacity-30"
                  >
                    /{c.cmd}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto">
            {!isEmpty && (
              <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex gap-4 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    {msg.role === "assistant" && (
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ background: `${activeTier.color}15`, border: `1px solid ${activeTier.color}30` }}
                      >
                        <div className="w-2 h-2 rounded-full" style={{ background: activeTier.color }} />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-2xl font-mono text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-[#1A1A2E] text-slate-200 rounded-tr-sm px-4 py-3 whitespace-pre-wrap"
                          : "text-slate-300 rounded-tl-sm"
                      }`}
                    >
                      {/* Tool execution logs */}
                      {msg.role === "assistant" && msg.toolLogs && msg.toolLogs.length > 0 && (
                        <div className="flex flex-col gap-0.5 mb-2 px-1">
                          {msg.toolLogs.map((log, j) => (
                            <div key={j} className="flex items-center gap-2 text-[11px]">
                              <span className={log.status === "running" ? "text-[#4FC3F7] animate-spin" : "text-[#34D399]"}>
                                {log.status === "running" ? "◌" : "✓"}
                              </span>
                              <span className={log.status === "running" ? "text-[#4FC3F7] animate-pulse" : "text-slate-500"}>
                                {log.tool.replace("hub_", "")}
                              </span>
                              {log.ms !== undefined && (
                                <span className="text-slate-700">{(log.ms / 1000).toFixed(1)}s</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Message content */}
                      {msg.role === "assistant" ? (
                        <div className="px-1 py-1 whitespace-pre-wrap">
                          {msg.content || (
                            <span className="flex gap-1 items-center">
                              <Dot delay={0} /><Dot delay={160} /><Dot delay={320} />
                            </span>
                          )}
                        </div>
                      ) : (
                        msg.content
                      )}
                    </div>
                    {msg.role === "user" && (
                      <div className="w-7 h-7 rounded-full bg-[#1A1A2E] border border-[#2A2A4E] flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="font-mono text-[10px] text-slate-400">you</span>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* ── Input bar ────────────────────────────────── */}
          <div className="border-t border-[#1A1A2E] bg-[#050508] px-6 py-4">
            <div className="max-w-3xl mx-auto relative">

              {/* Command autocomplete menu */}
              {cmdMenu && filteredCmds.length > 0 && (
                <div className="absolute bottom-full mb-2 left-0 right-0 bg-[#0D0D14] border border-[#2A2A4E] rounded-xl overflow-hidden shadow-2xl z-10">
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
              <div className="lg:hidden flex gap-2 mb-3 flex-wrap">
                {ALL_TIERS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setChatTier(t.id)}
                    className={`font-mono text-xs px-3 py-1.5 rounded-lg transition-all border ${
                      chatTier === t.id
                        ? "border-opacity-30"
                        : "text-slate-500 hover:text-white border-transparent"
                    }`}
                    style={chatTier === t.id
                      ? { color: t.color, background: `${t.color}10`, borderColor: `${t.color}40` }
                      : {}}
                  >
                    {t.label}
                    {t.badge && <span className="ml-1 text-[8px] opacity-60">V</span>}
                  </button>
                ))}
                <span className="font-mono text-[10px] text-slate-600 ml-auto self-center">{credits} cr</span>
              </div>

              {outOfCredits && (
                <div className="mb-3 px-4 py-2.5 rounded-xl bg-[#EF444410] border border-[#EF444430] font-mono text-xs text-red-400 flex items-center justify-between gap-3">
                  <span>Out of credits ({credits} left, need {cost}).</span>
                  <a
                    href="https://app.uniswap.org/swap?outputCurrency=0xf895783b2931c919955e18b5e3343e7c7c456ba3&chain=base"
                    target="_blank" rel="noopener noreferrer"
                    className="flex-shrink-0 text-[#F59E0B] hover:underline"
                  >
                    Buy BLUE →
                  </a>
                </div>
              )}
              {error && !outOfCredits && (
                <p className="font-mono text-xs mb-2 px-1 text-red-400">{error}</p>
              )}

              <div
                className="flex gap-3 items-end rounded-xl px-4 py-3 border transition-colors"
                style={{
                  background: "#0D0D14",
                  borderColor: outOfCredits ? "#EF444430" : "#2A2A4E",
                }}
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
                  <button
                    onMouseDown={(e) => { e.preventDefault(); handleInput("/"); setCmdMenu(true); textareaRef.current?.focus(); }}
                    className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center font-mono text-sm text-slate-500 hover:text-[#4FC3F7] hover:bg-[#4FC3F7]/5 transition-all border border-transparent hover:border-[#4FC3F7]/20"
                    title="Slash commands"
                  >
                    /
                  </button>
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

              <div className="flex items-center justify-between mt-2 px-1">
                <span className="font-mono text-[10px] text-slate-700">
                  Enter ↵ send · Shift+Enter newline · <span className="text-slate-600">/ commands</span>
                </span>
                <span className="font-mono text-[10px] text-slate-700">
                  {cost} credits/msg · {activeTier.label} ({activeTier.model})
                  {activeTier.badge && (
                    <span className="ml-1" style={{ color: activeTier.color }}>· {activeTier.badge}</span>
                  )}
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}


function Dot({ delay }: { delay: number }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 6, height: 6,
        borderRadius: "50%",
        background: "#475569",
        animation: `pulse 1.2s ${delay}ms ease-in-out infinite`,
      }}
    />
  );
}
