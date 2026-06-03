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
        /* ── Empty state ── */
        <div className="flex flex-col items-center justify-center h-full px-8 py-12 text-center">

          {/* Agent badge */}
          <div className="flex items-center gap-2 mb-6">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: `${tierColor}15`, border: `1px solid ${tierColor}30` }}
            >
              <span className="font-mono text-sm font-black" style={{ color: tierColor }}>B</span>
            </div>
            <div className="text-left">
              <p className="font-mono text-sm font-bold text-white">Blue Agent</p>
              <p className="font-mono text-[10px] text-slate-600">20 skills · 50 tools · Base-native</p>
            </div>
          </div>

          <h2 className="font-mono text-2xl sm:text-3xl font-bold text-white tracking-tight mb-2">
            What are you building?
          </h2>
          <p className="font-mono text-sm text-slate-500 max-w-sm mx-auto leading-relaxed mb-8">
            Ideas, architecture, audits, launches, fundraising — grounded in Base.
          </p>

          {/* Starter prompts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg mx-auto mb-6">
            {STARTERS.map((s) => (
              <button
                key={s.text}
                onClick={() => send(s.text)}
                disabled={outOfCredits}
                className="text-left px-4 py-3 rounded-xl border transition-all disabled:opacity-40 disabled:cursor-not-allowed group"
                style={{ background: "#0D0D14", borderColor: "#1A1A2E" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = `${tierColor}30`)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "#1A1A2E")}
              >
                <span className="text-base">{s.icon}</span>
                <p className="font-mono text-xs text-slate-400 group-hover:text-slate-300 mt-1 leading-relaxed">
                  {s.text}
                </p>
              </button>
            ))}
          </div>

          {/* Quick commands */}
          <div className="flex flex-wrap justify-center gap-1.5">
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

          {/* Credits status */}
          {outOfCredits && (
            <p className="font-mono text-[10px] text-red-400 mt-4">
              Out of credits — stake $BLUEAGENT to refill
            </p>
          )}
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
                {/* Tool execution logs — Manus-style */}
                {msg.role === "assistant" && msg.toolLogs && msg.toolLogs.length > 0 && (
                  <div className="flex flex-col gap-1 mb-3 px-1">
                    {msg.toolLogs.map((log, j) => {
                      const name = log.tool.replace(/^hub_/, "").replace(/_/g, " ");
                      const provider = log.tool.includes("bankr") || log.tool.includes("wallet") || log.tool.includes("price") || log.tool.includes("holder") || log.tool.includes("nft") || log.tool.includes("lp") || log.tool.includes("transfer")
                        ? { icon: "🔮", color: "#A78BFA", label: "Bankr" }
                        : log.tool.includes("base") || log.tool.includes("contract") || log.tool.includes("gas") || log.tool.includes("block") || log.tool.includes("deploy") || log.tool.includes("bridge")
                        ? { icon: "🔵", color: "#34D399", label: "Base MCP" }
                        : { icon: "⚡", color: "#4FC3F7", label: "Blue Agent" };
                      const isRunning = log.status === "running";
                      return (
                        <div
                          key={j}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border"
                          style={{
                            borderColor: `${provider.color}20`,
                            background: `${provider.color}06`,
                          }}
                        >
                          <span className="text-xs shrink-0">{provider.icon}</span>
                          <span className="font-mono text-[10px] font-semibold shrink-0" style={{ color: provider.color }}>
                            {provider.label}
                          </span>
                          <span className="font-mono text-[10px] text-slate-500 flex-1 truncate capitalize">{name}</span>
                          {isRunning ? (
                            <span className="font-mono text-[9px] text-slate-600 animate-pulse shrink-0">running…</span>
                          ) : (
                            <span className="font-mono text-[9px] shrink-0" style={{ color: "#34D399" }}>
                              ✓{log.ms !== undefined ? ` ${(log.ms / 1000).toFixed(1)}s` : ""}
                            </span>
                          )}
                        </div>
                      );
                    })}
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
