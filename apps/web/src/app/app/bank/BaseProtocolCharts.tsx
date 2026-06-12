"use client";

// Two interactive Base charts for the BlueBank dashboard (recharts):
//   • StackedTvlChart   — TVL by protocol, stacked area (Morpho/Aave/Uniswap/…)
//   • ApyCompareChart   — USDC supply APY over time, Aave vs Morpho vs Moonwell
// Both: hover tooltip + 1M/6M/1Y/All time-range. Real data via /api routes.

import { useState, useEffect } from "react";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

type Key = { key: string; label: string; color: string };
type Row = Record<string, number | null> & { t: number };
const RANGES = [{ id: "1M", days: 30 }, { id: "6M", days: 182 }, { id: "1Y", days: 365 }, { id: "All", days: 100000 }] as const;
type RangeId = (typeof RANGES)[number]["id"];

const compact = (n: number) => n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(0)}M` : `$${(n / 1e3).toFixed(0)}K`;
const fmtAxis = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const fmtFull = (t: number) => new Date(t).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });

function useChart(url: string) {
  const [d, setD] = useState<{ series: Row[]; keys: Key[] }>({ series: [], keys: [] });
  useEffect(() => {
    let off = false;
    fetch(url).then(r => r.json()).then(j => { if (!off) setD({ series: j.series ?? [], keys: j.keys ?? [] }); }).catch(() => {});
    return () => { off = true; };
  }, [url]);
  return d;
}

function RangeTabs({ range, set }: { range: RangeId; set: (r: RangeId) => void }) {
  return (
    <div className="flex gap-1">
      {RANGES.map(r => (
        <button key={r.id} onClick={() => set(r.id)}
          className="font-mono text-[10px] px-2.5 py-1 rounded-md transition-colors"
          style={range === r.id ? { background: "#4FC3F715", color: "#4FC3F7", border: "1px solid #4FC3F730" } : { color: "#64748b", border: "1px solid #1A1A2E" }}>
          {r.id}
        </button>
      ))}
    </div>
  );
}

function Legend({ keys }: { keys: Key[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {keys.map(k => (
        <span key={k.key} className="flex items-center gap-1.5 font-mono text-[10px] text-slate-400">
          <span className="w-2 h-2 rounded-sm" style={{ background: k.color }} />{k.label}
        </span>
      ))}
    </div>
  );
}

function ChartTooltip({ active, payload, keys, unit }: { active?: boolean; payload?: { payload: Row }[]; keys: Key[]; unit: "usd" | "pct" }) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload;
  const total = unit === "usd" ? keys.reduce((s, k) => s + ((row[k.key] as number) ?? 0), 0) : null;
  return (
    <div className="rounded-lg border border-[#1A1A2E] bg-[#0d0d12] px-3 py-2 font-mono text-[10px] shadow-xl">
      <div className="text-slate-400 mb-1">{fmtFull(row.t)}</div>
      {keys.map(k => (
        <div key={k.key} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5" style={{ color: k.color }}><span className="w-1.5 h-1.5 rounded-sm" style={{ background: k.color }} />{k.label}</span>
          <span className="text-slate-200">{row[k.key] == null ? "—" : unit === "usd" ? compact(row[k.key] as number) : `${(row[k.key] as number).toFixed(2)}%`}</span>
        </div>
      ))}
      {total != null && <div className="flex items-center justify-between gap-4 mt-1 pt-1 border-t border-[#1A1A2E]"><span className="text-slate-500">Total</span><span className="text-white">{compact(total)}</span></div>}
    </div>
  );
}

export function StackedTvlChart() {
  const { series, keys } = useChart("/api/base-protocols-tvl");
  const [range, setRange] = useState<RangeId>("6M");
  const days = RANGES.find(r => r.id === range)!.days;
  const data = series.filter(p => p.t >= Date.now() - days * 86400000);
  const last = data.at(-1);
  const total = last ? keys.reduce((s, k) => s + ((last[k.key] as number) ?? 0), 0) : null;
  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5">
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="font-mono text-[10px] text-slate-500 tracking-widest">BASE · TVL BY PROTOCOL</div>
          <div className="font-mono text-xl font-bold text-white mt-0.5">{total != null ? compact(total) : "—"} <span className="font-mono text-[10px] text-slate-600">total · live · DefiLlama</span></div>
        </div>
        <RangeTabs range={range} set={setRange} />
      </div>
      <div className="mb-2"><Legend keys={keys} /></div>
      <div style={{ width: "100%", height: 240 }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#13131f" vertical={false} />
            <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" tickFormatter={fmtAxis}
              tick={{ fill: "#475569", fontSize: 9, fontFamily: "monospace" }} axisLine={{ stroke: "#1A1A2E" }} tickLine={false} minTickGap={48} />
            <YAxis tickFormatter={(v: number) => compact(v)} tick={{ fill: "#475569", fontSize: 9, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={46} />
            <Tooltip content={<ChartTooltip keys={keys} unit="usd" />} />
            {keys.map(k => (
              <Area key={k.key} type="monotone" dataKey={k.key} stackId="1" stroke={k.color} fill={k.color} fillOpacity={0.5} strokeWidth={0.75} isAnimationActive={false} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ApyCompareChart() {
  const { series, keys } = useChart("/api/base-apy-history");
  const [range, setRange] = useState<RangeId>("6M");
  const days = RANGES.find(r => r.id === range)!.days;
  const data = series.filter(p => p.t >= Date.now() - days * 86400000);
  return (
    <div className="card-hover rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5">
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="font-mono text-[10px] text-slate-500 tracking-widest">USDC SUPPLY APY · BASE</div>
          <div className="font-mono text-[11px] text-slate-500 mt-0.5">who pays the best safe rate over time · live · DefiLlama</div>
        </div>
        <RangeTabs range={range} set={setRange} />
      </div>
      <div className="mb-2"><Legend keys={keys} /></div>
      <div style={{ width: "100%", height: 240 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#13131f" vertical={false} />
            <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" tickFormatter={fmtAxis}
              tick={{ fill: "#475569", fontSize: 9, fontFamily: "monospace" }} axisLine={{ stroke: "#1A1A2E" }} tickLine={false} minTickGap={48} />
            <YAxis tickFormatter={(v: number) => `${v.toFixed(0)}%`} tick={{ fill: "#475569", fontSize: 9, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={36} domain={[0, "auto"]} />
            <Tooltip content={<ChartTooltip keys={keys} unit="pct" />} />
            {keys.map((k, i) => (
              <Line key={k.key} type="monotone" dataKey={k.key} stroke={k.color} strokeWidth={1.6} dot={false} connectNulls
                isAnimationActive animationDuration={900} animationBegin={i * 120} animationEasing="ease-out"
                activeDot={{ r: 3, fill: k.color, stroke: "#0a0a0f", strokeWidth: 2 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
