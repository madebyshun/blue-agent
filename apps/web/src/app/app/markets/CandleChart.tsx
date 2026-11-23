"use client";

// Interactive chart for a Markets token page:
//   - Area mode (crisp line + gradient fill + opening baseline + live scrub)
//   - Candles mode (OHLC candlesticks + volume bars)
// Timeframes 15m / 1h / 4h / 1D with module-level cache + hover prefetch so
// switching intervals is instant and never flashes blank.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

type Candle = [number, number, number, number, number, number];
type Tf = "15m" | "1h" | "4h" | "1d";
type Mode = "area" | "candles";
const TFS: [Tf, string][] = [["15m", "15m"], ["1h", "1H"], ["4h", "4H"], ["1d", "1D"]];

const UP = "#34D399", DOWN = "#F87171", CYAN = "#4FC3F7", GRID = "#1A1A2E", AXIS = "#64748B";
const fmt = (n: number) =>
  n >= 1000 ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  : n >= 1 ? n.toFixed(2)
  : n >= 0.01 ? n.toFixed(4)
  : n.toPrecision(3);
const fmtVol = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M`
  : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}k`
  : `$${n.toFixed(0)}`;
const when = (t: number, tf: Tf) => {
  const d = new Date(t * 1000).toISOString();
  return tf === "1d" ? d.slice(0, 10) : `${d.slice(5, 10)} ${d.slice(11, 16)}Z`;
};

// Shared in-memory cache + in-flight deduplication across navigations
const candleCache = new Map<string, Candle[] | null>();
const candleInflight = new Map<string, Promise<Candle[] | null>>();

function fetchCandles(chain: string, pool: string, side: "base" | "quote", tf: Tf): Promise<Candle[] | null> {
  const key = `${chain}:${pool.toLowerCase()}:${side}:${tf}`;
  if (candleCache.has(key)) return Promise.resolve(candleCache.get(key) ?? null);
  const cur = candleInflight.get(key);
  if (cur) return cur;
  const p = fetch(`/api/markets/candles?chain=${chain}&pool=${encodeURIComponent(pool)}&side=${side}&tf=${tf}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const list = Array.isArray(j?.candles) ? (j.candles as Candle[]) : null;
      if (list) candleCache.set(key, list);
      return list;
    })
    .catch(() => null)
    .finally(() => candleInflight.delete(key));
  candleInflight.set(key, p);
  return p;
}

export default function CandleChart({
  chain,
  pool,
  side,
  initial,
  source,
}: {
  chain: string;
  pool: string;
  side: "base" | "quote";
  initial: Candle[];
  source: string;
}) {
  const [tf, setTf] = useState<Tf>("1h");
  const [mode, setMode] = useState<Mode>("area");
  const [data, setData] = useState<Record<string, Candle[] | null>>(() => {
    const key = `${chain}:${pool.toLowerCase()}:${side}:1h`;
    if (initial.length > 0) candleCache.set(key, initial);
    return { "1h": initial };
  });
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(900);
  const gradId = useId().replace(/:/g, "");

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0) setW(el.clientWidth);
    });
    ro.observe(el);
    if (el.clientWidth > 0) setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (tf in data) return;
    const key = `${chain}:${pool.toLowerCase()}:${side}:${tf}`;
    if (candleCache.has(key)) {
      setData((d) => ({ ...d, [tf]: candleCache.get(key) ?? null }));
      return;
    }
    let alive = true;
    setBusy(true);
    fetchCandles(chain, pool, side, tf).then((list) => {
      if (!alive) return;
      setData((d) => ({ ...d, [tf]: list }));
      setBusy(false);
    });
    return () => { alive = false; };
  }, [tf, data, chain, pool, side]);

  const prefetch = useCallback((target: Tf) => {
    if (target in data) return;
    void fetchCandles(chain, pool, side, target);
  }, [data, chain, pool, side]);

  // Keep previous timeframe visible while loading a new one (zero-flicker)
  const currentCandles = data[tf];
  const fallbackCandles = data["1h"] ?? Object.values(data).find((v) => v && v.length >= 2) ?? null;
  const candles = currentCandles !== undefined ? currentCandles : fallbackCandles;

  const H = 290, VH = 56, PAD_R = 68, PAD_T = 14;
  const geo = useMemo(() => {
    if (!candles || candles.length < 2) return null;
    const rawLo = Math.min(...candles.map((c) => (mode === "area" ? c[4] : c[3])));
    const rawHi = Math.max(...candles.map((c) => (mode === "area" ? c[4] : c[2])));
    const pad = (rawHi - rawLo) * 0.06 || rawHi * 0.005 || 1;
    const lo = rawLo - pad, hi = rawHi + pad;
    const span = hi - lo || 1;
    const vmax = Math.max(...candles.map((c) => c[5]), 1e-9);
    const plotW = Math.max(120, w - PAD_R);
    const step = plotW / candles.length;
    const xAt = (i: number) => (mode === "area" ? (i / (candles.length - 1)) * plotW : i * step + step / 2);
    const y = (v: number) => PAD_T + (1 - (v - lo) / span) * (H - PAD_T * 2);

    const linePath = candles.map((c, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${y(c[4]).toFixed(1)}`).join(" ");
    const areaPath = `${linePath} L${xAt(candles.length - 1).toFixed(1)},${H} L${xAt(0).toFixed(1)},${H} Z`;
    return { lo, hi, span, vmax, plotW, step, xAt, y, linePath, areaPath };
  }, [candles, w, mode]);

  const shown = hover !== null && candles ? candles[hover] : candles?.[candles.length - 1];
  const first = candles?.[0];
  const chg = shown && first && first[1] > 0 ? ((shown[4] - first[1]) / first[1]) * 100 : null;
  const trendColor = chg === null ? CYAN : chg >= 0 ? UP : DOWN;

  const handlePointer = useCallback((clientX: number, rect: DOMRect) => {
    if (!candles || !geo) return;
    const relX = Math.max(0, Math.min(geo.plotW, clientX - rect.left));
    const idx = mode === "area"
      ? Math.round((relX / geo.plotW) * (candles.length - 1))
      : Math.floor(relX / geo.step);
    setHover(Math.max(0, Math.min(candles.length - 1, idx)));
  }, [candles, geo, mode]);

  return (
    <div>
      {/* Top toolbar: live scrub readout + timeframe + Area/Candles switch */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-2.5">
          {shown && (
            <>
              <span className="font-mono text-[26px] font-semibold tracking-[-0.03em] text-white tabular-nums leading-none">
                ${fmt(shown[4])}
              </span>
              {chg !== null && (
                <span
                  className="rounded-md px-2 py-0.5 font-mono text-[12px] font-medium tabular-nums"
                  style={{
                    background: chg >= 0 ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)",
                    color: chg >= 0 ? UP : DOWN,
                  }}
                >
                  {chg >= 0 ? "+" : ""}{chg.toFixed(2)}%
                </span>
              )}
              <span className="font-mono text-[12px] text-[#64748B] tabular-nums">{when(shown[0], tf)}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-[#1A1A2E] bg-[#070b12] p-0.5">
            {([["area", "Area"], ["candles", "Candles"]] as const).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-md px-2.5 py-1 font-mono text-[11px] font-medium transition-colors ${
                  mode === m ? "bg-[#4FC3F7]/15 text-[#4FC3F7] border border-[#4FC3F7]/40" : "border border-transparent text-[#64748B] hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex rounded-lg border border-[#1A1A2E] bg-[#070b12] p-0.5">
            {TFS.map(([id, l]) => (
              <button
                key={id}
                type="button"
                onMouseEnter={() => prefetch(id)}
                onClick={() => { setTf(id); setHover(null); }}
                className={`rounded-md px-2.5 py-1 font-mono text-[11px] font-medium transition-colors ${
                  tf === id ? "bg-[#4FC3F7]/15 text-[#4FC3F7] border border-[#4FC3F7]/40" : "border border-transparent text-[#64748B] hover:text-white"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* OHLCV strip */}
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] tabular-nums">
        {shown && (
          <>
            <span className="text-[#64748B]">O <span className="text-[#CBD5E1]">{fmt(shown[1])}</span></span>
            <span className="text-[#64748B]">H <span className="text-[#CBD5E1]">{fmt(shown[2])}</span></span>
            <span className="text-[#64748B]">L <span className="text-[#CBD5E1]">{fmt(shown[3])}</span></span>
            <span className="text-[#64748B]">C <span style={{ color: shown[4] >= shown[1] ? UP : DOWN }}>{fmt(shown[4])}</span></span>
            <span className="text-[#64748B]">Vol <span className="text-[#CBD5E1]">{fmtVol(shown[5])}</span></span>
          </>
        )}
        <span className="ml-auto text-[11px] text-[#64748B]">{busy ? "updating..." : source}</span>
      </div>

      <div ref={box} className="relative w-full select-none touch-none" style={{ height: H + VH + 24 }}>
        {currentCandles === null ? (
          <p className="pt-24 text-center text-[13px] text-[#64748B]">GeckoTerminal is rate-limiting right now; pick the timeframe again in a minute.</p>
        ) : !geo || !candles ? (
          <p className="pt-24 text-center text-[13px] text-[#64748B]">{busy ? "Loading candles..." : "No candles for this pool and timeframe yet."}</p>
        ) : (
          <svg
            width={w}
            height={H + VH + 24}
            className={`block transition-opacity duration-150 ${busy ? "opacity-45" : "opacity-100"}`}
            onMouseMove={(e) => handlePointer(e.clientX, e.currentTarget.getBoundingClientRect())}
            onMouseLeave={() => setHover(null)}
            onTouchMove={(e) => {
              const t = e.touches[0];
              if (t) handlePointer(t.clientX, e.currentTarget.getBoundingClientRect());
            }}
            onTouchEnd={() => setHover(null)}
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={trendColor} stopOpacity={0.25} />
                <stop offset="100%" stopColor={trendColor} stopOpacity={0} />
              </linearGradient>
            </defs>

            {/* Price grid */}
            {[0, 0.25, 0.5, 0.75, 1].map((f) => {
              const v = geo.lo + geo.span * f, yy = geo.y(v);
              return (
                <g key={f}>
                  <line x1={0} x2={geo.plotW} y1={yy} y2={yy} stroke={GRID} strokeDasharray="2 4" />
                  <text x={geo.plotW + 8} y={yy + 3.5} fill={AXIS} fontSize={11} className="font-mono tabular-nums">
                    {fmt(v)}
                  </text>
                </g>
              );
            })}

            {/* Opening baseline in Area mode */}
            {mode === "area" && first && (
              <line
                x1={0}
                x2={geo.plotW}
                y1={geo.y(first[1])}
                y2={geo.y(first[1])}
                stroke="#475569"
                strokeOpacity={0.45}
                strokeDasharray="3 4"
              />
            )}

            {/* Area path OR Candlestick bodies */}
            {mode === "area" ? (
              <>
                <path d={geo.areaPath} fill={`url(#${gradId})`} />
                <path d={geo.linePath} fill="none" stroke={trendColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </>
            ) : (
              candles.map((c, i) => {
                const x = geo.xAt(i), bw = Math.max(1.5, geo.step * 0.62);
                const up = c[4] >= c[1], col = up ? UP : DOWN;
                const yo = geo.y(c[1]), yc = geo.y(c[4]);
                return (
                  <g key={c[0]} opacity={hover === null || hover === i ? 1 : 0.45}>
                    <line x1={x} x2={x} y1={geo.y(c[2])} y2={geo.y(c[3])} stroke={col} strokeWidth={1.1} />
                    <rect x={x - bw / 2} y={Math.min(yo, yc)} width={bw} height={Math.max(1.2, Math.abs(yc - yo))} fill={col} fillOpacity={0.92} rx={0.8} />
                  </g>
                );
              })
            )}

            {/* Volume bars (both modes) */}
            {candles.map((c, i) => {
              const x = geo.xAt(i), bw = Math.max(1.2, (geo.plotW / candles.length) * 0.6);
              const up = c[4] >= c[1], col = up ? UP : DOWN;
              const vh = (c[5] / geo.vmax) * (VH - 8);
              return (
                <rect
                  key={`v-${c[0]}`}
                  x={x - bw / 2}
                  y={H + VH - vh}
                  width={bw}
                  height={Math.max(0.8, vh)}
                  fill={col}
                  fillOpacity={hover === i ? 0.65 : 0.25}
                  rx={0.5}
                />
              );
            })}

            {/* Current price badge on right axis */}
            {(() => {
              const last = candles[candles.length - 1], yy = geo.y(last[4]);
              const col = mode === "area" ? trendColor : (last[4] >= last[1] ? UP : DOWN);
              return (
                <g>
                  <line x1={0} x2={geo.plotW} y1={yy} y2={yy} stroke={col} strokeOpacity={0.4} strokeDasharray="3 3" />
                  <rect x={geo.plotW + 3} y={yy - 9} width={PAD_R - 6} height={18} rx={4} fill={col} />
                  <text x={geo.plotW + 8} y={yy + 3.5} fill="#050508" fontSize={11} fontWeight={700} className="font-mono tabular-nums">
                    {fmt(last[4])}
                  </text>
                </g>
              );
            })()}

            {/* Crosshair & scrub dot */}
            {hover !== null && (() => {
              const c = candles[hover], x = geo.xAt(hover), yy = geo.y(c[4]);
              return (
                <g pointerEvents="none">
                  <line x1={x} x2={x} y1={PAD_T} y2={H + VH} stroke="#64748B" strokeDasharray="2 3" />
                  <line x1={0} x2={geo.plotW} y1={yy} y2={yy} stroke="#64748B" strokeDasharray="2 3" />
                  {mode === "area" && (
                    <>
                      <circle cx={x} cy={yy} r={7} fill={trendColor} fillOpacity={0.2} />
                      <circle cx={x} cy={yy} r={3.5} fill={trendColor} stroke="#070b12" strokeWidth={1.5} />
                    </>
                  )}
                </g>
              );
            })()}

            <line x1={0} x2={geo.plotW} y1={H + 2} y2={H + 2} stroke={GRID} />
            <text x={0} y={H + VH + 17} fill={AXIS} fontSize={11} className="font-mono">{when(candles[0][0], tf)}</text>
            <text x={geo.plotW} y={H + VH + 17} fill={AXIS} fontSize={11} textAnchor="end" className="font-mono">{when(candles[candles.length - 1][0], tf)}</text>
          </svg>
        )}
      </div>
    </div>
  );
}
