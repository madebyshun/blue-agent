"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { DexToken } from "@/app/api/_lib/realdata";

type SortKey = "volume24h" | "liquidity" | "fdv" | "priceChange24h" | "txns24h";

function fmtUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1e3).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}
function fmtPrice(s: string): string {
  const n = parseFloat(s);
  if (!n) return "$0";
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toPrecision(2)}`;
}
function fmtPct(n: number): string { return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`; }
function fmtNum(n: number): string { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n); }

const COLS: { key: SortKey; label: string }[] = [
  { key: "priceChange24h", label: "24h" },
  { key: "volume24h",      label: "Volume" },
  { key: "liquidity",      label: "Liquidity" },
  { key: "fdv",            label: "FDV" },
  { key: "txns24h",        label: "Txns" },
];

export default function Screener({ initial }: { initial: DexToken[] }) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("volume24h");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const rows = useMemo(() => {
    const filtered = initial.filter(t =>
      !q || t.symbol.toLowerCase().includes(q.toLowerCase()) || t.name.toLowerCase().includes(q.toLowerCase())
    );
    const sorted = [...filtered].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      return dir === "desc" ? bv - av : av - bv;
    });
    return sorted;
  }, [initial, q, sortKey, dir]);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setDir(d => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(k); setDir("desc"); }
  };

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search token / symbol…"
          className="w-full max-w-xs bg-[#0D0D1A] border border-[#1A1A2E] rounded-lg px-3 py-2 font-mono text-xs text-white placeholder-slate-700 focus:outline-none focus:border-[#4FC3F7]/30"
        />
        <span className="font-mono text-[10px] text-slate-600 shrink-0">{rows.length} tokens</span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[#1A1A2E] bg-[#0A0A12] overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-[#1A1A2E] text-slate-600">
              <th className="font-mono text-[10px] uppercase tracking-wider text-left px-3 py-2.5 w-8">#</th>
              <th className="font-mono text-[10px] uppercase tracking-wider text-left px-3 py-2.5">Token</th>
              <th className="font-mono text-[10px] uppercase tracking-wider text-right px-3 py-2.5">Price</th>
              {COLS.map(c => (
                <th key={c.key}
                  onClick={() => toggleSort(c.key)}
                  className={`font-mono text-[10px] uppercase tracking-wider text-right px-3 py-2.5 cursor-pointer select-none hover:text-slate-300 ${sortKey === c.key ? "text-[#4FC3F7]" : ""}`}>
                  {c.label}{sortKey === c.key ? (dir === "desc" ? " ↓" : " ↑") : ""}
                </th>
              ))}
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => (
              <tr key={t.address || t.symbol + i} className="border-b border-[#1A1A2E]/40 last:border-0 hover:bg-[#4FC3F7]/[0.03] transition-colors">
                <td className="font-mono text-[10px] text-slate-700 px-3 py-2.5">{i + 1}</td>
                <td className="px-3 py-2.5">
                  <div className="font-mono text-xs font-bold text-white truncate max-w-[140px]">{t.symbol}</div>
                  <div className="font-mono text-[10px] text-slate-600 truncate max-w-[140px]">{t.name}</div>
                </td>
                <td className="font-mono text-xs text-slate-300 text-right px-3 py-2.5 tabular-nums">{fmtPrice(t.priceUsd)}</td>
                <td className={`font-mono text-xs text-right px-3 py-2.5 tabular-nums ${t.priceChange24h >= 0 ? "text-[#34D399]" : "text-red-400"}`}>{fmtPct(t.priceChange24h)}</td>
                <td className="font-mono text-xs text-slate-300 text-right px-3 py-2.5 tabular-nums">{fmtUsd(t.volume24h)}</td>
                <td className="font-mono text-xs text-slate-400 text-right px-3 py-2.5 tabular-nums">{t.liquidity ? fmtUsd(t.liquidity) : "—"}</td>
                <td className="font-mono text-xs text-slate-400 text-right px-3 py-2.5 tabular-nums">{t.fdv ? fmtUsd(t.fdv) : "—"}</td>
                <td className="font-mono text-xs text-slate-500 text-right px-3 py-2.5 tabular-nums">{t.txns24h ? fmtNum(t.txns24h) : "—"}</td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <Link href="/hub/honeypot-check"
                    className="font-mono text-[10px] text-[#A78BFA] hover:text-white border border-[#A78BFA]/20 hover:border-[#A78BFA]/50 rounded px-2 py-1 transition-all">
                    🛡 Audit
                  </Link>
                  {t.pairAddress && (
                    <a href={`https://dexscreener.com/base/${t.pairAddress}`} target="_blank" rel="noopener noreferrer"
                      className="font-mono text-[10px] text-slate-600 hover:text-[#4FC3F7] ml-2">chart ↗</a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="font-mono text-xs text-slate-600 px-3 py-6 text-center">No tokens match “{q}”.</p>
        )}
      </div>
    </div>
  );
}
