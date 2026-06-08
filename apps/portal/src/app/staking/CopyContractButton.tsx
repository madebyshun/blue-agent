"use client";

import { useState } from "react";

const CONTRACT = "0xf895783b2931c919955e18b5e3343e7c7c456ba3";

export default function CopyContractButton() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(CONTRACT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <div className="flex items-center gap-0 rounded-xl border border-[#F59E0B] bg-[#F59E0B] overflow-hidden">
      <code className="font-mono text-xs sm:text-sm font-semibold text-[#050508] px-4 py-3 select-all">
        {CONTRACT.slice(0, 8)}…{CONTRACT.slice(-6)}
      </code>
      <button onClick={copy}
        className="font-mono text-xs font-bold px-4 py-3 bg-amber-400 text-[#050508] hover:bg-amber-300 transition-colors border-l border-[#F59E0B]/30">
        {copied ? "✓ Copied!" : "Copy contract"}
      </button>
    </div>
  );
}
