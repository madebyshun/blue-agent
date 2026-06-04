"use client";
import React, { useEffect, useRef, useState } from "react";
import { useChat } from "../ChatContext";

// ── Animated dot ─────────────────────────────────────────────────────────────

function Dot({ delay }: { delay: number }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 5, height: 5,
        borderRadius: "50%",
        background: "#475569",
        animation: `pulse 1.2s ${delay}ms ease-in-out infinite`,
      }}
    />
  );
}

// ── Inline markdown renderer ──────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  const re = /(\*\*(.+?)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
  const result: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) result.push(text.slice(last, match.index));
    idx++;

    if (match[2] !== undefined) {
      result.push(
        <strong key={idx} className="font-semibold text-white">
          {match[2]}
        </strong>
      );
    } else if (match[3] !== undefined) {
      result.push(
        <em key={idx} className="italic text-slate-200">
          {match[3]}
        </em>
      );
    } else if (match[4] !== undefined) {
      result.push(
        <code
          key={idx}
          className="font-mono bg-[#1A1A2E] text-[#7DD3FC] px-1.5 py-0.5 rounded border border-[#2A2A4E]"
          style={{ fontSize: "0.85em" }}
        >
          {match[4]}
        </code>
      );
    } else if (match[5] !== undefined) {
      result.push(
        <a
          key={idx}
          href={match[6]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#4FC3F7] hover:underline"
        >
          {match[5]}
        </a>
      );
    }

    last = match.index + match[0].length;
  }

  if (last < text.length) result.push(text.slice(last));
  return result;
}

// ── Block markdown renderer ───────────────────────────────────────────────────

function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  let listType: "ul" | "ol" | null = null;
  let listItems: React.ReactNode[] = [];

  function flushList() {
    if (listItems.length === 0) return;
    if (listType === "ul") {
      elements.push(
        <ul key={`ul-${i}`} className="my-3 space-y-1.5">
          {listItems}
        </ul>
      );
    } else {
      elements.push(
        <ol key={`ol-${i}`} className="my-3 space-y-1.5">
          {listItems}
        </ol>
      );
    }
    listItems = [];
    listType = null;
  }

  while (i < lines.length) {
    const line = lines[i];

    // ── Fenced code block ────────────────────────────────────────────────────
    if (line.startsWith("```")) {
      flushList();
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <div key={`code-${i}`} className="my-4 rounded-xl overflow-hidden border border-[#2A2A4E]">
          {lang && (
            <div className="flex items-center justify-between px-4 py-1.5 bg-[#0B0B16] border-b border-[#2A2A4E]">
              <span className="font-mono text-[10px] text-slate-500 tracking-widest uppercase">
                {lang}
              </span>
              <button
                onClick={() => navigator.clipboard?.writeText(codeLines.join("\n"))}
                className="font-mono text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
              >
                copy
              </button>
            </div>
          )}
          <pre className="px-4 py-3.5 overflow-x-auto bg-[#06060F]">
            <code className="font-mono text-[13px] text-slate-300 leading-relaxed">
              {codeLines.join("\n")}
            </code>
          </pre>
        </div>
      );
      i++;
      continue;
    }

    // ── Headers ──────────────────────────────────────────────────────────────
    const h3 = line.match(/^### (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h1 = line.match(/^# (.+)/);

    if (h1) {
      flushList();
      elements.push(
        <h1 key={i} className="text-[22px] font-bold text-white mt-6 mb-3 pb-2 border-b border-[#1A1A2E] leading-tight">
          {renderInline(h1[1])}
        </h1>
      );
    } else if (h2) {
      flushList();
      elements.push(
        <h2 key={i} className="text-[18px] font-bold text-white mt-5 mb-2.5 leading-tight">
          {renderInline(h2[1])}
        </h2>
      );
    } else if (h3) {
      flushList();
      elements.push(
        <h3 key={i} className="text-[15px] font-semibold text-slate-100 mt-4 mb-2 leading-tight">
          {renderInline(h3[1])}
        </h3>
      );
    }

    // ── Horizontal rule ──────────────────────────────────────────────────────
    else if (/^---+$/.test(line.trim())) {
      flushList();
      elements.push(<hr key={i} className="border-[#2A2A4E] my-5" />);
    }

    // ── Bullet list ──────────────────────────────────────────────────────────
    else if (/^[-*] (.+)/.test(line)) {
      const text = line.match(/^[-*] (.+)/)![1];
      if (listType !== "ul") { flushList(); listType = "ul"; }
      listItems.push(
        <li key={i} className="flex gap-2.5 text-slate-300 leading-relaxed text-[15px]">
          <span className="text-slate-600 mt-[5px] shrink-0 text-xs">●</span>
          <span>{renderInline(text)}</span>
        </li>
      );
    }

    // ── Numbered list ────────────────────────────────────────────────────────
    else if (/^\d+\. (.+)/.test(line)) {
      const text = line.match(/^\d+\. (.+)/)![1];
      const num  = line.match(/^(\d+)\./)?.[1] ?? "";
      if (listType !== "ol") { flushList(); listType = "ol"; }
      listItems.push(
        <li key={i} className="flex gap-2.5 text-slate-300 leading-relaxed text-[15px]">
          <span className="text-slate-500 shrink-0 font-mono text-[13px] w-5 text-right">{num}.</span>
          <span>{renderInline(text)}</span>
        </li>
      );
    }

    // ── Empty line (paragraph break) ─────────────────────────────────────────
    else if (line.trim() === "") {
      flushList();
      // spacer already handled by space-y-3 on container
    }

    // ── Regular paragraph ────────────────────────────────────────────────────
    else {
      flushList();
      elements.push(
        <p key={i} className="text-[15px] text-slate-300 leading-relaxed">
          {renderInline(line)}
        </p>
      );
    }

    i++;
  }

  flushList();
  return <div className="space-y-2.5">{elements}</div>;
}

// ── Starter prompts ───────────────────────────────────────────────────────────

const STARTERS = [
  { icon: "💡", text: "/idea USDC streaming payroll app on Base" },
  { icon: "🛠️", text: "/build ERC-4337 agent wallet" },
  { icon: "🛡️", text: "/audit my token launch plan" },
  { icon: "🚀", text: "/pick" },
];

const QUICK_CMDS = ["idea", "build", "audit", "ship", "raise", "pick", "scan"];

// ── Main component ────────────────────────────────────────────────────────────

export default function ChatMessages() {
  const {
    activeTask, streaming, outOfCredits, send, setInput, chatTier,
    holderTier, cost,
  } = useChat();

  const bottomRef = useRef<HTMLDivElement>(null);
  const messages  = activeTask?.messages ?? [];
  const isEmpty   = messages.length === 0;

  // ── Thinking timer ────────────────────────────────────────────────────────
  const [elapsed, setElapsed]     = useState(0);
  const streamStartRef            = useRef<number | null>(null);

  useEffect(() => {
    if (streaming) {
      streamStartRef.current = Date.now();
      setElapsed(0);
      const id = setInterval(() => {
        if (streamStartRef.current !== null) {
          setElapsed(Math.floor((Date.now() - streamStartRef.current) / 1000));
        }
      }, 500);
      return () => clearInterval(id);
    } else {
      streamStartRef.current = null;
    }
  }, [streaming]);

  const MODEL_COLORS: Record<string, string> = {
    fast: "#64748b", pro: "#4FC3F7", max: "#A78BFA",
    "venice-deepseek":      "#34D399",
    "venice-deepseek-pro":  "#2DD4BF",
    "venice-kimi":          "#818CF8",
    "venice-claude":        "#F472B6",
    "venice-grok":          "#E879F9",
    "venice-qwen":          "#FB923C",
    "venice-mistral":       "#60A5FA",
    "venice-uncut":         "#F59E0B",
    "venice-e2ee-venice":   "#6EE7B7",
    "venice-e2ee-gemma":    "#6EE7B7",
    "venice-e2ee-qwen":     "#6EE7B7",
  };
  const tierColor = MODEL_COLORS[chatTier] ?? "#4FC3F7";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      {isEmpty ? (
        /* ── Empty state ─────────────────────────────────────────────────── */
        <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 text-center">
          <div className="flex flex-col items-center gap-2 mb-8">
            <div className="flex items-center gap-3">
              <img src="/logo.svg" alt="Blue Agent" className="h-9 w-9" />
              <span className="font-mono text-2xl font-bold text-white tracking-widest">
                BLUE<span style={{ color: tierColor }}>AGENT</span>
              </span>
            </div>
          </div>

          <h2 className="font-mono text-3xl sm:text-4xl font-bold text-white tracking-tight mb-3">
            What are you building?
          </h2>
          <p className="font-mono text-sm text-slate-500 max-w-sm mx-auto leading-relaxed mb-10">
            Ideas, architecture, audits, launches, fundraising — grounded in Base.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-xl mx-auto mb-8">
            {STARTERS.map((s) => (
              <button
                key={s.text}
                onClick={() => send(s.text)}
                disabled={outOfCredits}
                className="text-left px-5 py-4 rounded-2xl border transition-all disabled:opacity-40 disabled:cursor-not-allowed group"
                style={{ background: "#0D0D14", borderColor: "#1A1A2E" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = `${tierColor}30`)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "#1A1A2E")}
              >
                <span className="text-xl">{s.icon}</span>
                <p className="font-mono text-xs text-slate-400 group-hover:text-slate-300 mt-2 leading-relaxed">
                  {s.text}
                </p>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            {QUICK_CMDS.map((cmd) => (
              <button
                key={cmd}
                onClick={() => {
                  if (["pick"].includes(cmd)) { send(`/${cmd}`); } else { setInput(`/${cmd} `); }
                }}
                disabled={outOfCredits}
                className="font-mono text-[11px] px-3 py-1.5 rounded-lg border border-[#1A1A2E] text-slate-600 hover:text-[#4FC3F7] hover:border-[#4FC3F7]/30 transition-all disabled:opacity-30"
              >
                /{cmd}
              </button>
            ))}
          </div>

          {outOfCredits && (
            <p className="font-mono text-[10px] text-red-400 mt-5">
              Out of credits — stake $BLUEAGENT to refill
            </p>
          )}
        </div>
      ) : (
        /* ── Message list ────────────────────────────────────────────────── */
        <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-8 space-y-7">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>

              {/* Avatar — assistant */}
              {msg.role === "assistant" && (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1"
                  style={{ background: `${tierColor}18`, border: `1px solid ${tierColor}35` }}
                >
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: tierColor }} />
                </div>
              )}

              <div
                className={`font-mono leading-relaxed ${
                  msg.role === "user"
                    ? "max-w-[78%] rounded-2xl rounded-tr-md bg-[#131320] border border-[#1E1E32] text-slate-200 px-5 py-3.5 text-[15px]"
                    : "flex-1 min-w-0"
                }`}
              >
                {/* ── Tool execution logs ───────────────────────────────── */}
                {msg.role === "assistant" && msg.toolLogs && msg.toolLogs.length > 0 && (
                  <div className="flex flex-col gap-1.5 mb-4">
                    {msg.toolLogs.map((log, j) => {
                      const name = log.tool.replace(/^hub_/, "").replace(/_/g, " ");
                      const provider =
                        log.tool === "hub_crypto_rpc"
                          ? { icon: "🌐", color: "#34D399", label: "Venice RPC" }
                          : log.tool.includes("bankr") || log.tool.includes("wallet") || log.tool.includes("price") || log.tool.includes("holder") || log.tool.includes("nft") || log.tool.includes("lp") || log.tool.includes("transfer")
                          ? { icon: "🔮", color: "#A78BFA", label: "Bankr" }
                          : log.tool.includes("base") || log.tool.includes("contract") || log.tool.includes("gas") || log.tool.includes("block") || log.tool.includes("deploy") || log.tool.includes("bridge")
                          ? { icon: "🔵", color: "#34D399", label: "Base MCP" }
                          : { icon: "⚡", color: "#4FC3F7", label: "Blue Agent" };
                      const isRunning = log.status === "running";
                      return (
                        <div
                          key={j}
                          className="flex items-center gap-2.5 px-3 py-2 rounded-lg border"
                          style={{
                            borderColor: `${provider.color}20`,
                            background: `${provider.color}07`,
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

                {/* ── File attachment chips ─────────────────────────────── */}
                {msg.role === "user" && msg.attachments && msg.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2.5">
                    {msg.attachments.map((f, j) => (
                      <div
                        key={j}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-[10px]"
                        style={{ borderColor: "#4FC3F720", background: "#4FC3F708", color: "#64748b" }}
                      >
                        <span>{f.mimeType.startsWith("image/") ? "🖼" : f.name.endsWith(".pdf") ? "📄" : "📎"}</span>
                        <span className="max-w-[140px] truncate">{f.name}</span>
                        <span className="text-slate-700">({(f.size / 1024).toFixed(0)}KB)</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Message content ───────────────────────────────────── */}
                {msg.role === "assistant" ? (
                  <div
                    className="rounded-2xl rounded-tl-md px-5 py-4 border"
                    style={{ background: "#0A0A14", borderColor: "#181828" }}
                  >
                    {msg.content ? (
                      <MarkdownRenderer content={msg.content} />
                    ) : (
                      /* Thinking indicator (no content yet) */
                      <span className="flex gap-1.5 items-center">
                        <Dot delay={0} /><Dot delay={160} /><Dot delay={320} />
                        {streaming && elapsed > 0 && (
                          <span className="font-mono text-[10px] text-slate-700 ml-1">{elapsed}s</span>
                        )}
                      </span>
                    )}
                  </div>
                ) : (
                  /* User message plain text (already styled by container) */
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                )}
              </div>

              {/* Avatar — user */}
              {msg.role === "user" && (
                <div className="w-8 h-8 rounded-full bg-[#131320] border border-[#1E1E32] flex items-center justify-center flex-shrink-0 mt-1">
                  <span className="font-mono text-[10px] text-slate-400">you</span>
                </div>
              )}
            </div>
          ))}

          {/* Streaming wait indicator — shown when streaming + last message is empty */}
          {streaming && messages[messages.length - 1]?.role === "assistant" && messages[messages.length - 1]?.content === "" && !messages[messages.length - 1]?.toolLogs?.length && (
            <div className="flex gap-3 justify-start">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1"
                style={{ background: `${tierColor}18`, border: `1px solid ${tierColor}35` }}
              >
                <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: tierColor }} />
              </div>
              <div
                className="rounded-2xl rounded-tl-md px-5 py-4 border"
                style={{ background: "#0A0A14", borderColor: "#181828" }}
              >
                <span className="flex gap-1.5 items-center">
                  <Dot delay={0} /><Dot delay={160} /><Dot delay={320} />
                  {elapsed > 0 && (
                    <span className="font-mono text-[10px] text-slate-700 ml-1">{elapsed}s</span>
                  )}
                </span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
