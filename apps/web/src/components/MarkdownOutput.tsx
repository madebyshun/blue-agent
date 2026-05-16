"use client";

/**
 * Simple markdown renderer for LLM output.
 * Handles: ## headings, **bold**, `code`, bullet lists, numbered lists, code blocks, horizontal rules.
 * No external deps — keeps the build lean.
 */

interface Props {
  content: string;
  className?: string;
}

function parseInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const raw = match[0];
    if (raw.startsWith("**")) {
      parts.push(<strong key={match.index} className="text-white font-semibold">{raw.slice(2, -2)}</strong>);
    } else if (raw.startsWith("`")) {
      parts.push(<code key={match.index} className="font-mono text-[#4FC3F7] bg-[#1A1A2E] px-1.5 py-0.5 rounded text-[0.9em]">{raw.slice(1, -1)}</code>);
    } else if (raw.startsWith("*")) {
      parts.push(<em key={match.index} className="text-slate-300 italic">{raw.slice(1, -1)}</em>);
    }
    last = match.index + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export default function MarkdownOutput({ content, className = "" }: Props) {
  if (!content) return null;

  const lines = content.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.trimStart().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      nodes.push(
        <div key={i} className="my-3 rounded-xl overflow-hidden border border-[#2A2A4E]">
          {lang && (
            <div className="px-4 py-1.5 bg-[#1A1A2E] border-b border-[#2A2A4E] font-mono text-[10px] text-slate-500 tracking-widest">
              {lang.toUpperCase()}
            </div>
          )}
          <pre className="p-4 bg-[#0A0A12] overflow-x-auto font-mono text-xs text-slate-300 leading-relaxed">
            {codeLines.join("\n")}
          </pre>
        </div>
      );
      i++;
      continue;
    }

    // H1
    if (line.startsWith("# ")) {
      nodes.push(
        <h1 key={i} className="font-mono font-bold text-2xl text-white mt-6 mb-3">
          {parseInline(line.slice(2))}
        </h1>
      );
      i++; continue;
    }

    // H2
    if (line.startsWith("## ")) {
      nodes.push(
        <h2 key={i} className="font-mono font-bold text-xl text-white mt-6 mb-2 pb-1 border-b border-[#1A1A2E]">
          {parseInline(line.slice(3))}
        </h2>
      );
      i++; continue;
    }

    // H3
    if (line.startsWith("### ")) {
      nodes.push(
        <h3 key={i} className="font-mono font-semibold text-base text-[#4FC3F7] mt-4 mb-1">
          {parseInline(line.slice(4))}
        </h3>
      );
      i++; continue;
    }

    // H4
    if (line.startsWith("#### ")) {
      nodes.push(
        <h4 key={i} className="font-mono font-semibold text-sm text-slate-300 mt-3 mb-1">
          {parseInline(line.slice(5))}
        </h4>
      );
      i++; continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(line.trim())) {
      nodes.push(<hr key={i} className="border-[#1A1A2E] my-4" />);
      i++; continue;
    }

    // Bullet list — collect consecutive bullet lines
    if (line.match(/^[-*•]\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*•]\s/)) {
        items.push(lines[i].replace(/^[-*•]\s/, ""));
        i++;
      }
      nodes.push(
        <ul key={i} className="my-2 space-y-1 pl-2">
          {items.map((item, j) => (
            <li key={j} className="flex gap-2 text-sm text-slate-400 leading-relaxed">
              <span className="text-[#4FC3F7] mt-0.5 flex-shrink-0">·</span>
              <span>{parseInline(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (line.match(/^\d+\.\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      nodes.push(
        <ol key={i} className="my-2 space-y-1 pl-2">
          {items.map((item, j) => (
            <li key={j} className="flex gap-3 text-sm text-slate-400 leading-relaxed">
              <span className="font-mono text-[#4FC3F7] font-semibold flex-shrink-0 w-4 text-right">{j + 1}.</span>
              <span>{parseInline(item)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      nodes.push(
        <blockquote key={i} className="border-l-2 border-[#4FC3F7]/40 pl-4 my-2 text-sm text-slate-500 italic">
          {parseInline(line.slice(2))}
        </blockquote>
      );
      i++; continue;
    }

    // Empty line
    if (line.trim() === "") {
      nodes.push(<div key={i} className="h-2" />);
      i++; continue;
    }

    // Regular paragraph
    nodes.push(
      <p key={i} className="text-sm text-slate-400 leading-relaxed my-1">
        {parseInline(line)}
      </p>
    );
    i++;
  }

  return (
    <div className={`font-mono ${className}`}>
      {nodes}
    </div>
  );
}
