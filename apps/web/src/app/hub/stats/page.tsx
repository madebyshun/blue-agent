"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

type Row = { id: string; name: string; category: string; price: string; runs: number; revenueEst: number };
type Stats = {
  totals: { tools: number; totalRuns: number; totalRevenueEst: number; usdcBalance: number | null; wallet: string };
  rows: Row[];
};

export default function StatsPage() {
  const [data, setData] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const key = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("key") ?? ""
      : "";
    fetch(`/api/stats?key=${encodeURIComponent(key)}`)
      .then(async r => {
        if (r.status === 401) { setErr("Unauthorized — add ?key=<secret> to the URL."); return; }
        setData(await r.json());
      })
      .catch(() => setErr("Failed to load stats."));
  }, []);

  const maxRuns = data ? Math.max(1, ...data.rows.map(r => r.runs)) : 1;

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-[#050508] font-mono pt-16 text-slate-200">
        <div className="max-w-4xl mx-auto px-6 py-8">

          <div className="flex items-center gap-2 mb-6 text-xs">
            <Link href="/hub" className="text-slate-500 hover:text-[#4FC3F7] transition-colors">Hub</Link>
            <span className="text-slate-700">/</span>
            <span className="text-slate-400">Stats</span>
          </div>

          <h1 className="text-2xl font-bold text-white tracking-tight mb-1">Tool analytics</h1>
          <p className="font-mono text-[11px] text-slate-600 mb-6">Paid runs · estimated revenue · live wallet balance</p>

          {err && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 font-mono text-xs text-amber-400">{err}</div>
          )}

          {!err && !data && (
            <p className="font-mono text-xs text-slate-600">Loading…</p>
          )}

          {data && (
            <>
              {/* Totals */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-7">
                {[
                  { label: "Tools",            value: String(data.totals.tools) },
                  { label: "Total runs",       value: data.totals.totalRuns.toLocaleString() },
                  { label: "Est. revenue",     value: `$${data.totals.totalRevenueEst.toFixed(2)}` },
                  { label: "USDC balance",     value: data.totals.usdcBalance === null ? "—" : `$${data.totals.usdcBalance.toFixed(2)}` },
                ].map(s => (
                  <div key={s.label} className="rounded-xl border border-[#1A1A2E] bg-[#0A0A12] p-4">
                    <p className="font-mono text-[10px] text-slate-600 uppercase tracking-wider">{s.label}</p>
                    <p className="font-mono text-xl font-bold text-white mt-1">{s.value}</p>
                  </div>
                ))}
              </div>
              <p className="font-mono text-[10px] text-slate-700 mb-5 -mt-3">
                wallet {data.totals.wallet} · est. revenue = runs × price (gross, before x402 fees)
              </p>

              {/* Per-tool table */}
              <div className="rounded-xl border border-[#1A1A2E] bg-[#0A0A12] overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-2.5 border-b border-[#1A1A2E] font-mono text-[10px] text-slate-600 uppercase tracking-wider">
                  <span>Tool</span><span className="text-right">Runs</span><span className="text-right">Price</span><span className="text-right">Est. rev</span>
                </div>
                {data.rows.map((r, i) => (
                  <div key={r.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-2.5 border-b border-[#1A1A2E]/50 items-center hover:bg-[#4FC3F7]/[0.03] transition-colors">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-slate-700 w-5">{i + 1}</span>
                        <Link href={`/hub/${r.id}`} className="font-mono text-xs text-slate-200 hover:text-[#4FC3F7] transition-colors truncate">{r.name}</Link>
                      </div>
                      <div className="h-1 mt-1.5 ml-7 bg-[#1A1A2E] rounded-full overflow-hidden max-w-[200px]">
                        <div className="h-full bg-[#4FC3F7]/60 rounded-full" style={{ width: `${(r.runs / maxRuns) * 100}%` }} />
                      </div>
                    </div>
                    <span className="font-mono text-xs text-white text-right tabular-nums">{r.runs.toLocaleString()}</span>
                    <span className="font-mono text-[11px] text-slate-500 text-right tabular-nums">{r.price}</span>
                    <span className="font-mono text-xs text-[#34D399] text-right tabular-nums">${r.revenueEst.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
