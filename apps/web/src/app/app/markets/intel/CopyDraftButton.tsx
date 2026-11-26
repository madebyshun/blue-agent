"use client";

import { useState } from "react";

export default function CopyDraftButton({ draft }: { draft: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = draft;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      className="rounded-lg border px-3 py-1.5 font-mono text-[12px] font-medium transition-colors"
      style={
        copied
          ? { color: "#10B981", borderColor: "#10B98160", background: "#10B98118" }
          : { color: "#4FC3F7", borderColor: "#4FC3F750", background: "#4FC3F712" }
      }
    >
      {copied ? "Copied draft" : "Copy draft"}
    </button>
  );
}
