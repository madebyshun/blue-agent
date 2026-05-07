"use client";

import { useState } from "react";

const TOKEN = "0xf895783b2931c919955e18b5e3343e7c7c456ba3";

const PAYMENT_RAILS = [
  { label: "x402 commands",       value: "Pay per command" },
  { label: "Chat",                 value: "Credits or USDC" },
  { label: "$BLUEAGENT holders",   value: "Discounts + loyalty" },
];

const LINKS = [
  { label: "Basescan ↗",    href: `https://basescan.org/token/${TOKEN}` },
  { label: "Uniswap ↗",     href: `https://app.uniswap.org/explore/tokens/base/${TOKEN}` },
  { label: "DexScreener ↗", href: `https://dexscreener.com/base/${TOKEN}` },
];

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
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 border border-[#1A52FF]/25 bg-[#1A52FF]/8 rounded-full px-4 py-1.5 mb-6">
          <span className="font-mono text-xs text-[#33C3FF] tracking-widest">PRICING + REWARDS</span>
        </div>
        <h2 className="font-sans font-bold text-3xl sm:text-4xl text-white mb-3">
          Three payment rails
        </h2>
        <p className="text-[#B8CBE8] max-w-xl mx-auto">
          x402 for commands, credits for chat, $BLUEAGENT for loyalty.
        </p>
      </div>

      <div className="card-surface rounded-2xl p-8 max-w-lg mx-auto">
        {/* Token header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-[#1A52FF]/10 border border-[#1A52FF]/30 flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg, rgba(26,82,255,0.2), rgba(51,195,255,0.1))" }}>
            <div className="w-6 h-6 rounded-full" style={{ background: "linear-gradient(135deg, #1A52FF, #33C3FF)" }} />
          </div>
          <div>
            <div className="font-sans font-bold text-lg text-white">$BLUEAGENT</div>
            <div className="text-xs text-[#7A8FAE] mt-0.5">Base · utility + loyalty + discounts</div>
          </div>
        </div>

        {/* Contract address */}
        <div className="flex items-center gap-2 mb-5 p-3 rounded-xl bg-[#060C18] border border-white/10">
          <code className="font-mono text-xs text-[#7A8FAE] flex-1 truncate">{TOKEN}</code>
          <button
            onClick={handleCopy}
            className="font-mono text-xs px-3 py-1 rounded-lg transition-all flex-shrink-0"
            style={{
              border: `1px solid ${copied ? "rgba(34,197,94,0.4)" : "rgba(26,82,255,0.35)"}`,
              color: copied ? "#22C55E" : "#4A7AFF",
              background: copied ? "rgba(34,197,94,0.06)" : "rgba(26,82,255,0.08)",
            }}
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>

        {/* Payment rails */}
        <div className="flex flex-col gap-2 mb-6">
          {PAYMENT_RAILS.map((row) => (
            <div key={row.label} className="flex items-center justify-between p-3 rounded-xl bg-[#060C18] border border-white/10">
              <span className="text-sm text-[#B8CBE8]">{row.label}</span>
              <span className="font-mono text-sm font-semibold text-[#33C3FF]">{row.value}</span>
            </div>
          ))}
        </div>

        {/* External links */}
        <div className="flex gap-2 flex-wrap mb-6">
          {LINKS.map((l) => (
            <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer"
              className="font-mono text-xs px-3 py-1.5 rounded-lg border border-[#1A52FF]/30 text-[#4A7AFF] hover:bg-[#1A52FF]/8 transition-colors">
              {l.label}
            </a>
          ))}
        </div>

        <a href="/code"
          className="btn-primary block text-center text-sm font-semibold px-5 py-2.5 rounded-lg">
          Open Founder Console
        </a>
      </div>
    </section>
  );
}
