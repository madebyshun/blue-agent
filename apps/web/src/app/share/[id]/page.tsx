/**
 * /share/[id] — Public read-only conversation viewer
 *
 * Renders a shared Blue Chat conversation. No auth required.
 * Includes a "Chat on blueagent.dev" CTA to drive conversion.
 */

import { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { kvGet } from "@/lib/kv";
import type { ShareDoc } from "@/app/api/chat/share/route";

export const runtime = "nodejs";

// ── Data fetching ─────────────────────────────────────────────────────────────

// Read the shared conversation straight from KV. We deliberately do NOT fetch our
// own /api/chat/share over HTTP here: a server component fetching its own Vercel
// deployment self-deadlocks (the page hung ~20s then timed out, HTTP 000), and it
// forced a needless second function invocation. cache() de-dupes the read so
// generateMetadata and the page body share a single KV GET per request.
const SHARE_KEY = "chatshare:"; // source of truth: KEY_PREFIX in /api/chat/share

const getShare = cache(async (id: string): Promise<ShareDoc | null> => {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  return kvGet<ShareDoc>(`${SHARE_KEY}${id}`);
});

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const doc = await getShare(id);
  const title = doc?.title ?? "Shared conversation";
  return {
    title: `${title} — Blue Agent`,
    description: "A conversation shared from Blue Agent — AI for Base builders and traders.",
    openGraph: { title: `${title} — Blue Agent`, siteName: "Blue Agent" },
  };
}

// ── Helper: mini inline markdown (bold, code, links) ─────────────────────────

function InlineText({ text }: { text: string }) {
  const re = /(\*\*(.+?)\*\*|\*([^*\n]+)\*|`([^`\n]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
  const parts: React.ReactNode[] = [];
  let last = 0, match: RegExpExecArray | null, idx = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    idx++;
    if (match[2] !== undefined)
      parts.push(<strong key={idx} className="font-semibold text-white">{match[2]}</strong>);
    else if (match[3] !== undefined)
      parts.push(<em key={idx} className="italic text-slate-300">{match[3]}</em>);
    else if (match[4] !== undefined)
      parts.push(<code key={idx} className="font-mono bg-[#1A1A2E] text-[#7DD3FC] px-1.5 py-0.5 rounded text-[0.84em]">{match[4]}</code>);
    else if (match[5] !== undefined)
      parts.push(<a key={idx} href={match[6]} target="_blank" rel="noopener noreferrer" className="text-[#4FC3F7] underline hover:opacity-80">{match[5]}</a>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function Para({ text }: { text: string }) {
  const words = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/);
  return (
    <p className="font-mono text-[13px] text-slate-300 leading-relaxed mb-2 last:mb-0">
      <InlineText text={text} />
    </p>
  );
}

function BlockRenderer({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0, k = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^#{1,3}\s/.test(line)) {
      const level = line.match(/^(#+)/)?.[1].length ?? 1;
      const text = line.replace(/^#+\s/, "");
      const sizes = ["text-base", "text-sm", "text-xs"];
      elements.push(
        <p key={k++} className={`font-mono font-bold text-white ${sizes[Math.min(level - 1, 2)]} mb-2 mt-3 first:mt-0`}>
          <InlineText text={text} />
        </p>,
      );
      i++;
    } else if (line.trimStart().startsWith("- ") || line.trimStart().startsWith("* ")) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].trimStart().startsWith("- ") || lines[i].trimStart().startsWith("* "))) {
        items.push(lines[i].replace(/^\s*[-*]\s/, ""));
        i++;
      }
      elements.push(
        <ul key={k++} className="my-2 space-y-1 pl-4">
          {items.map((t, j) => (
            <li key={j} className="font-mono text-[13px] text-slate-300 leading-relaxed list-disc list-outside">
              <InlineText text={t} />
            </li>
          ))}
        </ul>,
      );
    } else if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      elements.push(
        <ol key={k++} className="my-2 space-y-1 pl-4">
          {items.map((t, j) => (
            <li key={j} className="font-mono text-[13px] text-slate-300 leading-relaxed list-decimal list-outside">
              <InlineText text={t} />
            </li>
          ))}
        </ol>,
      );
    } else if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].startsWith("```")) { codeLines.push(lines[i]); i++; }
      i++;
      elements.push(
        <div key={k++} className="my-3 rounded-xl overflow-hidden border border-[#1A1A2E]">
          {lang && (
            <div className="px-3 py-1.5 bg-[#0B0B16] border-b border-[#1A1A2E]">
              <span className="font-mono text-[10px] text-slate-600 uppercase tracking-widest">{lang}</span>
            </div>
          )}
          <pre className="bg-[#060610] px-4 py-3 overflow-x-auto">
            <code className="font-mono text-[12px] text-slate-300">{codeLines.join("\n")}</code>
          </pre>
        </div>,
      );
    } else if (line.startsWith("---") || line.startsWith("===")) {
      elements.push(<hr key={k++} className="border-[#1A1A2E] my-3" />);
      i++;
    } else if (line.trim() === "") {
      i++;
    } else {
      // Paragraph — always consume the current line first (it fell through every
      // block handler above), THEN collect continuation lines. Taking lines[i]
      // unconditionally guarantees `i` advances: a line that begins with a
      // structural marker char (** , a digit, #no-space, etc.) but matched no
      // handler would otherwise satisfy the inner-loop's negative lookahead,
      // collect nothing, and spin forever — hanging the server render.
      const paraLines: string[] = [lines[i]];
      i++;
      while (i < lines.length && lines[i].trim() !== "" && !/^[#\-\*`\d]/.test(lines[i])) {
        paraLines.push(lines[i]);
        i++;
      }
      const text = paraLines.join(" ");
      if (text.trim()) elements.push(<Para key={k++} text={text} />);
    }
  }

  return <>{elements}</>;
}

// ── Message bubble ────────────────────────────────────────────────────────────

function fmtTime(ts?: number) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const MODEL_LABELS: Record<string, string> = {
  "haiku":           "Haiku · fast",
  "sonnet":          "Sonnet · balanced",
  "opus":            "Opus · deep",
  "venice-sonnet":   "Sonnet · Venice",
  "venice-deepseek": "DeepSeek · web",
};

function MessageBubble({ msg }: { msg: ShareDoc["messages"][0] }) {
  const isAssistant = msg.role === "assistant";

  // Strip ↳ follow-up lines from content (same as splitFollowups in ChatMessages)
  const followupRe = /^\s*↳\s+/;
  const lines = msg.content.split("\n");
  const cutIdx = lines.findIndex(l => followupRe.test(l));
  const body = (cutIdx === -1 ? lines : lines.slice(0, cutIdx)).join("\n").trimEnd();
  const followups = (cutIdx === -1 ? [] : lines.slice(cutIdx))
    .filter(l => followupRe.test(l))
    .map(l => l.replace(followupRe, "").trim())
    .filter(Boolean);

  return (
    <div className={`flex gap-3 ${isAssistant ? "" : "justify-end"}`}>
      {isAssistant && (
        <img src="/logomark.svg" alt="" width={24} height={24} className="rounded-md shrink-0 mt-0.5" />
      )}
      <div className={`max-w-[75%] ${isAssistant ? "flex-1" : ""}`}>
        {/* Header */}
        <div className={`flex items-center gap-2 mb-1.5 ${isAssistant ? "" : "flex-row-reverse"}`}>
          <span className="font-mono text-[12px] font-bold text-white">
            {isAssistant ? "Blue Agent" : "You"}
          </span>
          {msg.createdAt && (
            <span className="font-mono text-[10px] text-slate-700">{fmtTime(msg.createdAt)}</span>
          )}
        </div>

        {/* Tool logs */}
        {isAssistant && !!msg.toolLogs?.length && (
          <div className="flex flex-col gap-1.5 mb-3">
            {msg.toolLogs.map((log, j) => (
              <div key={j} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-[#4FC3F720] bg-[#4FC3F707]">
                <span className="text-xs">⚡</span>
                <span className="font-mono text-[10px] font-semibold text-[#4FC3F7]">Blue Agent</span>
                <span className="font-mono text-[10px] text-slate-500 flex-1 truncate capitalize">
                  {log.tool.replace(/^hub_/, "").replace(/_/g, " ")}
                </span>
                <span className="font-mono text-[9px] text-[#34D399]">
                  ✓{log.ms !== undefined ? ` ${(log.ms / 1000).toFixed(1)}s` : ""}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Body */}
        {isAssistant ? (
          <div className="font-mono">
            <BlockRenderer content={body} />
            {followups.length > 0 && (
              <div className="mt-3 flex flex-col gap-1.5">
                {followups.map((q, k) => (
                  <span key={k} className="flex items-center gap-2 font-mono text-[12px] text-slate-500">
                    <span className="text-slate-700">↳</span>
                    <span>{q}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="px-3.5 py-2.5 rounded-2xl rounded-tr-sm" style={{ background: "#0F0F1E", border: "1px solid #1E1E32" }}>
            <p className="font-mono text-[13px] text-slate-200 leading-relaxed whitespace-pre-wrap">{body}</p>
          </div>
        )}

        {/* Metadata */}
        {isAssistant && msg.modelUsed && (
          <div className="flex items-center gap-2 mt-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7]" />
            <span className="font-mono text-[10px] text-slate-700">{MODEL_LABELS[msg.modelUsed] ?? msg.modelUsed}</span>
            {msg.responseMs !== undefined && (
              <span className="font-mono text-[10px] text-slate-700">{(msg.responseMs / 1000).toFixed(1)}s</span>
            )}
            {msg.webSearch && msg.webSearch.sources > 0 && (
              <span className="font-mono text-[9px] px-1.5 py-0.5 rounded" style={{ background: "#34D39915", color: "#34D399" }}>
                🌐 {msg.webSearch.sources} sources
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await getShare(id);

  if (!doc) {
    return (
      <div className="min-h-screen bg-[#050508] flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-16 h-16 rounded-3xl border border-[#1A1A2E] bg-[#0d0d12] flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">💬</span>
          </div>
          <p className="font-mono text-sm text-slate-500 mb-1">Conversation not found</p>
          <p className="font-mono text-[11px] text-slate-700 mb-6">This link may have expired (links are valid for 30 days)</p>
          <Link href="/chat" className="font-mono text-[12px] text-[#4FC3F7] hover:underline">
            Start a new conversation →
          </Link>
        </div>
      </div>
    );
  }

  const date = new Date(doc.createdAt).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });

  return (
    <div className="min-h-screen bg-[#050508] text-white">
      {/* Header bar */}
      <header className="sticky top-0 z-10 border-b border-[#1A1A2E] bg-[#050508]/95 backdrop-blur-sm px-4 sm:px-8 h-14 flex items-center gap-3">
        <Link href="/chat" className="flex items-center gap-2 shrink-0">
          <img src="/logomark.svg" alt="Blue Agent" width={28} height={28} className="rounded-lg" />
          <span className="font-mono text-sm font-bold tracking-widest hidden sm:block">
            BLUE<span style={{ color: "#4FC3F7" }}>AGENT</span>
          </span>
        </Link>
        <span className="font-mono text-[10px] text-slate-600 tracking-widest hidden sm:block">// SHARED CONVERSATION</span>
        <div className="flex-1" />
        <Link
          href="/chat"
          className="shrink-0 inline-flex items-center gap-1.5 font-mono text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors"
          style={{ background: "#4FC3F715", color: "#4FC3F7", border: "1px solid #4FC3F730" }}
        >
          Try Blue Agent →
        </Link>
      </header>

      {/* Conversation */}
      <main className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Title + meta */}
        <div className="mb-8 pb-6 border-b border-[#1A1A2E]">
          <h1 className="font-mono text-xl sm:text-2xl font-bold text-white mb-2">{doc.title}</h1>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-[11px] text-slate-600">Shared {date}</span>
            <span className="font-mono text-[11px] text-slate-700">·</span>
            <span className="font-mono text-[11px] text-slate-600">
              {doc.messages.length} message{doc.messages.length !== 1 ? "s" : ""}
            </span>
            <span className="font-mono text-[11px] text-slate-700">·</span>
            <span className="font-mono text-[9px] px-2 py-0.5 rounded" style={{ background: "#4FC3F710", color: "#4FC3F780", border: "1px solid #4FC3F720" }}>
              blueagent.dev
            </span>
          </div>
        </div>

        {/* Messages */}
        <div className="space-y-6">
          {doc.messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} />
          ))}
        </div>

        {/* Footer CTA */}
        <div className="mt-12 pt-8 border-t border-[#1A1A2E] text-center">
          <p className="font-mono text-[11px] text-slate-600 mb-4">
            Continue this conversation or start a new one on Blue Agent
          </p>
          <Link
            href="/chat"
            className="inline-flex items-center gap-2 font-mono text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
            style={{ background: "#4FC3F715", color: "#4FC3F7", border: "1px solid #4FC3F730" }}
          >
            <img src="/logomark.svg" alt="" width={18} height={18} className="rounded-md" />
            Chat on Blue Agent
          </Link>
          <p className="font-mono text-[10px] text-slate-700 mt-4">
            Links expire after 30 days · AI for Base builders and traders
          </p>
        </div>
      </main>
    </div>
  );
}
