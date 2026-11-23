// Server-rendered SVG charts for /markets/weekend. No client JS, so a
// screenshot is exactly what the server measured.
import type { ReactNode } from "react";

const GRID = "#1A1A2E", DIM = "#64748B", SOFT = "#94A3B8", BLUE = "#4FC3F7", GREEN = "#34D399", RED = "#F87171", AMBER = "#F59E0B";

export interface Dot { x: number; y: number; hit: boolean | null; label: string }

/** Weekend move on Base (x) vs the gap at the open (y). Same-sign quadrants = Base called it. */
export function CallScatter({ dots }: { dots: Dot[] }) {
  const W = 640, H = 340, P = 42;
  const lim = Math.max(3, Math.ceil(Math.max(...dots.map((d) => Math.max(Math.abs(d.x) * 2.5, Math.abs(d.y))), 1)));
  const xl = lim / 2.5;
  const sx = (x: number) => P + ((x + xl) / (2 * xl)) * (W - 2 * P);
  const sy = (y: number) => H - P - ((y + lim) / (2 * lim)) * (H - 2 * P);
  const ticksY = [-lim, -lim / 2, 0, lim / 2, lim];
  const ticksX = [-xl, -xl / 2, 0, xl / 2, xl];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto font-mono" role="img" aria-label="Sunday pool gap versus post-open oracle gap">
      <rect x={sx(0)} y={P} width={sx(xl) - sx(0)} height={sy(0) - P} fill={GREEN} opacity={0.045} />
      <rect x={P} y={sy(0)} width={sx(0) - P} height={H - P - sy(0)} fill={GREEN} opacity={0.045} />
      <rect x={sx(-0.5)} y={P} width={sx(0.5) - sx(-0.5)} height={H - 2 * P} fill={SOFT} opacity={0.04} />
      {ticksY.map((t) => (
        <g key={`y${t}`}>
          <line x1={P} x2={W - P} y1={sy(t)} y2={sy(t)} stroke={GRID} strokeDasharray="2 4" />
          <text x={P - 6} y={sy(t) + 4} fill={DIM} fontSize={10.5} textAnchor="end">{t > 0 ? "+" : ""}{+t.toFixed(1)}%</text>
        </g>
      ))}
      {ticksX.map((t) => (
        <g key={`x${t}`}>
          <line y1={P} y2={H - P} x1={sx(t)} x2={sx(t)} stroke={GRID} strokeDasharray="2 4" />
          <text x={sx(t)} y={H - P + 16} fill={DIM} fontSize={10.5} textAnchor="middle">{t > 0 ? "+" : ""}{+t.toFixed(1)}%</text>
        </g>
      ))}
      <line x1={sx(0)} x2={sx(0)} y1={P} y2={H - P} stroke={SOFT} strokeOpacity={0.35} />
      <line x1={P} x2={W - P} y1={sy(0)} y2={sy(0)} stroke={SOFT} strokeOpacity={0.35} />
      {dots.map((d, i) => (
        <circle
          key={i}
          cx={sx(d.x)}
          cy={sy(Math.max(-lim, Math.min(lim, d.y)))}
          r={d.hit === null ? 3.5 : 5}
          fill={d.hit === null ? DIM : d.hit ? GREEN : RED}
          fillOpacity={d.hit === null ? 0.6 : 0.85}
          stroke="#070b12"
          strokeWidth={1}
        >
          <title>{d.label}</title>
        </circle>
      ))}
      <text x={W - P} y={H - 6} fill={SOFT} fontSize={10.5} textAnchor="end">Base weekend move →</text>
      <text x={P} y={P - 12} fill={SOFT} fontSize={10.5}>↑ Post-open oracle vs held reference</text>
    </svg>
  );
}

export interface ReplayPoint { at: string; oracle: number; dex: number }

/** Chainlink (frozen all weekend) vs the Base pool, hour by hour, ending after the open. */
export function ReplayChart({ pts, openAt, openUsd, callAt }: { pts: ReplayPoint[]; openAt?: string; openUsd?: number; callAt?: string }) {
  if (pts.length < 4) return null;
  const W = 640, H = 290, P = 44;
  const t0 = Date.parse(pts[0].at), t1 = Math.max(Date.parse(pts[pts.length - 1].at), openAt ? Date.parse(openAt) + 3_600_000 : 0);
  const vals = pts.flatMap((p) => [p.oracle, p.dex]).concat(openUsd ? [openUsd] : []);
  const lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * 0.12 || 1;
  const sx = (t: number) => P + ((t - t0) / (t1 - t0 || 1)) * (W - 2 * P);
  const sy = (v: number) => H - P - ((v - (lo - pad)) / (hi - lo + 2 * pad)) * (H - 2 * P);
  const path = (k: "oracle" | "dex") =>
    pts.map((p, i) => `${i && Date.parse(p.at) - Date.parse(pts[i - 1].at) <= 90 * 60_000 ? "L" : "M"}${sx(Date.parse(p.at)).toFixed(1)},${sy(p[k]).toFixed(1)}`).join(" ");
  const dexPath = path("dex");
  const areaPath = `${dexPath} L${sx(Date.parse(pts[pts.length - 1].at)).toFixed(1)},${H - P} L${sx(Date.parse(pts[0].at)).toFixed(1)},${H - P} Z`;
  const days: ReactNode[] = [];
  for (let t = Math.ceil(t0 / 86_400_000) * 86_400_000; t <= t1; t += 86_400_000) {
    days.push(
      <g key={t}>
        <line x1={sx(t)} x2={sx(t)} y1={P} y2={H - P} stroke={GRID} />
        <text x={sx(t) + 4} y={H - P + 16} fill={DIM} fontSize={10.5}>
          {new Date(t).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}
        </text>
      </g>,
    );
  }
  const yt = [lo, (lo + hi) / 2, hi];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto font-mono" role="img" aria-label="Oracle versus Base DEX price over the weekend">
      <defs>
        <linearGradient id="replayDexGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={BLUE} stopOpacity={0.22} />
          <stop offset="100%" stopColor={BLUE} stopOpacity={0} />
        </linearGradient>
      </defs>
      {yt.map((v) => (
        <g key={v}>
          <line x1={P} x2={W - P} y1={sy(v)} y2={sy(v)} stroke={GRID} strokeDasharray="2 4" />
          <text x={P - 6} y={sy(v) + 4} fill={DIM} fontSize={10.5} textAnchor="end">${v.toFixed(v > 100 ? 0 : 2)}</text>
        </g>
      ))}
      {days}
      {callAt && (
        <g>
          <line x1={sx(Date.parse(callAt))} x2={sx(Date.parse(callAt))} y1={P} y2={H - P} stroke={AMBER} strokeDasharray="3 3" />
          <text x={sx(Date.parse(callAt)) - 4} y={P - 6} fill={AMBER} fontSize={10.5} textAnchor="end">call · Sun 22:00 UTC</text>
        </g>
      )}
      {openAt && (
        <g>
          <line x1={sx(Date.parse(openAt))} x2={sx(Date.parse(openAt))} y1={P} y2={H - P} stroke={SOFT} strokeDasharray="3 3" />
          <text x={sx(Date.parse(openAt)) + 4} y={P - 6} fill={SOFT} fontSize={10.5}>open</text>
        </g>
      )}
      <path d={areaPath} fill="url(#replayDexGrad)" />
      <path d={path("oracle")} fill="none" stroke={SOFT} strokeWidth={1.75} strokeDasharray="4 3" />
      <path d={dexPath} fill="none" stroke={BLUE} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
      {openAt && openUsd && (
        <g>
          <circle cx={sx(Date.parse(openAt))} cy={sy(openUsd)} r={6} fill="#F8FAFC" fillOpacity={0.2} />
          <circle cx={sx(Date.parse(openAt))} cy={sy(openUsd)} r={3.5} fill="#F8FAFC" stroke="#070b12" strokeWidth={1.5} />
          <text x={sx(Date.parse(openAt)) - 8} y={sy(openUsd) + 4} fill="#F8FAFC" fontSize={11} fontWeight={600} textAnchor="end">
            ${openUsd.toFixed(2)}
          </text>
        </g>
      )}
    </svg>
  );
}

/** One row of paired bars: what Base priced vs what the open did. */
export function PairBars({ rows }: { rows: { ticker: string; move: number; gap: number; hit: boolean | null }[] }) {
  const m = Math.max(1, ...rows.flatMap((r) => [Math.abs(r.move), Math.abs(r.gap)]));
  const w = (v: number) => `${(Math.abs(v) / m) * 50}%`;
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <div key={r.ticker} className="grid grid-cols-[64px_1fr_56px] items-center gap-2 text-[12px]">
          <span className="text-[#E2E8F0]">{r.ticker}c</span>
          <div className="relative h-[18px]">
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-[#334155]" />
            <div className="absolute top-[1px] h-[7px] rounded-sm bg-[#4FC3F7]" style={{ width: w(r.move), [r.move >= 0 ? "left" : "right"]: "50%" }} />
            <div className={`absolute bottom-[1px] h-[7px] rounded-sm ${r.gap >= 0 ? "bg-[#34D399]" : "bg-[#F87171]"}`} style={{ width: w(r.gap), [r.gap >= 0 ? "left" : "right"]: "50%", opacity: 0.85 }} />
          </div>
          <span className={`text-right ${r.hit === null ? "text-[#64748B]" : r.hit ? "text-[#34D399]" : "text-[#F87171]"}`}>{r.hit === null ? "flat" : r.hit ? "right" : "wrong"}</span>
        </div>
      ))}
    </div>
  );
}
