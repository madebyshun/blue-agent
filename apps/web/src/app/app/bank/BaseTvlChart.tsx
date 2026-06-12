"use client";

// Interactive Base TVL chart for the BlueBank dashboard — recharts area with
// hover tooltip + time-range toggle (1M / 6M / 1Y / All). Real data via
// /api/base-tvl-history (DefiLlama). Mirrors the interactive feel of Morpho's
// analytics charts.

import { useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

type Pt = { t: number; v: number };
const RANGES = [
  { id: "1M", days: 30 }, { id: "6M", days: 182 }, { id: "1Y", days: 365 }, { id: "All", days: 100000 },
] as const;

const compact = (n: number) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(0)}M` : `$${(n / 1e3).toFixed(0)}K`;

export default function BaseTvlChart() {
  const [series, setSeries] = useState<Pt[]>([]);
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("6M");

  useEffect(() => {
    let off = false;
    fetch("/api/base-tvl-history").then(r => r.json()).then(d => { if (!off) setSeries(d.series ?? []); }).catch(() => {});
    return () => { off = true; };
  }, []);

  const days   = RANGES.find(r => r.id === range)!.days;
  const cutoff = Date.now() - days * 86400000;
  const data   = series.filter(p => p.t >= cutoff);
  const cur    = data.at(-1)?.v ?? null;
  const first  = data[0]?.v ?? null;
  const changePct = cur != null && first ? ((cur - first) / first) * 100 : null;

  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="font-mono text-[10px] text-slate-500 tracking-widest">BASE · TOTAL VALUE LOCKED</div>
          <div className="font-mono text-xl font-bold text-white mt-0.5">
            {cur != null ? compact(cur) : "—"}{" "}
            {changePct != null && (
              <span className="text-[11px]" style={{ color: changePct >= 0 ? "#34D399" : "#EF4444" }}>
                {changePct >= 0 ? "+" : ""}{changePct.toFixed(1)}% · {range}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          {RANGES.map(r => (
            <button key={r.id} onClick={() => setRange(r.id)}
              className="font-mono text-[10px] px-2.5 py-1 rounded-md transition-colors"
              style={range === r.id
                ? { background: "#4FC3F715", color: "#4FC3F7", border: "1px solid #4FC3F730" }
                : { color: "#64748b", border: "1px solid #1A1A2E" }}>
              {r.id}
            </button>
          ))}
        </div>
      </div>

      <div style={{ width: "100%", height: 150 }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="tvlGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4FC3F7" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#4FC3F7" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#13131f" vertical={false} />
            <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time"
              tickFormatter={(t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" })}
              tick={{ fill: "#475569", fontSize: 9, fontFamily: "monospace" }} axisLine={{ stroke: "#1A1A2E" }} tickLine={false} minTickGap={48} />
            <YAxis tickFormatter={(v: number) => compact(v)} tick={{ fill: "#475569", fontSize: 9, fontFamily: "monospace" }}
              axisLine={false} tickLine={false} width={46} />
            <Tooltip content={<TvlTooltip />} />
            <Area type="monotone" dataKey="v" stroke="#4FC3F7" strokeWidth={1.5} fill="url(#tvlGrad)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="font-mono text-[9px] text-slate-600 mt-2">live · DefiLlama · hover for daily values</div>
    </div>
  );
}

function TvlTooltip(props: { active?: boolean; payload?: { payload: Pt }[] }) {
  const { active, payload } = props;
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-[#1A1A2E] bg-[#0d0d12] px-2.5 py-1.5 font-mono text-[10px] shadow-xl">
      <div className="text-slate-400">{new Date(p.t).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}</div>
      <div className="text-[#4FC3F7] font-bold">{compact(p.v)}</div>
    </div>
  );
}
