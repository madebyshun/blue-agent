"use client";

// Candlestick chart for a Markets token page: OHLC + volume from the token's
// deepest DEX pool, timeframes 15m / 1h / 4h / 1D, crosshair with the hovered
// candle's numbers. First paint uses the server's 1h candles; other timeframes
// come from /api/markets/candles. A refused read says so, it never draws empty.
import { useEffect, useMemo, useRef, useState } from "react";

type Candle = [number, number, number, number, number, number];
type Tf = "15m" | "1h" | "4h" | "1d";
const TFS: [Tf, string][] = [["15m", "15m"], ["1h", "1H"], ["4h", "4H"], ["1d", "1D"]];

const UP = "#34D399", DOWN = "#F87171", GRID = "#1A1A2E", AXIS = "#475569";
const fmt = (n: number) => n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : n >= 1 ? n.toFixed(2) : n >= 0.01 ? n.toFixed(4) : n.toPrecision(3);
const fmtVol = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}k` : `$${n.toFixed(0)}`;
const when = (t: number, tf: Tf) => {
  const d = new Date(t * 1000).toISOString();
  return tf === "1d" ? d.slice(0, 10) : `${d.slice(5, 10)} ${d.slice(11, 16)}Z`;
};

export default function CandleChart({ chain, pool, side, initial, source }: { chain: string; pool: string; side: "base" | "quote"; initial: Candle[]; source: string }) {
  const [tf, setTf] = useState<Tf>("1h");
  const [data, setData] = useState<Record<string, Candle[] | null>>({ "1h": initial });
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(900);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (tf in data) return;
    setBusy(true);
    fetch(`/api/markets/candles?chain=${chain}&pool=${pool}&side=${side}&tf=${tf}`)
      .then((r) => r.json()).then((j) => setData((d) => ({ ...d, [tf]: j.candles ?? null })))
      .catch(() => setData((d) => ({ ...d, [tf]: null })))
      .finally(() => setBusy(false));
  }, [tf, data, chain, pool, side]);

  const candles = data[tf];
  const H = 300, VH = 60, PAD_R = 64, PAD_T = 10;
  const geo = useMemo(() => {
    if (!candles || candles.length < 2) return null;
    const lo = Math.min(...candles.map((c) => c[3])), hi = Math.max(...candles.map((c) => c[2]));
    const span = hi - lo || hi * 0.01 || 1;
    const vmax = Math.max(...candles.map((c) => c[5]), 1e-9);
    const plotW = Math.max(100, w - PAD_R);
    const step = plotW / candles.length;
    const y = (v: number) => PAD_T + (1 - (v - lo) / span) * (H - PAD_T * 2);
    return { lo, hi, span, vmax, plotW, step, y };
  }, [candles, w]);

  const shown = hover !== null && candles ? candles[hover] : candles?.[candles.length - 1];
  const first = candles?.[0];
  const chg = shown && first ? ((shown[4] - first[1]) / first[1]) * 100 : null;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        {TFS.map(([id, l]) => (
          <button key={id} type="button" onClick={() => { setTf(id); setHover(null); }}
            className={`text-[10px] rounded-[6px] px-2.5 py-1 border ${tf === id ? "border-[#4FC3F7]/60 text-[#4FC3F7] bg-[#4FC3F7]/10" : "border-[#1A1A2E] text-[#94A3B8] hover:text-[#E2E8F0]"}`}>{l}</button>
        ))}
        {shown && (
          <span className="ml-2 flex flex-wrap gap-x-3 text-[10px] tabular-nums">
            <span className="text-[#64748B]">{when(shown[0], tf)}</span>
            <span className="text-[#64748B]">O <span className="text-[#E2E8F0]">{fmt(shown[1])}</span></span>
            <span className="text-[#64748B]">H <span className="text-[#E2E8F0]">{fmt(shown[2])}</span></span>
            <span className="text-[#64748B]">L <span className="text-[#E2E8F0]">{fmt(shown[3])}</span></span>
            <span className="text-[#64748B]">C <span style={{ color: shown[4] >= shown[1] ? UP : DOWN }}>{fmt(shown[4])}</span></span>
            <span className="text-[#64748B]">Vol <span className="text-[#E2E8F0]">{fmtVol(shown[5])}</span></span>
            {chg !== null && <span style={{ color: chg >= 0 ? UP : DOWN }}>{chg >= 0 ? "+" : ""}{chg.toFixed(2)}% in view</span>}
          </span>
        )}
        <span className="ml-auto text-[9.5px] text-[#475569]">{busy ? "loading…" : source}</span>
      </div>

      <div ref={box} className="relative w-full select-none" style={{ height: H + VH + 22 }}>
        {candles === null ? (
          <p className="pt-24 text-center text-[10.5px] text-[#64748B]">GeckoTerminal is rate-limiting right now; pick the timeframe again in a minute.</p>
        ) : !geo || !candles ? (
          <p className="pt-24 text-center text-[10.5px] text-[#64748B]">{busy ? "Loading candles…" : "No candles for this pool and timeframe yet."}</p>
        ) : (
          <svg width={w} height={H + VH + 22}
            onMouseMove={(e) => { const x = e.clientX - e.currentTarget.getBoundingClientRect().left; const i = Math.floor(x / geo.step); setHover(i >= 0 && i < candles.length ? i : null); }}
            onMouseLeave={() => setHover(null)}>
            {[0, 0.25, 0.5, 0.75, 1].map((f) => {
              const v = geo.lo + geo.span * f, yy = geo.y(v);
              return <g key={f}><line x1={0} x2={geo.plotW} y1={yy} y2={yy} stroke={GRID} strokeDasharray="2 4" /><text x={geo.plotW + 6} y={yy + 3} fill={AXIS} fontSize={9.5}>{fmt(v)}</text></g>;
            })}
            {candles.map((c, i) => {
              const x = i * geo.step + geo.step / 2, bw = Math.max(1, geo.step * 0.62);
              const up = c[4] >= c[1], col = up ? UP : DOWN;
              const yo = geo.y(c[1]), yc = geo.y(c[4]);
              const vh = (c[5] / geo.vmax) * (VH - 6);
              return (
                <g key={c[0]} opacity={hover === null || hover === i ? 1 : 0.55}>
                  <line x1={x} x2={x} y1={geo.y(c[2])} y2={geo.y(c[3])} stroke={col} strokeWidth={1} />
                  <rect x={x - bw / 2} y={Math.min(yo, yc)} width={bw} height={Math.max(1, Math.abs(yc - yo))} fill={up ? col : col} fillOpacity={up ? 0.9 : 0.9} rx={0.5} />
                  <rect x={x - bw / 2} y={H + VH - vh} width={bw} height={vh} fill={col} fillOpacity={0.28} />
                </g>
              );
            })}
            {(() => {
              const last = candles[candles.length - 1], yy = geo.y(last[4]), col = last[4] >= last[1] ? UP : DOWN;
              return <g><line x1={0} x2={geo.plotW} y1={yy} y2={yy} stroke={col} strokeOpacity={0.5} strokeDasharray="3 3" />
                <rect x={geo.plotW + 2} y={yy - 8} width={PAD_R - 4} height={16} rx={3} fill={col} />
                <text x={geo.plotW + 6} y={yy + 3.5} fill="#050508" fontSize={9.5} fontWeight={600}>{fmt(last[4])}</text></g>;
            })()}
            {hover !== null && (() => {
              const c = candles[hover], x = hover * geo.step + geo.step / 2, yy = geo.y(c[4]);
              return <g pointerEvents="none"><line x1={x} x2={x} y1={0} y2={H + VH} stroke="#64748B" strokeDasharray="2 3" /><line x1={0} x2={geo.plotW} y1={yy} y2={yy} stroke="#64748B" strokeDasharray="2 3" /></g>;
            })()}
            <line x1={0} x2={geo.plotW} y1={H + 2} y2={H + 2} stroke={GRID} />
            <text x={0} y={H + VH + 16} fill={AXIS} fontSize={9.5}>{when(candles[0][0], tf)}</text>
            <text x={geo.plotW} y={H + VH + 16} fill={AXIS} fontSize={9.5} textAnchor="end">{when(candles[candles.length - 1][0], tf)}</text>
          </svg>
        )}
      </div>
    </div>
  );
}
