"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  TierInfo,
  creditCost,
  BASE_COST,
  ensureCredits,
  getCredits,
  deductCredits,
} from "@/lib/credits";
import WalletBar from "@/components/WalletBar";

type ChatTier = "fast" | "pro" | "max";
type Message  = { role: "user" | "assistant"; content: string };

const CHAT_TIERS: { id: ChatTier; label: string; model: string; color: string }[] = [
  { id: "fast", label: "Fast",  model: "Haiku",  color: "#64748b" },
  { id: "pro",  label: "Pro",   model: "Sonnet", color: "#4FC3F7" },
  { id: "max",  label: "Max",   model: "Opus",   color: "#A78BFA" },
];

const STARTERS = [
  { icon: "💡", text: "I want to build a USDC streaming payroll app on Base" },
  { icon: "🛠️", text: "Help me architect an ERC-4337 agent wallet" },
  { icon: "🛡️", text: "Audit my token launch plan for risks" },
  { icon: "🚀", text: "How do I deploy a fair-launch token on Base?" },
];

const EXPLORER_TIER: TierInfo = {
  tier: "Explorer", blueBalance: 0, discount: 0, color: "#475569",
};

export default function ChatPage() {
  const [chatTier,   setChatTier]   = useState<ChatTier>("pro");
  const [holderTier, setHolderTier] = useState<TierInfo>(EXPLORER_TIER);
  const [walletAddr, setWalletAddr] = useState<string | undefined>();
  const [credits,    setCredits]    = useState(0);
  const [messages,   setMessages]   = useState<Message[]>([]);
  const [input,      setInput]      = useState("");
  const [streaming,  setStreaming]  = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef    = useRef<AbortController | null>(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("blue_wallet") : null;
    const cr = ensureCredits(saved ?? undefined);
    setCredits(cr);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleWalletChange = useCallback((addr: string | undefined, tier: TierInfo) => {
    setWalletAddr(addr);
    setHolderTier(tier);
    const cr = ensureCredits(addr);
    setCredits(cr);
  }, []);

  const cost = creditCost(chatTier, holderTier);
  const outOfCredits = credits < cost;
  const activeTier = CHAT_TIERS.find((t) => t.id === chatTier)!;

  const send = useCallback(async (text: string) => {
    const userMsg = text.trim();
    if (!userMsg || streaming) return;

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
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, tier: chatTier }),
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
            const parsed = JSON.parse(raw) as { delta?: { text?: string; value?: string } };
            const delta  = parsed?.delta?.text ?? parsed?.delta?.value ?? "";
            if (delta) {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return [...prev.slice(0, -1), { role: "assistant", content: last.content + delta }];
                }
                return prev;
              });
            }
          } catch {}
        }
      }
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
  function clear() { setMessages([]); setError(null); setInput(""); textareaRef.current?.focus(); }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-screen bg-[#050508] text-white overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────── */}
      <aside className={`
        fixed lg:relative inset-y-0 left-0 z-40 flex flex-col
        w-64 bg-[#0A0A12] border-r border-[#1A1A2E]
        transition-transform duration-200
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}>
        {/* Logo */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-[#1A1A2E]">
          <Link href="/" className="flex items-center gap-2">
            <div className="glow-dot" />
            <span className="font-mono font-semibold text-sm text-white tracking-widest">
              BLUE<span className="text-[#4FC3F7]">AGENT</span>
            </span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-slate-600 hover:text-white"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* New chat */}
        <div className="px-3 py-3 border-b border-[#1A1A2E]">
          <button
            onClick={clear}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg font-mono text-xs text-slate-400 hover:text-white hover:bg-[#1A1A2E] transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New chat
          </button>
        </div>

        {/* Model picker */}
        <div className="px-3 py-4 border-b border-[#1A1A2E]">
          <p className="font-mono text-[10px] text-slate-600 tracking-widest px-1 mb-2">MODEL</p>
          <div className="flex flex-col gap-1">
            {CHAT_TIERS.map((t) => {
              const c = creditCost(t.id, holderTier);
              const isActive = chatTier === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setChatTier(t.id)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg transition-all text-left ${
                    isActive
                      ? "bg-[#1A1A2E] text-white"
                      : "text-slate-500 hover:text-slate-300 hover:bg-[#1A1A2E]/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: isActive ? t.color : "#374151" }}
                    />
                    <span className="font-mono text-sm font-medium">{t.label}</span>
                    <span className="font-mono text-[10px] text-slate-600">{t.model}</span>
                  </div>
                  <span
                    className="font-mono text-[10px]"
                    style={{ color: isActive ? t.color : "#374151" }}
                  >
                    {c} cr
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Credits */}
        <div className="px-3 py-4 border-b border-[#1A1A2E]">
          <p className="font-mono text-[10px] text-slate-600 tracking-widest px-1 mb-2">CREDITS</p>
          <div className="px-3 py-2 rounded-lg bg-[#050508] border border-[#1A1A2E]">
            <div className="flex items-baseline justify-between">
              <span
                className="font-mono text-xl font-bold"
                style={{ color: credits <= 20 ? "#EF4444" : "#4FC3F7" }}
              >
                {credits}
              </span>
              <span className="font-mono text-xs text-slate-600">credits</span>
            </div>
            {holderTier.discount > 0 && (
              <div
                className="font-mono text-[10px] mt-1"
                style={{ color: holderTier.color }}
              >
                {Math.round(holderTier.discount * 100)}% holder discount active
              </div>
            )}
            {credits <= 20 && (
              <a
                href={`https://app.uniswap.org/swap?outputCurrency=0xf895783b2931c919955e18b5e3343e7c7c456ba3&chain=base`}
                target="_blank"
                rel="noopener noreferrer"
                className="block font-mono text-[10px] text-[#F59E0B] hover:underline mt-1"
              >
                Get more BLUE →
              </a>
            )}
          </div>
        </div>

        {/* Wallet */}
        <div className="px-3 py-4 mt-auto border-t border-[#1A1A2E]">
          <p className="font-mono text-[10px] text-slate-600 tracking-widest px-1 mb-2">WALLET</p>
          <WalletBar onWalletChange={handleWalletChange} />
          {holderTier.tier !== "Explorer" && (
            <div
              className="mt-2 px-3 py-1.5 rounded-lg font-mono text-xs"
              style={{ background: `${holderTier.color}15`, color: holderTier.color, border: `1px solid ${holderTier.color}25` }}
            >
              {holderTier.tier} · {holderTier.blueBalance.toFixed(0)} BLUE
            </div>
          )}
        </div>
      </aside>

      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Main ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top bar (mobile only) */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1A1A2E] lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-slate-400 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-mono text-sm font-semibold text-white">Blue Agent</span>
          <span
            className="font-mono text-xs px-2 py-1 rounded"
            style={{ background: `${activeTier.color}20`, color: activeTier.color }}
          >
            {activeTier.label}
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {isEmpty ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full px-4 py-16 gap-8">
              <div>
                <div className="w-16 h-16 rounded-2xl bg-[#4FC3F7]/10 border border-[#4FC3F7]/20 flex items-center justify-center mx-auto mb-4">
                  <div className="glow-dot" style={{ width: 12, height: 12 }} />
                </div>
                <h1 className="font-mono text-2xl font-bold text-white text-center mb-2">Blue Agent</h1>
                <p className="font-mono text-sm text-slate-500 text-center max-w-sm">
                  AI-native assistant for Base builders. Ask anything — ideas, code, audits, launches.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
                {STARTERS.map((s) => (
                  <button
                    key={s.text}
                    onClick={() => send(s.text)}
                    disabled={outOfCredits}
                    className="text-left px-4 py-3 rounded-xl bg-[#0D0D14] border border-[#1A1A2E] hover:border-[#4FC3F7]/30 hover:bg-[#1A1A2E]/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed group"
                  >
                    <div className="text-lg mb-1">{s.icon}</div>
                    <div className="font-mono text-xs text-slate-400 group-hover:text-slate-300 leading-relaxed">{s.text}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Messages */
            <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-4 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-full bg-[#4FC3F7]/10 border border-[#4FC3F7]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <div className="glow-dot" style={{ width: 8, height: 8 }} />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] px-4 py-3 rounded-2xl font-mono text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-[#1A1A2E] text-slate-200 rounded-tr-sm"
                        : "text-slate-300 rounded-tl-sm"
                    }`}
                    style={msg.role === "user" ? {} : {}}
                  >
                    {msg.content || (
                      <span className="flex gap-1 items-center">
                        <Dot delay={0} /><Dot delay={160} /><Dot delay={320} />
                      </span>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="w-8 h-8 rounded-full bg-[#1A1A2E] border border-[#2A2A4E] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="font-mono text-xs text-slate-400">you</span>
                    </div>
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* ── Input bar ─────────────────────────────── */}
        <div className="border-t border-[#1A1A2E] bg-[#050508] px-4 py-4">
          <div className="max-w-3xl mx-auto">
            {/* Error / out of credits */}
            {outOfCredits && (
              <div className="mb-3 px-4 py-2.5 rounded-xl bg-[#EF444410] border border-[#EF444430] font-mono text-xs text-red-400 flex items-center justify-between gap-3">
                <span>Out of credits ({credits} left, need {cost}).</span>
                <a
                  href={`https://app.uniswap.org/swap?outputCurrency=0xf895783b2931c919955e18b5e3343e7c7c456ba3&chain=base`}
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
              className="flex gap-3 items-end rounded-2xl px-4 py-3 border transition-colors"
              style={{
                background: "#0D0D14",
                borderColor: outOfCredits ? "#EF444430" : "#2A2A4E",
              }}
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={outOfCredits ? "No credits — get more $BLUEAGENT" : "Message Blue Agent…"}
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
              {streaming ? (
                <button
                  onClick={stop}
                  className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-[#EF444415] border border-[#EF444430] text-red-400 hover:bg-[#EF444425] transition-all"
                >
                  ■
                </button>
              ) : (
                <button
                  onClick={() => send(input)}
                  disabled={!input.trim() || outOfCredits}
                  className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center font-bold transition-all disabled:opacity-30"
                  style={{ background: "#4FC3F7", color: "#050508" }}
                >
                  ↑
                </button>
              )}
            </div>

            <div className="flex items-center justify-between mt-2 px-1">
              <span className="font-mono text-[10px] text-slate-700">
                Enter to send · Shift+Enter for newline
              </span>
              <span className="font-mono text-[10px] text-slate-700">
                {cost} credits/msg · {activeTier.label} ({activeTier.model})
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
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
