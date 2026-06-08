"use client";

import { useState } from "react";

interface Props {
  code:  string;
  lang?: string;
  hint?: string;
}

export default function CodeBlock({ code, lang, hint }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <div className="rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] overflow-hidden my-4">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1A1A2E] bg-[#0d0d12]">
        <p className="font-mono text-[10px] text-slate-600">{hint ?? lang ?? "code"}</p>
        <button onClick={copy}
          className={`font-mono text-[10px] px-2 py-1 rounded border transition-all ${
            copied
              ? "text-[#34D399] border-[#34D399]/40 bg-[#34D399]/5"
              : "text-slate-500 border-[#1A1A2E] hover:text-[#4FC3F7] hover:border-[#4FC3F7]/30"
          }`}>
          {copied ? "✓ Copied!" : "Copy"}
        </button>
      </div>
      <pre className="px-4 py-3 overflow-x-auto font-mono text-[12px] text-slate-300 leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}
