"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import WalletBar from "@/components/WalletBar";
import {
  TierInfo,
  creditCost,
  BASE_COST,
  ensureCredits,
  getCredits,
  deductCredits,
} from "@/lib/credits";

type ChatTier = "fast" | "pro" | "max";
type Message  = { role: "user" | "assistant"; content: string };

const CHAT_TIERS: { id: ChatTier; label: string; desc: string; color: string }[] = [
  { id: "fast", label: "Fast", desc: "Haiku · quick tasks",   color: "#64748b" },
  { id: "pro",  label: "Pro",  desc: "Sonnet · default",      color: "#4FC3F7" },
  { id: "max",  label: "Max",  desc: "Opus · deep reasoning", color: "#A78BFA" },
];

const STARTERS = [
  "blue idea — I want to build a stablecoin remittance app on Base",
  "blue build — Help me architect an ERC-4337 agent wallet",
  "blue audit — Review my token launch plan for risks",
  "What's the best way to deploy a fair-launch token on Base?",
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

  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef    = useRef<AbortController | null>(null);

  // Init credits on mount
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
  const hasDiscount = holderTier.discount > 0;
  const baseCost    = BASE_COST[chatTier] ?? BASE_COST.pro;

  const send = useCallback(async (text: string) => {
    const userMsg = text.trim();
    if (!userMsg || streaming) return;

    // Credit check
    const currentCredits = getCredits(walletAddr);
    if (currentCredits < cost) {
      setError(`Not enough credits. Need ${cost}, have ${currentCredits}. Get more BLUE → hold more $BLUEAGENT for discounts.`);
      return;
    }

    setError(null);
    const next: Message[] = [...messages, { role: "user", content: userMsg }];
    setMessages(next);
    setInput("");
    setStreaming(true);
    setMessages((m) => [...m, { role: "assistant", content: "" }]);

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

      // Deduct credits after successful response starts
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

  const isEmpty      = messages.length === 0;
  const outOfCredits = credits < cost;
  const activeTier   = CHAT_TIERS.find((t) => t.id === chatTier)!;

  return (
    <>
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8 flex flex-col" style={{ minHeight: "calc(100vh - 140px)" }}>

        {/* Header */}
        <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
          <div>
            <div className="inline-flex items-center gap-2 border border-[#4FC3F7]/20 bg-[#4FC3F7]/5 rounded-full px-3 py-1 mb-2">
              <span className="font-mono text-[10px] text-[#4FC3F7] tracking-widest">BLUE AGENT CHAT</span>
            </div>
            <h1 className="font-mono font-bold text-2xl text-white">Blue Agent Chat</h1>
            <p className="font-mono text-xs text-slate-500 mt-1">AI-native assistant for Base builders</p>
          </div>

          {/* Credit + wallet panel (desktop) */}
          <div className="flex flex-col items-end gap-2">
            {/* Credits display */}
            <div
              className="flex items-center gap-3 px-3 py-2 rounded-xl border font-mono text-xs"
              style={{ background: "#0D0D14", borderColor: credits <= 20 ? "#EF444430" : "#1A1A2E" }}
            >
              <span className="text-slate-500">Credits</span>
              <span
                className="font-bold text-sm"
                style={{ color: credits <= 20 ? "#EF4444" : "#4FC3F7" }}
              >
                {credits}
              </span>
              {holderTier.discount > 0 && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                  style={{ background: `${holderTier.color}20`, color: holderTier.color }}
                >
                  {Math.round(holderTier.discount * 100)}% off
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Model picker */}
        <div className="flex gap-2 flex-wrap mb-4">
          {CHAT_TIERS.map((t) => {
            const c    = creditCost(t.id, holderTier);
            const base = BASE_COST[t.id];
            const disc = hasDiscount && c !== base;
            return (
              <button
                key={t.id}
                onClick={() => setChatTier(t.id)}
                className="flex flex-col items-start px-4 py-2.5 rounded-xl transition-all cursor-pointer"
                style={{
                  background: chatTier === t.id ? `${t.color}18` : "#0D0D14",
                  border: `1.5px solid ${chatTier === t.id ? t.color : "#1A1A2E"}`,
                }}
              >
                <span className="font-mono text-sm font-bold" style={{ color: chatTier === t.id ? t.color : "#fff" }}>
                  {t.label}
                </span>
                <span className="font-mono text-xs text-slate-500">{t.desc}</span>
                <div className="flex items-center gap-1 mt-0.5">
                  {disc && (
                    <span className="font-mono text-[10px] text-slate-600 line-through">{base} cr</span>
                  )}
                  <span className="font-mono text-[10px]" style={{ color: disc ? holderTier.color : "#64748b" }}>
                    {c} cr/msg
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Holder tier hint — if not connected */}
        {!walletAddr && (
          <div
            className="flex items-center justify-between px-4 py-2.5 rounded-xl mb-4 border border-[#F59E0B]/20 bg-[#F59E0B]/5"
          >
            <span className="font-mono text-xs text-[#F59E0B]">
              Hold $BLUEAGENT → get up to 70% off chat credits
            </span>
            <WalletBar onWalletChange={handleWalletChange} />
          </div>
        )}

        {/* Holder tier strip — if connected */}
        {walletAddr && holderTier.tier !== "Explorer" && (
          <div
            className="flex items-center justify-between px-4 py-2 rounded-xl mb-4"
            style={{ background: `${holderTier.color}10`, border: `1px solid ${holderTier.color}30` }}
          >
            <div className="flex items-center gap-2 font-mono text-xs">
              <span
                className="font-bold px-2 py-0.5 rounded text-[11px]"
                style={{ background: `${holderTier.color}20`, color: holderTier.color }}
              >
                {holderTier.tier}
              </span>
              <span className="text-slate-500">·</span>
              <span style={{ color: holderTier.color }}>
                {Math.round(holderTier.discount * 100)}% discount active
              </span>
            </div>
            <span className="font-mono text-[10px] text-slate-600">
              {holderTier.blueBalance.toFixed(0)} BLUE held
            </span>
          </div>
        )}

        {/* Active tier info strip */}
        <div
          className="font-mono text-xs px-4 py-2 rounded-xl mb-4 flex items-center gap-2"
          style={{ background: `${activeTier.color}10`, border: `1px solid ${activeTier.color}30`, color: activeTier.color }}
        >
          <span className="font-semibold">{activeTier.label}</span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-500">{activeTier.desc}</span>
          <span className="text-slate-600">·</span>
          <span>{cost} credits per message</span>
          {messages.length > 0 && (
            <button onClick={clear} className="ml-auto text-slate-500 hover:text-slate-300 transition-colors">
              Clear
            </button>
          )}
        </div>

        {/* Messages */}
        <div
          className="flex-1 overflow-y-auto rounded-2xl mb-4 bg-[#0D0D14] border border-[#1A1A2E]"
          style={{ minHeight: 360 }}
        >
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center h-72 gap-6 px-6">
              <div className="w-12 h-12 rounded-full bg-[#4FC3F7]/10 border border-[#4FC3F7]/20 flex items-center justify-center">
                <div className="glow-dot" />
              </div>
              <p className="font-mono text-sm text-center max-w-sm text-slate-400">
                Ask Blue Agent anything about building on Base — ideas, architecture, contracts, launches.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    disabled={outOfCredits}
                    className="text-left font-mono text-xs px-3 py-2.5 rounded-xl bg-[#050508] border border-[#1A1A2E] text-slate-500 hover:text-[#4FC3F7] hover:border-[#4FC3F7]/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="w-7 h-7 rounded-full flex items-center justify-center mr-2 flex-shrink-0 mt-1 bg-[#4FC3F7]/10 border border-[#4FC3F7]/20">
                      <div className="glow-dot" style={{ width: 8, height: 8 }} />
                    </div>
                  )}
                  <div
                    className="max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap font-mono"
                    style={
                      msg.role === "user"
                        ? { background: "#4FC3F7", color: "#050508", borderRadius: "16px 16px 4px 16px" }
                        : { background: "#1A1A2E", color: "#e2e8f0", border: "1px solid #2A2A4E", borderRadius: "16px 16px 16px 4px" }
                    }
                  >
                    {msg.content || (
                      <span className="flex gap-1 items-center">
                        <Dot delay={0} /><Dot delay={160} /><Dot delay={320} />
                      </span>
                    )}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Out of credits banner */}
        {outOfCredits && (
          <div className="mb-3 px-4 py-3 rounded-xl bg-[#EF444410] border border-[#EF444430] font-mono text-xs text-red-400 flex items-center justify-between gap-3">
            <span>
              Out of credits ({credits} left, need {cost}).{" "}
              {!walletAddr ? "Connect wallet + hold $BLUEAGENT to get more." : "Hold more $BLUEAGENT to earn credits."}
            </span>
            <a
              href={`https://app.uniswap.org/swap?outputCurrency=0xf895783b2931c919955e18b5e3343e7c7c456ba3&chain=base`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 px-3 py-1 rounded-lg text-[#F59E0B] border border-[#F59E0B]/30 hover:bg-[#F59E0B]/10 transition-all"
            >
              Buy BLUE →
            </a>
          </div>
        )}

        {error && !outOfCredits && (
          <p className="font-mono text-xs mb-2 px-1 text-red-400">{error}</p>
        )}

        {/* Input */}
        <div
          className="flex gap-3 items-end rounded-2xl p-3 bg-[#0D0D14] border transition-all"
          style={{ borderColor: outOfCredits ? "#EF444430" : "#1A1A2E" }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              outOfCredits
                ? "No credits — get more $BLUEAGENT to continue chatting"
                : "Ask Blue Agent… (Enter to send, Shift+Enter for newline)"
            }
            rows={1}
            disabled={streaming || outOfCredits}
            className="flex-1 resize-none font-mono text-sm outline-none bg-transparent text-white placeholder:text-slate-600 leading-relaxed"
            style={{ maxHeight: 140, overflowY: "auto" }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 140) + "px";
            }}
          />
          {streaming ? (
            <button
              onClick={stop}
              className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all bg-red-400/10 border border-red-400/30 text-red-400"
            >
              ■
            </button>
          ) : (
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || outOfCredits}
              className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-40 bg-[#4FC3F7] text-[#050508] font-bold"
            >
              ↑
            </button>
          )}
        </div>

        <p className="font-mono text-xs text-center mt-3 text-slate-600">
          Powered by Bankr LLM · {cost} credits/msg
          {hasDiscount && (
            <span style={{ color: holderTier.color }}>
              {" "}· {Math.round(holderTier.discount * 100)}% holder discount
            </span>
          )}
          {" "}·{" "}
          <Link href="/" className="hover:text-slate-400 transition-colors">Base-native</Link>
        </p>
      </main>
      <Footer />
    </>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: "#64748b",
        animation: `pulse 1.2s ${delay}ms ease-in-out infinite`,
      }}
    />
  );
}
