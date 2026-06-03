"use client";
import { useEffect, useRef } from "react";
import { useChat } from "../ChatContext";

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

const STARTERS = [
  { icon: "💡", text: "/idea USDC streaming payroll app on Base" },
  { icon: "🛠️", text: "/build ERC-4337 agent wallet" },
  { icon: "🛡️", text: "/audit my token launch plan" },
  { icon: "🚀", text: "/pick" },
];

const QUICK_CMDS = ["idea", "build", "audit", "ship", "raise", "pick", "scan"];

export default function ChatMessages() {
  const {
    activeTask, streaming, outOfCredits, send, setInput, chatTier,
    holderTier, cost,
  } = useChat();

  const bottomRef = useRef<HTMLDivElement>(null);
  const messages = activeTask?.messages ?? [];
  const isEmpty = messages.length === 0;

  const MODEL_COLORS: Record<string, string> = {
    fast: "#64748b", pro: "#4FC3F7", max: "#A78BFA",
    "venice-deepseek": "#34D399", "venice-grok": "#E879F9",
    "venice-uncut": "#FB923C", "venice-mistral": "#60A5FA",
  };
  const tierColor = MODEL_COLORS[chatTier] ?? "#4FC3F7";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto">
      {isEmpty ? (
        /* ── Hero / empty state ── */
        <div className="text-center pt-16 pb-10 px-8">
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

          <div className="flex flex-wrap justify-center gap-2 mt-5 max-w-lg mx-auto">
            {QUICK_CMDS.map((cmd) => (
              <button
                key={cmd}
                onClick={() => {
                  const noArg = ["pick"].includes(cmd);
                  if (noArg) { send(`/${cmd}`); } else { setInput(`/${cmd} `); }
                }}
                disabled={outOfCredits}
                className="font-mono text-[11px] px-2.5 py-1 rounded-lg border border-[#1A1A2E] text-slate-600 hover:text-[#4FC3F7] hover:border-[#4FC3F7]/30 transition-all disabled:opacity-30"
              >
                /{cmd}
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* ── Message list ── */
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-4 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: `${tierColor}15`, border: `1px solid ${tierColor}30` }}
                >
                  <div className="w-2 h-2 rounded-full" style={{ background: tierColor }} />
                </div>
              )}

              <div
                className={`max-w-[80%] rounded-2xl font-mono text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-[#1A1A2E] text-slate-200 rounded-tr-sm px-4 py-3 whitespace-pre-wrap"
                    : "text-slate-300 rounded-tl-sm"
                }`}
              >
                {/* Tool logs */}
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

                {/* Content */}
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

          {/* Streaming indicator — only shown on the "pending" last message */}
          {streaming && messages[messages.length - 1]?.role === "assistant" && messages[messages.length - 1]?.content === "" && (
            <div className="flex gap-4 justify-start">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: `${tierColor}15`, border: `1px solid ${tierColor}30` }}
              >
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: tierColor }} />
              </div>
              <div className="px-1 py-1 flex gap-1 items-center">
                <Dot delay={0} /><Dot delay={160} /><Dot delay={320} />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
