"use client";

import { useEffect, useState } from "react";

interface Stats {
  tools:  number;
  calls:  number;
  usdc:   number;
  agents: number;
}

const FALLBACK: Stats = { tools: 50, calls: 0, usdc: 0, agents: 3 };

export default function LiveStats() {
  const [s, setS] = useState<Stats>(FALLBACK);

  useEffect(() => {
    // Poll Hub usage counters from blueagent.dev cross-origin.
    // /api/usage returns Record<toolId, callCount>.
    async function pull() {
      try {
        const r = await fetch("https://blueagent.dev/api/usage", { cache: "no-store" });
        if (!r.ok) return;
        const data = (await r.json()) as Record<string, number>;
        const calls = Object.values(data).reduce((a, b) => a + b, 0);
        // Rough revenue estimate: weighted avg price $0.30/call
        const usdc = calls * 0.30;
        setS({ tools: 50, calls, usdc, agents: 3 });
      } catch {}
    }
    pull();
    const id = setInterval(pull, 30_000);
    return () => clearInterval(id);
  }, []);

  const items = [
    { label: "TOOLS",      value: String(s.tools),                accent: "#4FC3F7" },
    { label: "CALLS",      value: s.calls > 0 ? s.calls.toLocaleString() : "—", accent: "#A78BFA" },
    { label: "USDC VOLUME",value: s.usdc  > 0 ? `$${s.usdc.toFixed(0)}`   : "—", accent: "#34D399" },
    { label: "AGENTS",     value: String(s.agents),               accent: "#F59E0B" },
  ];

  return (
    <section className="border-t border-[#1A1A2E] bg-[#0a0a0f]">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {items.map((it) => (
            <div key={it.label} className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] px-4 py-4 text-center">
              <p className="font-mono text-[9px] tracking-widest mb-1" style={{ color: it.accent }}>
                {it.label}
              </p>
              <p className="font-mono text-2xl sm:text-3xl font-bold tabular-nums count-up" style={{ color: it.accent }}>
                {it.value}
              </p>
            </div>
          ))}
        </div>
        <p className="font-mono text-[10px] text-slate-700 text-center mt-4">
          Live data from <code className="text-slate-500">blueagent.dev/api/usage</code> · refresh 30s
        </p>
      </div>
    </section>
  );
}
