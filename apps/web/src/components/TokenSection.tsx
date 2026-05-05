"use client";

import { useState } from "react";

const TOKEN = "0xf895783b2931c919955e18b5e3343e7c7c456ba3";

export default function TokenSection() {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(TOKEN).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <section className="max-w-5xl mx-auto px-6 mb-24">
      <h2 className="text-3xl font-bold text-center mb-3" style={{ color: "var(--text)" }}>
        Pricing + Rewards
      </h2>
      <p className="text-center mb-10" style={{ color: "var(--text-muted)" }}>
        Blue Agent uses three payment rails: x402 for commands, credits for chat, and $BLUEAGENT for loyalty.
      </p>

      <div className="card p-8 max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div style={{ width: 48, height: 48, background: "#4a90d9", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
            🔵
          </div>
          <div>
            <div className="font-bold text-lg" style={{ color: "var(--text)" }}>$BLUEAGENT</div>
            <div className="text-sm" style={{ color: "var(--text-muted)" }}>Base · utility + loyalty + discounts</div>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-5 p-3 rounded-xl" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
          <code className="text-xs font-mono flex-1 truncate" style={{ color: "var(--text-muted)" }}>{TOKEN}</code>
          <button
            onClick={handleCopy}
            className="text-xs px-3 py-1 rounded-lg transition-all flex-shrink-0"
            style={{
              border: `1px solid ${copied ? "#16a34a" : "rgba(74,144,217,0.3)"}`,
              color: copied ? "#16a34a" : "#4a90d9",
              background: copied ? "rgba(34,197,94,0.05)" : "rgba(74,144,217,0.05)",
              cursor: "pointer",
            }}
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>

        <div className="grid gap-3 mb-6">
          {[
            { label: "x402 commands", value: "Pay per command" },
            { label: "Chat", value: "Credits or USDC" },
            { label: "$BLUEAGENT holders", value: "Discounts + loyalty" },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between p-3 rounded-xl" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <span className="text-sm" style={{ color: "var(--text)" }}>{row.label}</span>
              <span className="text-sm font-semibold" style={{ color: "#4a90d9" }}>{row.value}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-3 flex-wrap mb-6">
          {[
            { label: "Basescan ↗", href: `https://basescan.org/token/${TOKEN}` },
            { label: "Uniswap ↗", href: `https://app.uniswap.org/explore/tokens/base/${TOKEN}` },
            { label: "DexScreener ↗", href: `https://dexscreener.com/base/${TOKEN}` },
          ].map((l) => (
            <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="text-sm px-3 py-1.5 rounded-lg transition-all" style={{ border: "1px solid rgba(74,144,217,0.3)", color: "#4a90d9", textDecoration: "none" }}>
              {l.label}
            </a>
          ))}
        </div>

        <a href="/code" className="btn-blue" style={{ display: "block", textAlign: "center" }}>
          Open Founder Console
        </a>
      </div>
    </section>
  );
}
