"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import StockMark from "@/components/blue-hood/StockMark";
import type { MarketRow } from "./MarketsTable";

const BLUE = "#3977ff", GREEN = "#50d9a4", RED = "#fa7b8c", MUTED = "#748097";
const number = (v: number) => Math.abs(v) >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v.toFixed(2);
const tooltip = { background: "#111725", border: "1px solid #273247", borderRadius: 12, color: "#edf2fc", fontSize: 12, padding: "12px 16px" };

export function MarketNav({ active }: { active: "overview" | "drift" | "weekend" | "coverage" }) {
  return <nav aria-label="Market views" className="flex gap-4 overflow-x-auto border-b border-white/10 text-[11px] sm:gap-6 sm:text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    {([ ["overview", "/markets", "Overview"], ["drift", "/markets/drift", "Oracle drift"], ["weekend", "/markets/weekend", "Weekend lab"], ["coverage", "/markets/drift/coverage", "Coverage"] ] as const).map(([id, href, label]) => <Link key={id} href={href} aria-current={active === id ? "page" : undefined} className={`whitespace-nowrap border-b-2 pb-4 pt-2 transition-colors ${active === id ? "border-[#3977ff] text-white" : "border-transparent text-[#8390a7] hover:text-white"}`}>{label}</Link>)}
  </nav>;
}

export function MarketHero({ label, title, description, stats }: { label: string; title: string; description: string; stats: { label: string; value: string; detail?: string }[] }) {
  return <header className="relative overflow-hidden py-7 md:py-10">
    <div aria-hidden className="pointer-events-none absolute -right-20 -top-28 h-72 w-96 rounded-full bg-[#1753f2]/10 blur-[90px]" />
    <div className="relative flex flex-col justify-between gap-7 xl:flex-row xl:items-end">
      <div className="max-w-[680px]"><p className="mb-4 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.22em] text-[#8090ac]"><span className="h-1.5 w-1.5 rounded-full bg-[#3977ff]" />BASE 8453 <span className="text-white/20">/</span> {label}</p>
        <h1 className="font-sans text-[38px] font-medium leading-[1.06] tracking-[-0.055em] text-[#f3f6fd] md:text-[56px]">{title}</h1>
        <p className="mt-4 max-w-[580px] font-sans text-[14px] leading-relaxed text-[#8b98af]">{description}</p>
      </div>
      <dl className="grid grid-cols-3 gap-5 border-t border-white/10 pt-5 xl:min-w-[390px] xl:border-0 xl:pt-0">{stats.map((s) => <div key={s.label}><dt className="min-h-[30px] text-[10px] leading-relaxed sm:min-h-[16px] text-[#8896ad]">{s.label}</dt><dd className="mt-2 font-sans text-[25px] font-medium tracking-[-0.04em] text-[#f3f6fd] md:text-[30px]">{s.value}</dd>{s.detail && <p className="mt-1 text-[10px] text-[#64748b]">{s.detail}</p>}</div>)}</dl>
    </div>
  </header>;
}

export function ChartShell({ eyebrow, title, children, aside, note }: { eyebrow: string; title: string; children: React.ReactNode; aside?: React.ReactNode; note: string }) {
  return <section className="min-w-0 rounded-2xl border border-white/[0.09] bg-gradient-to-b from-[#0e1421] to-[#090e18] p-5 md:p-7">
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><p className="text-[10px] uppercase tracking-[0.17em] text-[#7c8da9]">{eyebrow}</p><h2 className="mt-2 font-sans text-[22px] font-medium tracking-[-0.035em] text-[#edf2fc]">{title}</h2></div>{aside}</div>
    {children}<p className="mt-5 border-t border-white/[0.06] pt-4 text-[10px] leading-relaxed text-[#718099]">{note}</p>
  </section>;
}

export function MarketPulse({ rows, asOf }: { rows: MarketRow[]; asOf: string | null }) {
  const stocks = useMemo(() => rows.filter((r) => r.chain === "base" && r.kind === "stock" && r.read && r.pool).sort((a, b) => (b.liq ?? -1) - (a.liq ?? -1)).slice(0, 6), [rows]);
  const [token, setToken] = useState<string | null>(null);
  const [range, setRange] = useState<"1h" | "4h" | "1d">("4h");
  const [candles, setCandles] = useState<{ at: number; close: number | null }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const selected = stocks.find((r) => r.token === token) ?? stocks[0];
  const gradient = useId().replace(/:/g, "");
  useEffect(() => {
    if (!selected?.pool) return;
    const abort = new AbortController();
    setBusy(true); setCandles(null);
    fetch(`/api/markets/candles?chain=base&pool=${encodeURIComponent(selected.pool)}&side=${selected.side}&tf=${range}`, { signal: abort.signal })
      .then((r) => r.ok ? r.json() : null).then((j) => {
        if (abort.signal.aborted) return;
        const valid: number[][] = Array.isArray(j?.candles) ? j.candles.filter((c: number[]) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[4]) && c[4] > 0).sort((a: number[], b: number[]) => a[0] - b[0]) : [];
        const step = range === "1h" ? 3600 : range === "4h" ? 14400 : 86400;
        const points: { at: number; close: number | null }[] = [];
        valid.forEach((c, i) => { if (i && c[0] - valid[i - 1][0] > step * 1.5) points.push({ at: (valid[i - 1][0] + step) * 1000, close: null }); points.push({ at: c[0] * 1000, close: c[4] }); });
        setCandles(valid.length >= 2 ? points : null);
      }).catch(() => { if (!abort.signal.aborted) setCandles(null); }).finally(() => { if (!abort.signal.aborted) setBusy(false); });
    return () => abort.abort();
  }, [selected?.pool, selected?.side, range]);
  const depth = stocks.map((r) => ({ name: `${r.symbol}c`, liquidity: r.liq }));
  return <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(260px,1fr)]">
    <ChartShell eyebrow="THE STOCK DESK" title={selected ? `${selected.name}` : "Pool price history"} note={`Base 8453 · GeckoTerminal pool candle closes, USD per token. Gaps are left open. Snapshot ${asOf ? new Date(asOf).toUTCString() : "unavailable"}.`} aside={<div className="flex rounded-full border border-white/10 bg-black/20 p-1">{([ ["1h", "Hourly"], ["4h", "4-hour"], ["1d", "Daily"] ] as const).map(([tf, text]) => <button type="button" key={tf} aria-pressed={range === tf} onClick={() => setRange(tf)} className={`rounded-full px-3 py-1.5 text-[11px] ${range === tf ? "bg-[#263754] text-white" : "text-[#8090aa] hover:text-white"}`}>{text}</button>)}</div>}>
      <div className="mb-5 flex flex-wrap items-center gap-3"><span className="font-sans text-[36px] font-medium tracking-[-0.05em] text-white">{selected?.price != null ? `$${number(selected.price)}` : "—"}</span><span className="text-xs text-[#7b8aa3]">snapshot price</span>{selected?.change != null && <span className={`rounded-full px-2.5 py-1 text-xs ${selected.change >= 0 ? "bg-[#50d9a4]/10 text-[#50d9a4]" : "bg-[#fa7b8c]/10 text-[#fa7b8c]"}`}>{selected.change >= 0 ? "+" : ""}{selected.change.toFixed(2)}% · 24h</span>}</div>
      <div className="h-[260px] min-w-0 md:h-[300px]" aria-label="Selected Base stock pool price history">
        {candles && !busy ? <ResponsiveContainer width="100%" height="100%" minWidth={0}><AreaChart data={candles} margin={{ top: 12, right: 4, bottom: 0, left: 0 }}><defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={BLUE} stopOpacity={0.32} /><stop offset="100%" stopColor={BLUE} stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#ffffff0b" strokeDasharray="3 5" /><XAxis dataKey="at" type="number" domain={["dataMin", "dataMax"]} scale="time" tickFormatter={(t) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} stroke={MUTED} tickLine={false} axisLine={false} minTickGap={55} fontSize={10} /><YAxis domain={["auto", "auto"]} tickFormatter={(v) => `$${number(v)}`} stroke={MUTED} tickLine={false} axisLine={false} width={65} fontSize={10} /><Tooltip contentStyle={tooltip} labelFormatter={(t) => new Date(Number(t)).toUTCString()} formatter={(v) => [`$${Number(v).toFixed(4)}`, "Pool close"]} /><Area type="linear" dataKey="close" stroke={BLUE} fill={`url(#${gradient})`} strokeWidth={2.4} connectNulls={false} isAnimationActive={false} /></AreaChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-white/10 text-xs text-[#748097]">{busy ? "Reading pool candles…" : "Pool history is temporarily unavailable. Try another interval."}</div>}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">{stocks.map((r) => <button type="button" key={r.token} onClick={() => setToken(r.token)} aria-pressed={selected?.token === r.token} className={`flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] ${selected?.token === r.token ? "border-[#3977ff]/60 bg-[#3977ff]/10 text-white" : "border-white/10 text-[#8290a6] hover:text-white"}`}><StockMark ticker={r.symbol} chain="base" size={18} />{r.symbol}c</button>)}</div>
    </ChartShell>
    <ChartShell eyebrow="LIQUIDITY LANDSCAPE" title="Where the depth is." note="Six deepest readable stock pools in this snapshot. Selected pool liquidity, not a whole-chain total.">
      <div className="h-[300px]" aria-label="Liquidity of the six deepest displayed Base stock pools">{depth.length ? <ResponsiveContainer width="100%" height="100%" minWidth={0}><BarChart layout="vertical" data={depth} margin={{ left: 0, right: 16, top: 5, bottom: 5 }}><CartesianGrid horizontal={false} stroke="#ffffff0b" /><XAxis type="number" tickFormatter={(v) => `$${number(v)}`} stroke={MUTED} fontSize={10} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="name" width={65} stroke="#b4c1d5" fontSize={11} axisLine={false} tickLine={false} /><Tooltip cursor={{ fill: "#ffffff05" }} contentStyle={tooltip} formatter={(v) => [`$${Number(v).toLocaleString()}`, "Pool liquidity"]} /><Bar dataKey="liquidity" radius={[0, 5, 5, 0]} barSize={23} isAnimationActive={false}>{depth.map((r, i) => <Cell key={r.name} fill={i === 0 ? "#6999ff" : BLUE} opacity={1 - i * 0.1} />)}</Bar></BarChart></ResponsiveContainer> : <p className="text-xs text-[#748097]">No readable pool depth in this snapshot.</p>}</div>
      <Link href="/markets/drift" className="mt-5 flex items-center justify-between rounded-xl border border-white/10 px-4 py-4 text-xs text-[#c4d0e4] hover:border-[#3977ff]/50">Explore the oracle gap <span className="text-[#6999ff]">↗</span></Link>
    </ChartShell>
  </div>;
}

export function DriftDistribution({ rows, asOf }: { rows: { ticker: string; drift_pct: number | null }[]; asOf: string | null }) {
  const data = rows.filter((r) => r.drift_pct !== null && Number.isFinite(r.drift_pct)).map((r) => ({ ticker: `${r.ticker}c`, gap: r.drift_pct! })).sort((a, b) => a.gap - b.gap);
  const bound = Math.max(0.5, ...data.map((r) => Math.abs(r.gap))) * 1.15;
  return <ChartShell eyebrow="THE ORACLE GAP" title="One reference. A different market." note={`DEX vs multiplier-adjusted Chainlink · tracked Base stocks only · ${asOf ? new Date(asOf).toUTCString() : "snapshot unavailable"}. Hover a bar for its measured gap.`} aside={<span className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] text-[#6999ff]">● Premium <span className="ml-3 text-[#fa7b8c]">● Discount</span></span>}>
    <div className="h-[350px]" aria-label="Diverging chart of tracked Base stock DEX premiums and discounts">{data.length ? <ResponsiveContainer width="100%" height="100%" minWidth={0}><BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}><CartesianGrid horizontal={false} stroke="#ffffff0b" strokeDasharray="3 5" /><XAxis type="number" domain={[-bound, bound]} tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`} fontSize={10} stroke={MUTED} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="ticker" fontSize={11} stroke="#b2bfd4" width={65} axisLine={false} tickLine={false} /><ReferenceLine x={0} stroke="#94a3b8" strokeOpacity={0.5} /><Tooltip cursor={{ fill: "#ffffff05" }} contentStyle={tooltip} formatter={(v) => [`${Number(v) > 0 ? "+" : ""}${Number(v).toFixed(4)}%`, "DEX vs oracle"]} /><Bar dataKey="gap" radius={4} barSize={15} isAnimationActive={false}>{data.map((r) => <Cell key={r.ticker} fill={r.gap >= 0 ? BLUE : RED} />)}</Bar></BarChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-xs text-[#748097]">No readable drift snapshot. Awaiting DEX and oracle prices.</div>}</div>
  </ChartShell>;
}

export function WeekendHistory({ weekends }: { weekends: { friday: string; rows: { hit: boolean | null }[] }[] }) {
  const data = [...weekends].reverse().map((w) => ({ date: w.friday, right: w.rows.filter((r) => r.hit === true).length, wrong: w.rows.filter((r) => r.hit === false).length, flat: w.rows.filter((r) => r.hit === null).length }));
  return <ChartShell eyebrow="THE TRACK RECORD" title="Every weekend leaves a record." note="Counts of graded stock-weekends in the returned record. Flat means |Sunday gap| < 0.5%; no per-week hit-rate is inferred from these small samples." aside={<div className="flex gap-4 text-[10px] text-[#94a3b8]"><span style={{ color: GREEN }}>● Right</span><span style={{ color: RED }}>● Wrong</span><span>● Flat</span></div>}>
    <div className="h-[260px]" aria-label="Stacked counts of right, wrong and flat stock calls per weekend"><ResponsiveContainer width="100%" height="100%" minWidth={0}><BarChart data={data} barCategoryGap="30%"><CartesianGrid vertical={false} stroke="#ffffff0b" strokeDasharray="3 5" /><XAxis dataKey="date" tickFormatter={(d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} fontSize={10} stroke={MUTED} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} width={28} stroke={MUTED} fontSize={10} axisLine={false} tickLine={false} /><Tooltip contentStyle={tooltip} cursor={{ fill: "#ffffff05" }} /><Bar stackId="calls" dataKey="right" fill={GREEN} isAnimationActive={false} /><Bar stackId="calls" dataKey="wrong" fill={RED} isAnimationActive={false} /><Bar stackId="calls" dataKey="flat" fill="#354258" radius={[4, 4, 0, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></div>
  </ChartShell>;
}

export function CoverageMap({ catalog, rows }: { catalog: { contract: string; symbol: string }[]; rows: { contract: string; issued: boolean | null }[] }) {
  const byAddress = new Map(rows.map((r) => [r.contract.toLowerCase(), r]));
  return <ChartShell eyebrow="THE WHOLE UNIVERSE" title="Every dot is a stock token." note="One dot per official catalog address on Base 8453. Issuance describes onchain supply, not trading eligibility, liquidity or availability of an oracle." aside={<div className="flex flex-wrap gap-4 text-[10px] text-[#8493ad]"><span className="text-[#6b9aff]">● Issued</span><span>● Unissued</span><span className="text-[#d3a75c]">● Unknown / pending</span></div>}>
    <div className="grid grid-cols-[repeat(18,minmax(0,1fr))] gap-1.5 md:grid-cols-[repeat(36,minmax(0,1fr))]" role="list" aria-label="Issuance status of every listed Base stock token">{catalog.map((s) => { const r = byAddress.get(s.contract.toLowerCase()); const state = !r || r.issued === null ? "unknown or pending" : r.issued ? "issued" : "unissued"; return <span key={s.contract} role="listitem" tabIndex={0} title={`${s.symbol} · ${state}`} aria-label={`${s.symbol}: ${state}`} className={`aspect-square rounded-[3px] border transition-transform hover:scale-125 focus:scale-125 focus:outline focus:outline-1 focus:outline-white ${state === "issued" ? "border-[#78a1ff]/40 bg-[#3977ff] shadow-[0_0_9px_#3977ff20]" : state === "unissued" ? "border-white/[0.06] bg-[#202b3b]" : "border-[#d3a75c]/30 bg-[#d3a75c]/30"}`} />; })}</div>
  </ChartShell>;
}
