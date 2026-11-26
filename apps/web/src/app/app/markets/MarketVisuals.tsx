"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import StockMark from "@/components/blue-hood/StockMark";
import type { MarketRow } from "./MarketsTable";

const CYAN = "#4FC3F7", GREEN = "#34D399", RED = "#F87171", MUTED = "#64748B";
const number = (v: number) =>
  Math.abs(v) >= 1e9 ? `${(v / 1e9).toFixed(2)}B`
  : Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M`
  : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(0)}K`
  : v.toFixed(2);
const fmtPrice = (n: number) =>
  n >= 1000 ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  : n >= 1 ? n.toFixed(2)
  : n >= 0.01 ? n.toFixed(4)
  : n.toPrecision(3);

// ── Shared client candle cache + in-flight deduplication ─────────────────────
type RawCandle = [number, number, number, number, number, number];
type PulseRange = "1h" | "4h" | "1d";
type PulsePoint = { at: number; close: number; open: number; high: number; low: number; vol: number };

const pulseCache = new Map<string, PulsePoint[] | null>();
const pulseInflight = new Map<string, Promise<PulsePoint[] | null>>();

function parsePulsePoints(raw: unknown): PulsePoint[] | null {
  if (!Array.isArray(raw)) return null;
  const pts = raw
    .filter((c): c is RawCandle => Array.isArray(c) && c.length >= 5 && Number.isFinite(c[0]) && Number.isFinite(c[4]) && c[4] > 0)
    .map((c) => ({
      at: c[0] * 1000,
      open: c[1],
      high: c[2],
      low: c[3],
      close: c[4],
      vol: Number.isFinite(c[5]) ? c[5] : 0,
    }))
    .sort((a, b) => a.at - b.at);
  return pts.length >= 2 ? pts : null;
}

function fetchPulseCandles(pool: string, side: "base" | "quote", range: PulseRange): Promise<PulsePoint[] | null> {
  const key = `base:${pool.toLowerCase()}:${side}:${range}`;
  if (pulseCache.has(key)) return Promise.resolve(pulseCache.get(key) ?? null);
  const existing = pulseInflight.get(key);
  if (existing) return existing;
  const p = fetch(`/api/markets/candles?chain=base&pool=${encodeURIComponent(pool)}&side=${side}&tf=${range}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const pts = parsePulsePoints(j?.candles);
      if (pts) pulseCache.set(key, pts);
      return pts;
    })
    .catch(() => null)
    .finally(() => pulseInflight.delete(key));
  pulseInflight.set(key, p);
  return p;
}

function fmtPulseTime(ms: number, range: PulseRange): string {
  const d = new Date(ms);
  if (range === "1d") return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} · ${d.toISOString().slice(11, 16)} UTC`;
}

export function MarketNav({ active }: { active: "overview" | "drift" | "weekend" | "intel" | "coverage" }) {
  return (
    <nav aria-label="Market views" className="sticky top-0 z-20 -mt-5 flex shrink-0 gap-4 overflow-x-auto bg-[#070b12] pt-3 border-b border-[#1A1A2E] text-[11px] sm:gap-6 sm:text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {([
        ["overview", "/markets", "Overview"],
        ["drift", "/markets/drift", "Oracle drift"],
        ["weekend", "/markets/weekend", "Weekend lab"],
        ["intel", "/markets/intel", "Intel"],
        ["coverage", "/markets/drift/coverage", "Coverage"],
      ] as const).map(([id, href, label]) => (
        <Link
          key={id}
          href={href}
          aria-current={active === id ? "page" : undefined}
          className={`whitespace-nowrap border-b-2 pb-4 pt-2 transition-colors ${active === id ? "border-[#4FC3F7] text-white" : "border-transparent text-[#8390a7] hover:text-white"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function MarketHero({ label, title, description, stats }: { label: string; title: string; description: string; stats: { label: string; value: string; detail?: string }[] }) {
  return (
    <header className="relative overflow-hidden py-7 md:py-10">
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-28 h-72 w-96 rounded-full bg-[#4FC3F7]/8 blur-[90px]" />
      <div className="relative grid min-w-0 grid-cols-1 gap-7 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-end">
        <div className="max-w-[680px]">
          <p className="mb-4 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.22em] text-[#8090ac]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#4FC3F7]" />BASE 8453 <span className="text-white/20">/</span> {label}
          </p>
          <h1 className="min-h-[101px] font-mono text-[28px] font-semibold md:min-h-[102px] leading-[1.2] tracking-[-0.035em] text-[#f3f6fd] md:text-[42px]">{title}</h1>
          <p className="mt-4 min-h-[84px] max-w-[580px] font-prose md:min-h-[63px] text-[14px] leading-relaxed text-[#8b98af]">{description}</p>
        </div>
        <dl className="grid grid-cols-3 gap-5 border-t border-white/10 pt-5 min-w-0 xl:border-0 xl:pt-0">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="min-h-[30px] text-[10px] leading-relaxed sm:min-h-[16px] text-[#8896ad]">{s.label}</dt>
              <dd className="mt-2 font-mono text-[25px] font-medium tracking-[-0.025em] text-[#f3f6fd] md:text-[30px] tabular-nums">{s.value}</dd>
              {s.detail && <p className="mt-1 text-[10px] text-[#64748b]">{s.detail}</p>}
            </div>
          ))}
        </dl>
      </div>
    </header>
  );
}

export function ChartShell({ eyebrow, title, children, aside, note }: { eyebrow: string; title: string; children: React.ReactNode; aside?: React.ReactNode; note: string }) {
  return (
    <section className="min-w-0 rounded-2xl border border-[#1A1A2E] bg-gradient-to-b from-[#0c1220] to-[#080c15] p-5 md:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.17em] text-[#4FC3F7]/80">{eyebrow}</p>
          <h2 className="mt-1.5 font-mono text-[21px] font-medium tracking-[-0.03em] text-[#edf2fc]">{title}</h2>
        </div>
        {aside}
      </div>
      {children}
      <p className="mt-5 border-t border-[#1A1A2E] pt-3.5 font-prose text-[11px] leading-relaxed text-[#64748B]">{note}</p>
    </section>
  );
}

export function MarketPulse({
  rows,
  asOf,
  initialPool,
  initialCandles,
}: {
  rows: MarketRow[];
  asOf: string | null;
  initialPool?: string | null;
  initialCandles?: RawCandle[] | null;
}) {
  const stocks = useMemo(
    () => rows.filter((r) => r.chain === "base" && r.kind === "stock" && r.read && r.pool).sort((a, b) => (b.liq ?? -1) - (a.liq ?? -1)),
    [rows],
  );
  const [token, setToken] = useState<string | null>(null);
  const [range, setRange] = useState<PulseRange>("4h");
  const selected = stocks.find((r) => r.token === token) ?? stocks[0];

  const initialPoints = useMemo(() => {
    const pts = parsePulsePoints(initialCandles);
    if (pts && initialPool && selected?.pool && initialPool.toLowerCase() === selected.pool.toLowerCase()) {
      pulseCache.set(`base:${selected.pool.toLowerCase()}:${selected.side}:4h`, pts);
    }
    return pts;
  }, [initialCandles, initialPool, selected?.pool, selected?.side]);

  const activeKey = selected?.pool ? `base:${selected.pool.toLowerCase()}:${selected.side}:${range}` : "";
  const [series, setSeries] = useState<PulsePoint[] | null>(() => {
    if (activeKey && pulseCache.has(activeKey)) return pulseCache.get(activeKey) ?? null;
    if (range === "4h" && initialPool && selected?.pool && initialPool.toLowerCase() === selected.pool.toLowerCase()) {
      return initialPoints;
    }
    return null;
  });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hoverDepth, setHoverDepth] = useState<string | null>(null);

  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const gradId = useId().replace(/:/g, "");

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0) setWidth(el.clientWidth);
    });
    ro.observe(el);
    if (el.clientWidth > 0) setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!selected?.pool) return;
    const key = `base:${selected.pool.toLowerCase()}:${selected.side}:${range}`;
    setHoverIdx(null);
    if (pulseCache.has(key)) {
      const hit = pulseCache.get(key) ?? null;
      setSeries(hit);
      setFailed(!hit);
      setBusy(false);
      return;
    }
    let alive = true;
    setBusy(true);
    setFailed(false);
    fetchPulseCandles(selected.pool, selected.side, range).then((pts) => {
      if (!alive) return;
      if (pts) {
        setSeries(pts);
        setFailed(false);
      } else {
        setFailed(true);
      }
      setBusy(false);
    });
    return () => { alive = false; };
  }, [selected?.pool, selected?.side, range]);

  const prefetch = useCallback((pool: string | null, side: "base" | "quote", tf: PulseRange) => {
    if (!pool) return;
    void fetchPulseCandles(pool, side, tf);
  }, []);

  const H = 264, PAD_T = 14, PAD_B = 26, PAD_R = 58;
  const chart = useMemo(() => {
    if (!series || series.length < 2) return null;
    const plotW = Math.max(180, width - PAD_R);
    const plotH = H - PAD_T - PAD_B;
    const closes = series.map((p) => p.close);
    const rawLo = Math.min(...closes);
    const rawHi = Math.max(...closes);
    const pad = (rawHi - rawLo) * 0.08 || rawHi * 0.005 || 1;
    const lo = rawLo - pad;
    const hi = rawHi + pad;
    const span = hi - lo || 1;
    const xAt = (i: number) => (i / (series.length - 1)) * plotW;
    const yAt = (v: number) => PAD_T + (1 - (v - lo) / span) * plotH;

    const stepMs = range === "1h" ? 3_600_000 : range === "4h" ? 14_400_000 : 86_400_000;
    const segments: string[] = [];
    const areaSegments: string[] = [];
    let segPts: { x: number; y: number }[] = [];

    const flushSeg = () => {
      if (segPts.length === 0) return;
      const d = segPts.map((p, idx) => `${idx === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
      segments.push(d);
      const first = segPts[0], last = segPts[segPts.length - 1];
      areaSegments.push(`${d} L${last.x.toFixed(1)},${(PAD_T + plotH).toFixed(1)} L${first.x.toFixed(1)},${(PAD_T + plotH).toFixed(1)} Z`);
      segPts = [];
    };

    series.forEach((p, i) => {
      if (i > 0 && p.at - series[i - 1].at > stepMs * 2.5) flushSeg();
      segPts.push({ x: xAt(i), y: yAt(p.close) });
    });
    flushSeg();

    const first = series[0];
    const last = series[series.length - 1];
    const ticks = [0, 0.33, 0.66, 1].map((f) => {
      const v = lo + span * f;
      return { v, y: yAt(v) };
    });
    const xTicks = [0, Math.floor((series.length - 1) * 0.33), Math.floor((series.length - 1) * 0.66), series.length - 1]
      .filter((v, idx, arr) => arr.indexOf(v) === idx)
      .map((idx) => ({
        x: xAt(idx),
        label: new Date(series[idx].at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      }));

    return { plotW, plotH, xAt, yAt, segments, areaSegments, first, last, ticks, xTicks };
  }, [series, width, range]);

  const activePoint = hoverIdx !== null && series ? series[hoverIdx] : chart?.last ?? null;
  const displayPrice = activePoint?.close ?? selected?.price ?? null;
  const rangePct = useMemo(() => {
    if (!activePoint || !chart) return selected?.change ?? null;
    return chart.first.close > 0 ? ((activePoint.close - chart.first.close) / chart.first.close) * 100 : null;
  }, [activePoint, chart, selected?.change]);
  const strokeColor = rangePct === null ? CYAN : rangePct >= 0 ? GREEN : RED;

  const handlePointer = useCallback((clientX: number, rect: DOMRect) => {
    if (!series || !chart) return;
    const relX = Math.max(0, Math.min(chart.plotW, clientX - rect.left));
    const idx = Math.round((relX / chart.plotW) * (series.length - 1));
    setHoverIdx(Math.max(0, Math.min(series.length - 1, idx)));
  }, [series, chart]);

  const depth = stocks.slice(0, 8);
  const maxDepth = Math.max(1, ...depth.map((d) => d.liq ?? 0));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)]">
      <ChartShell
        eyebrow="THE STOCK DESK"
        title={selected ? `${selected.name} (${selected.symbol}c)` : "Pool price history"}
        note={`Base 8453 · GeckoTerminal pool candle closes, USD per token. Snapshot ${asOf ? new Date(asOf).toUTCString() : "unavailable"}.`}
        aside={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-[#1A1A2E] bg-[#070b12] p-0.5">
              {([["1h", "1H"], ["4h", "4H"], ["1d", "1D"]] as const).map(([tf, text]) => (
                <button
                  type="button"
                  key={tf}
                  aria-pressed={range === tf}
                  onMouseEnter={() => prefetch(selected?.pool ?? null, selected?.side ?? "base", tf)}
                  onClick={() => setRange(tf)}
                  className={`rounded-md px-2.5 py-1 font-mono text-[11px] font-medium transition-colors ${
                    range === tf ? "bg-[#4FC3F7]/15 text-[#4FC3F7] border border-[#4FC3F7]/40" : "border border-transparent text-[#64748B] hover:text-white"
                  }`}
                >
                  {text}
                </button>
              ))}
            </div>
            {selected && (
              <Link
                href={`/markets/base/${selected.token}`}
                className="rounded-lg border border-[#1A1A2E] bg-[#070b12] px-2.5 py-1.5 font-mono text-[11px] text-[#94A3B8] hover:border-[#4FC3F7]/40 hover:text-[#4FC3F7] transition-colors"
              >
                Details
              </Link>
            )}
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap items-baseline gap-3">
          <span className="font-mono text-[34px] font-semibold tracking-[-0.03em] text-white tabular-nums leading-none">
            {displayPrice != null ? `$${fmtPrice(displayPrice)}` : "—"}
          </span>
          {rangePct !== null && (
            <span
              className="rounded-md px-2 py-0.5 font-mono text-[12px] font-medium tabular-nums"
              style={{
                background: rangePct >= 0 ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)",
                color: rangePct >= 0 ? GREEN : RED,
              }}
            >
              {rangePct >= 0 ? "+" : ""}{rangePct.toFixed(2)}%
            </span>
          )}
          <span className="font-mono text-[11px] text-[#64748B] tabular-nums">
            {hoverIdx !== null && activePoint
              ? fmtPulseTime(activePoint.at, range)
              : busy ? "updating..." : `${range.toUpperCase()} window`}
          </span>
        </div>

        <div
          ref={boxRef}
          className="relative w-full select-none touch-none"
          style={{ height: H }}
          aria-label="Selected Base stock pool price history"
        >
          {chart && series ? (
            <svg
              width={width}
              height={H}
              className={`block transition-opacity duration-150 ${busy ? "opacity-45" : "opacity-100"}`}
              onMouseMove={(e) => handlePointer(e.clientX, e.currentTarget.getBoundingClientRect())}
              onMouseLeave={() => setHoverIdx(null)}
              onTouchMove={(e) => {
                const t = e.touches[0];
                if (t) handlePointer(t.clientX, e.currentTarget.getBoundingClientRect());
              }}
              onTouchEnd={() => setHoverIdx(null)}
            >
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={strokeColor} stopOpacity={0.26} />
                  <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
                </linearGradient>
              </defs>

              {chart.ticks.map((t, i) => (
                <g key={i}>
                  <line x1={0} x2={chart.plotW} y1={t.y} y2={t.y} stroke="#1A1A2E" strokeDasharray="2 4" />
                  <text x={chart.plotW + 8} y={t.y + 3.5} fill={MUTED} fontSize={10.5} className="font-mono tabular-nums">
                    ${fmtPrice(t.v)}
                  </text>
                </g>
              ))}

              <line
                x1={0}
                x2={chart.plotW}
                y1={chart.yAt(chart.first.close)}
                y2={chart.yAt(chart.first.close)}
                stroke="#475569"
                strokeOpacity={0.45}
                strokeDasharray="3 4"
              />

              {chart.areaSegments.map((d, i) => (
                <path key={`a-${i}`} d={d} fill={`url(#${gradId})`} />
              ))}
              {chart.segments.map((d, i) => (
                <path
                  key={`l-${i}`}
                  d={d}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}

              {hoverIdx !== null && activePoint ? (
                <g pointerEvents="none">
                  <line
                    x1={chart.xAt(hoverIdx)}
                    x2={chart.xAt(hoverIdx)}
                    y1={PAD_T}
                    y2={PAD_T + chart.plotH}
                    stroke="#64748B"
                    strokeDasharray="2 3"
                  />
                  <circle cx={chart.xAt(hoverIdx)} cy={chart.yAt(activePoint.close)} r={7} fill={strokeColor} fillOpacity={0.2} />
                  <circle cx={chart.xAt(hoverIdx)} cy={chart.yAt(activePoint.close)} r={3.5} fill={strokeColor} stroke="#070b12" strokeWidth={1.5} />
                </g>
              ) : (
                <g pointerEvents="none">
                  <circle cx={chart.xAt(series.length - 1)} cy={chart.yAt(chart.last.close)} r={6} fill={strokeColor} fillOpacity={0.22} />
                  <circle cx={chart.xAt(series.length - 1)} cy={chart.yAt(chart.last.close)} r={3} fill={strokeColor} />
                </g>
              )}

              {chart.xTicks.map((t, i) => (
                <text
                  key={i}
                  x={t.x}
                  y={H - 6}
                  fill={MUTED}
                  fontSize={10.5}
                  textAnchor={i === 0 ? "start" : i === chart.xTicks.length - 1 ? "end" : "middle"}
                  className="font-mono"
                >
                  {t.label}
                </text>
              ))}
            </svg>
          ) : (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-[#1A1A2E] text-xs text-[#64748B]">
              {busy ? "Loading pool candles..." : failed ? "Pool history is temporarily unavailable. Try another interval." : "Select a stock pool to view history."}
            </div>
          )}
        </div>

        <div className="mt-4 flex max-h-[124px] flex-wrap gap-1.5 overflow-y-auto pr-1">
          {stocks.map((r) => {
            const on = selected?.token === r.token;
            return (
              <button
                type="button"
                key={r.token}
                onMouseEnter={() => prefetch(r.pool, r.side, range)}
                onClick={() => setToken(r.token)}
                aria-pressed={on}
                className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 font-mono text-[11px] transition-colors ${
                  on
                    ? "border-[#4FC3F7]/55 bg-[#4FC3F7]/12 text-white"
                    : "border-[#1A1A2E] bg-[#070b12] text-[#8290a6] hover:border-[#2a3350] hover:text-white"
                }`}
              >
                {r.logo ? (
                  <img src={r.logo} alt="" width={16} height={16} loading="lazy" className="h-4 w-4 rounded-full object-cover" />
                ) : (
                  <StockMark ticker={r.symbol} chain="base" size={16} />
                )}
                <span>{r.symbol}c</span>
                {r.change !== null && (
                  <span className={r.change >= 0 ? "text-[#34D399]" : "text-[#F87171]"}>
                    {r.change >= 0 ? "+" : ""}{r.change.toFixed(1)}%
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </ChartShell>

      {/* Instant native SVG Liquidity Landscape */}
      <ChartShell eyebrow="LIQUIDITY LANDSCAPE" title="Where the depth is." note="Eight deepest readable stock pools in this snapshot. Selected pool liquidity, not a whole-chain total.">
        {depth.length ? (
          <div className="space-y-2.5" aria-label="Liquidity of the eight deepest displayed Base stock pools">
            {depth.map((r, i) => {
              const liq = r.liq ?? 0;
              const pct = Math.max(4, (liq / maxDepth) * 100);
              const isHover = hoverDepth === r.token;
              return (
                <Link
                  key={r.token}
                  href={`/markets/base/${r.token}`}
                  onMouseEnter={() => setHoverDepth(r.token)}
                  onMouseLeave={() => setHoverDepth(null)}
                  className="block rounded-lg px-2 py-1.5 -mx-2 hover:bg-[#111827] transition-colors"
                >
                  <div className="flex items-center justify-between text-[12px] font-mono mb-1">
                    <span className={isHover ? "text-[#4FC3F7]" : "text-[#CBD5E1]"}>{r.symbol}c</span>
                    <span className="text-[#94A3B8] tabular-nums">${number(liq)}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-[#131a29] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-150"
                      style={{
                        width: `${pct}%`,
                        background: CYAN,
                        opacity: isHover ? 1 : Math.max(0.38, 0.92 - i * 0.08),
                      }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-[#64748B]">No readable pool depth in this snapshot.</p>
        )}
        <Link href="/markets/drift" className="mt-5 flex items-center justify-between rounded-xl border border-[#1A1A2E] bg-[#070b12] px-4 py-3.5 text-xs text-[#c4d0e4] hover:border-[#4FC3F7]/45 hover:text-white transition-colors">
          <span>Explore the oracle gap</span>
          <span className="text-[#4FC3F7]">Open</span>
        </Link>
      </ChartShell>
    </div>
  );
}

export function DriftDistribution({
  rows,
  asOf,
}: {
  rows: { ticker: string; contract?: string; drift_pct: number | null; oracle_usd?: number | null; dex_usd?: number | null }[];
  asOf: string | null;
}) {
  const data = useMemo(
    () =>
      rows
        .filter((r) => r.drift_pct !== null && Number.isFinite(r.drift_pct))
        .map((r) => ({
          ticker: `${r.ticker}c`,
          contract: r.contract,
          gap: r.drift_pct!,
          oracle: r.oracle_usd ?? null,
          dex: r.dex_usd ?? null,
        }))
        .sort((a, b) => a.gap - b.gap),
    [rows],
  );
  const [hovered, setHovered] = useState<(typeof data)[number] | null>(null);
  const bound = Math.max(0.5, ...data.map((r) => Math.abs(r.gap)));

  return (
    <ChartShell
      eyebrow="THE ORACLE GAP"
      title="One reference. A different market."
      note={`DEX vs multiplier-adjusted Chainlink · tracked Base stocks only · ${asOf ? new Date(asOf).toUTCString() : "snapshot unavailable"}. Hover a bar for its measured gap.`}
      aside={
        <div className="flex items-center gap-3 text-[11px] font-mono">
          {hovered ? (
            <span className="rounded-lg border border-[#1A1A2E] bg-[#070b12] px-3 py-1 text-[#E2E8F0] tabular-nums">
              {hovered.ticker}{" "}
              <span style={{ color: hovered.gap >= 0 ? CYAN : RED }}>
                {hovered.gap > 0 ? "+" : ""}{hovered.gap.toFixed(3)}%
              </span>
              {hovered.oracle != null && hovered.dex != null && (
                <span className="text-[#64748B]"> · ${hovered.dex.toFixed(2)} vs ${hovered.oracle.toFixed(2)}</span>
              )}
            </span>
          ) : (
            <span className="rounded-lg border border-[#1A1A2E] px-3 py-1 text-[#4FC3F7]">
              Premium <span className="ml-3 text-[#F87171]">Discount</span>
            </span>
          )}
        </div>
      }
    >
      {data.length ? (
        <div className="space-y-1.5" aria-label="Diverging chart of tracked Base stock DEX premiums and discounts">
          <div className="grid grid-cols-[64px_1fr_72px] items-center gap-3 pb-1 text-[10px] font-mono text-[#64748B]">
            <span>STOCK</span>
            <div className="flex justify-between tabular-nums">
              <span>-{bound.toFixed(2)}%</span>
              <span>0%</span>
              <span>+{bound.toFixed(2)}%</span>
            </div>
            <span className="text-right">GAP</span>
          </div>
          {data.map((r) => {
            const pct = Math.min(50, (Math.abs(r.gap) / bound) * 50);
            const pos = r.gap >= 0;
            const col = pos ? CYAN : RED;
            const inner = (
              <div
                onMouseEnter={() => setHovered(r)}
                onMouseLeave={() => setHovered(null)}
                className="grid grid-cols-[64px_1fr_72px] items-center gap-3 rounded-lg px-2 py-1.5 -mx-2 hover:bg-[#111827] transition-colors"
              >
                <span className="font-mono text-[12px] text-[#CBD5E1]">{r.ticker}</span>
                <div className="relative h-3.5 rounded bg-[#0c1220]">
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[#475569]/60" />
                  <div
                    className="absolute top-0.5 bottom-0.5 rounded-sm transition-all"
                    style={{
                      width: `${Math.max(1.5, pct)}%`,
                      background: col,
                      opacity: hovered?.ticker === r.ticker ? 1 : 0.85,
                      ...(pos ? { left: "50%" } : { right: "50%" }),
                    }}
                  />
                </div>
                <span className="text-right font-mono text-[12px] tabular-nums" style={{ color: col }}>
                  {r.gap > 0 ? "+" : ""}{r.gap.toFixed(2)}%
                </span>
              </div>
            );
            return r.contract ? (
              <Link key={r.ticker} href={`/markets/base/${r.contract}`} className="block">
                {inner}
              </Link>
            ) : (
              <div key={r.ticker}>{inner}</div>
            );
          })}
        </div>
      ) : (
        <div className="flex h-[220px] items-center justify-center text-xs text-[#64748B]">
          No readable drift snapshot. Awaiting DEX and oracle prices.
        </div>
      )}
    </ChartShell>
  );
}

export function WeekendHistory({ weekends }: { weekends: { friday: string; rows: { hit: boolean | null }[] }[] }) {
  const data = useMemo(
    () =>
      [...weekends].reverse().map((w) => ({
        date: w.friday,
        right: w.rows.filter((r) => r.hit === true).length,
        wrong: w.rows.filter((r) => r.hit === false).length,
        flat: w.rows.filter((r) => r.hit === null).length,
        total: w.rows.length,
      })),
    [weekends],
  );
  const [hovered, setHovered] = useState<(typeof data)[number] | null>(null);
  const maxTotal = Math.max(1, ...data.map((d) => d.total));

  return (
    <ChartShell
      eyebrow="THE TRACK RECORD"
      title="Every weekend leaves a record."
      note="Counts of graded stock-weekends in the returned record. Flat means |Sunday gap| < 0.5%; click any bar to inspect its replay."
      aside={
        <div className="flex items-center gap-4 text-[10px] font-mono text-[#94a3b8]">
          {hovered ? (
            <span className="rounded-lg border border-[#1A1A2E] bg-[#070b12] px-2.5 py-1 text-[#E2E8F0] tabular-nums">
              {new Date(hovered.date + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} ·{" "}
              <span style={{ color: GREEN }}>{hovered.right} right</span> ·{" "}
              <span style={{ color: RED }}>{hovered.wrong} wrong</span> · {hovered.flat} flat
            </span>
          ) : (
            <>
              <span style={{ color: GREEN }}>Right</span>
              <span style={{ color: RED }}>Wrong</span>
              <span>Flat</span>
            </>
          )}
        </div>
      }
    >
      <div className="h-[220px] flex items-end gap-2 pt-4 pb-6 border-b border-[#1A1A2E]" aria-label="Stacked counts of right, wrong and flat stock calls per weekend">
        {data.map((d) => {
          const barH = Math.max(12, (d.total / maxTotal) * 165);
          const rH = (d.right / Math.max(1, d.total)) * barH;
          const wH = (d.wrong / Math.max(1, d.total)) * barH;
          const fH = (d.flat / Math.max(1, d.total)) * barH;
          const lbl = new Date(d.date + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
          return (
            <Link
              key={d.date}
              href={`/markets/weekend?w=${d.date}`}
              onMouseEnter={() => setHovered(d)}
              onMouseLeave={() => setHovered(null)}
              className="group relative flex-1 min-w-[20px] flex flex-col items-center justify-end h-full"
            >
              <div className="w-full max-w-[38px] rounded-t-md overflow-hidden flex flex-col-reverse transition-opacity group-hover:opacity-90">
                {d.right > 0 && <div style={{ height: rH, background: GREEN }} />}
                {d.wrong > 0 && <div style={{ height: wH, background: RED }} />}
                {d.flat > 0 && <div style={{ height: fH, background: "#334155" }} />}
              </div>
              <span className="absolute -bottom-5 font-mono text-[10px] text-[#64748B] group-hover:text-[#4FC3F7] whitespace-nowrap">
                {lbl}
              </span>
            </Link>
          );
        })}
      </div>
    </ChartShell>
  );
}

export function CoverageMap({ catalog, rows }: { catalog: { contract: string; symbol: string }[]; rows: { contract: string; issued: boolean | null }[] }) {
  const byAddress = useMemo(() => new Map(rows.map((r) => [r.contract.toLowerCase(), r])), [rows]);
  const [active, setActive] = useState<{ symbol: string; contract: string; state: string } | null>(null);

  return (
    <ChartShell
      eyebrow="THE WHOLE UNIVERSE"
      title="Every dot is a stock token."
      note="One dot per official catalog address on Base 8453. Hover to inspect or click an issued token to open its market page."
      aside={
        <div className="flex flex-wrap items-center gap-4 text-[10px] font-mono text-[#8493ad]">
          {active ? (
            <span className="rounded-lg border border-[#1A1A2E] bg-[#070b12] px-2.5 py-1 text-[#E2E8F0]">
              {active.symbol} · <span className={active.state === "issued" ? "text-[#4FC3F7]" : "text-[#94A3B8]"}>{active.state}</span>
            </span>
          ) : (
            <>
              <span className="text-[#4FC3F7]">Issued</span>
              <span>Unissued</span>
              <span className="text-[#d3a75c]">Unknown / pending</span>
            </>
          )}
        </div>
      }
    >
      <div className="grid grid-cols-[repeat(18,minmax(0,1fr))] gap-1.5 md:grid-cols-[repeat(36,minmax(0,1fr))]" role="list" aria-label="Issuance status of every listed Base stock token">
        {catalog.map((s) => {
          const r = byAddress.get(s.contract.toLowerCase());
          const state = !r || r.issued === null ? "unknown or pending" : r.issued ? "issued" : "unissued";
          const cls = `block aspect-square rounded-[3px] border transition-transform hover:scale-125 focus:scale-125 focus:outline focus:outline-1 focus:outline-white ${
            state === "issued"
              ? "border-[#4FC3F7]/40 bg-[#4FC3F7] shadow-[0_0_9px_#4FC3F720]"
              : state === "unissued"
              ? "border-white/[0.06] bg-[#1a2233]"
              : "border-[#d3a75c]/30 bg-[#d3a75c]/30"
          }`;
          if (state === "issued") {
            return (
              <Link
                key={s.contract}
                href={`/markets/base/${s.contract}`}
                role="listitem"
                title={`${s.symbol} · ${state}`}
                aria-label={`${s.symbol}: ${state}`}
                onMouseEnter={() => setActive({ symbol: s.symbol, contract: s.contract, state })}
                onFocus={() => setActive({ symbol: s.symbol, contract: s.contract, state })}
                onMouseLeave={() => setActive(null)}
                className={cls}
              />
            );
          }
          return (
            <span
              key={s.contract}
              role="listitem"
              tabIndex={0}
              title={`${s.symbol} · ${state}`}
              aria-label={`${s.symbol}: ${state}`}
              onMouseEnter={() => setActive({ symbol: s.symbol, contract: s.contract, state })}
              onFocus={() => setActive({ symbol: s.symbol, contract: s.contract, state })}
              onMouseLeave={() => setActive(null)}
              className={cls}
            />
          );
        })}
      </div>
    </ChartShell>
  );
}
