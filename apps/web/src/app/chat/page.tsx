"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

type Tier = "fast" | "pro" | "max";
type Message = { role: "user" | "assistant"; content: string };

const TIERS: { id: Tier; label: string; desc: string; price: string; color: string }[] = [
  { id: "fast", label: "Fast", desc: "Haiku · quick tasks",    price: "$0.01/msg", color: "#64748b" },
  { id: "pro",  label: "Pro",  desc: "Sonnet · default",       price: "$0.05/msg", color: "#4FC3F7" },
  { id: "max",  label: "Max",  desc: "Opus · deep reasoning",  price: "$0.20/msg", color: "#A78BFA" },
];

const STARTERS = [
  "blue idea — I want to build a stablecoin remittance app on Base",
  "blue build — Help me architect an ERC-4337 agent wallet",
  "blue audit — Review my token launch plan for risks",
  "What's the best way to deploy a fair-launch token on Base?",
];

export default function ChatPage() {
  const [tier, setTier]         = useState<Tier>("pro");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef    = useRef<AbortController | null>(null);

  const activeTier = TIERS.find((t) => t.id === tier)!;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(async (text: string) => {
    const userMsg = text.trim();
    if (!userMsg || streaming) return;

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
        body: JSON.stringify({ messages: next, tier }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Error ${res.status}`);
      }

      const reader = res.body!.getReader();
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
            const parsed = JSON.parse(raw);
            const delta = parsed?.delta?.text ?? parsed?.delta?.value ?? "";
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
  }, [messages, streaming, tier]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  }

  function stop()  { abortRef.current?.abort(); }
  function clear() { setMessages([]); setError(null); setInput(""); textareaRef.current?.focus(); }

  const isEmpty = messages.length === 0;

  return (
    <>
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-8 flex flex-col" style={{ minHeight: "calc(100vh - 140px)" }}>

        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <div className="inline-flex items-center gap-2 border border-[#4FC3F7]/20 bg-[#4FC3F7]/5 rounded-full px-3 py-1 mb-2">
              <span className="font-mono text-[10px] text-[#4FC3F7] tracking-widest">CHAT + MODEL PICKER</span>
            </div>
            <h1 className="font-mono font-bold text-2xl text-white">Blue Agent Chat</h1>
          </div>

          {/* Model picker */}
          <div className="flex gap-2 flex-wrap">
            {TIERS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTier(t.id)}
                className="flex flex-col items-start px-4 py-2 rounded-xl transition-all cursor-pointer"
                style={{
                  background: tier === t.id ? `${t.color}18` : "#0D0D14",
                  border: `1.5px solid ${tier === t.id ? t.color : "#1A1A2E"}`,
                }}
              >
                <span className="font-mono text-sm font-bold" style={{ color: tier === t.id ? t.color : "#fff" }}>
                  {t.label}
                </span>
                <span className="font-mono text-xs text-slate-500">{t.price}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Model info strip */}
        <div
          className="font-mono text-xs px-4 py-2 rounded-xl mb-4 flex items-center gap-2"
          style={{ background: `${activeTier.color}10`, border: `1px solid ${activeTier.color}30`, color: activeTier.color }}
        >
          <span className="font-semibold">{activeTier.label}</span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-500">{activeTier.desc}</span>
          {messages.length > 0 && (
            <button onClick={clear} className="ml-auto text-slate-500 hover:text-slate-300 transition-colors">
              Clear
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto rounded-2xl mb-4 bg-[#0D0D14] border border-[#1A1A2E]" style={{ minHeight: 360 }}>
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
                    className="text-left font-mono text-xs px-3 py-2.5 rounded-xl bg-[#050508] border border-[#1A1A2E] text-slate-500 hover:text-[#4FC3F7] hover:border-[#4FC3F7]/30 transition-all"
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

        {error && (
          <p className="font-mono text-xs mb-2 px-1 text-red-400">{error}</p>
        )}

        {/* Input */}
        <div className="flex gap-3 items-end rounded-2xl p-3 bg-[#0D0D14] border border-[#1A1A2E]">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Blue Agent… (Enter to send, Shift+Enter for newline)"
            rows={1}
            disabled={streaming}
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
              disabled={!input.trim()}
              className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-40 bg-[#4FC3F7] text-[#050508] font-bold"
            >
              ↑
            </button>
          )}
        </div>

        <p className="font-mono text-xs text-center mt-3 text-slate-600">
          Powered by Bankr LLM · {activeTier.price} · Base-native context
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
