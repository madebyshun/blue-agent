"use client";

/**
 * Blue Hood — the per-ticker price chart (#229), restyled to the app design
 * handoff.
 *
 * ⚠️ THIS FILE MAPS NUMBERS TO PIXELS AND DECIDES NOTHING.
 *
 * Every judgement — which hours are a hole, why, what counts as a break versus
 * an edge, what the deadband is, whether the series is drawable at all — lives
 * in `lib/blue-hood/chart-series.ts`, which is dependency-free so
 * `scripts/hood-chart-check.ts` can pin it. A `"use client"` tree is importable
 * by nothing, so a rule written here is enforced only by whoever reads the
 * diff. That is the same split `detail-support.ts` and `oracle-age.ts` use, and
 * the same reason: the panel's earlier chain bug (#161) survived review inside
 * a client component and was caught by a script the moment the rule moved out.
 *
 * The three things this file must not do, spelled out because each is one line
 * of "simplification" away:
 *
 *   1. NEVER build one polyline from `series.points`. That array is flattened
 *      for axis scaling and nothing else — drawing it joins 03:00 to 09:00
 *      across six hours nobody observed. Walk `segments`; one `<polyline>` per
 *      `run`. `seriesCoverage` warned about this in prose before any chart
 *      existed; this is where the warning either holds or doesn't.
 *   2. NEVER recompute drift from the two prices. It is copied from the archive
 *      because the desk graded its arrows against that exact number. A chart
 *      that disagrees with the receipt beside it discredits the receipt.
 *   3. NEVER draw a real price for a chain whose desk did not measure it. The
 *      component takes `chain` and renders it in the caption for the same
 *      reason the panel does: a ticker exists on both chains as different
 *      tokens, so an uncaptioned chart is an unfalsifiable claim.
 *
 * ── WHERE THIS DEPARTS FROM THE DESIGN HANDOFF, AND WHY ─────────────────────
 *
 * The handoff's chart was drawn against mock data, so four of its details
 * describe a series this archive cannot produce. Each is adopted in spirit and
 * changed in fact:
 *
 *   • Ranges are 24H / 7D / 14D, not 1H / 24H / 7D. The archive's bucket is one
 *     HOUR, so a 1H range is a single point, and `isPlottable` refuses to draw
 *     a line through one point on purpose — one dot with an axis implies a
 *     trend that was never measured. A chip that can only ever render an error
 *     is not a range.
 *
 *   • The area fill is per RUN, not one shape under the whole series. The
 *     handoff shows a single unbroken gradient; here each run gets its own,
 *     which is the same rule as prohibition 1 applied to the fill. A gradient
 *     stretched across a hole is a filled-in claim about hours nobody observed,
 *     and it is more persuasive than a line because it has area.
 *
 *   • No "arrow threshold ±2.0%" footer. That number is TWO numbers — 2% while
 *     the market is closed, 1% while it is open — and the band this chart
 *     actually draws is the 0.5% Chainlink deviation DEADBAND, a different
 *     quantity that happens to live on the same axis. Printing one threshold
 *     under a chart of the other invites exactly the misreading the deadband
 *     rect exists to prevent. The honest version needs the firing thresholds to
 *     travel in the payload the way `deadband` already does; until they do,
 *     this footer says only what the series shipped.
 *
 *   • The header price is the LAST RECORDED reading, labelled as such, never
 *     "current". Re-fetching a live quote here would put a number on screen
 *     that the archive never graded — and would quietly re-open #435, whose fix
 *     lives on the write path. When `trailing_hours > 0` the header says how
 *     stale it is instead of implying freshness.
 *
 * Adopted as specified: the hero price block, the crosshair and clamped
 * tooltip, the gradient area, gridlines, the range chips, `preserveAspectRatio
 * ="none"` + `vector-effect="non-scaling-stroke"`, and the token palette.
 *
 * Note the one structural consequence of `preserveAspectRatio="none"`: it
 * stretches the viewBox independently on each axis, so any `<text>` inside the
 * SVG is stretched with it. All type is therefore HTML positioned over the
 * chart, never `<text>` — which is also why the price axis is the hi/lo pair in
 * the header rather than labels down the left edge.
 */

import { useEffect, useMemo, useState } from "react";
import {
  chartDomain,
  chartNote,
  hourToMs,
  isPlottable,
  type ChartGapReason,
  type ChartPoint,
  type ChartSegment,
  type ChartSeries,
} from "@/lib/blue-hood/chart-series";
import type { HoodChain } from "@/lib/blue-hood/types";

/* ── palette (design tokens; see globals.css `:root`) ───────────────────── */
const BORDER = "#1A1A2E";
const DEX = "#4FC3F7";
const ORACLE = "#64748B";
const DRIFT = "#F59E0B";
const INK_2 = "#94A3B8";
const INK_3 = "#64748B";
const INK_4 = "#475569";
const SUCCESS = "#34D399";
const ERROR = "#F87171";

/* ── viewBox geometry ───────────────────────────────────────────────────────
   Width is nominal: `preserveAspectRatio="none"` maps 0…1000 onto whatever
   width the panel has, so these are ratios, not pixels. Heights ARE pixels —
   the container is sized to match so the vertical mapping stays 1:1 and the
   190px hero band is the height the handoff specifies. */
const VW = 1000;
const H_PRICE = 190;
const H_DRIFT = 56;
const H_TOTAL = H_PRICE + H_DRIFT;

/** Vertical headroom above and below the price range, as a fraction of it.
 *  From the handoff ("min/max with 35% padding"), and generous on purpose: the
 *  more padding, the less a sub-1% move looks like a cliff. Under-dramatising
 *  is the correct failure direction for a chart whose whole subject is a
 *  fraction of a percent. */
const Y_PAD_FRAC = 0.35;

/** How each kind of nothing is drawn. Distinct fills on purpose: rendering an
 *  unreadable window the same as an unrecorded one tells the reader a KV outage
 *  and a quiet market look alike, which is the whole error the archive refuses
 *  on the read path. */
const GAP_STYLE: Record<ChartGapReason, { fill: string; label: string }> = {
  unreadable: { fill: "rgba(245,158,11,0.14)", label: "could not be read" },
  missing_day: { fill: "rgba(100,116,139,0.13)", label: "not recorded" },
  before_archive: { fill: "rgba(100,116,139,0.07)", label: "before the archive" },
  hour_absent: { fill: "rgba(100,116,139,0.13)", label: "not recorded" },
  not_priced: { fill: "rgba(100,116,139,0.10)", label: "no price observed" },
  before_first_seen: { fill: "rgba(100,116,139,0.07)", label: "not yet on the desk" },
};

/** Ranges, in archive days. See the header for why 1H is absent. */
const RANGES: { label: string; days: number }[] = [
  { label: "24H", days: 1 },
  { label: "7D", days: 7 },
  { label: "14D", days: 14 },
];

type ApiOk = {
  ok: true;
  ticker: string;
  chain: HoodChain;
  archive_start: string;
  complete: boolean;
  contiguous: boolean;
  plottable: boolean;
  note: string | null;
  counts: ChartSeries["counts"];
  dating: ChartSeries["dating"];
  deadband: ChartSeries["deadband"];
  segments: ChartSegment[];
};
type ApiErr = { ok: false; error?: string; reason?: string };

/** Rebuild the `ChartSeries` shape from the wire payload.
 *
 *  The route sends `segments` (the drawable form) but not `points` (the flat
 *  convenience array), because shipping both would double the payload for a
 *  field the renderer must not draw from anyway. Reconstructing it here from
 *  the runs — rather than asking the route for it — means the only flat array
 *  in this file is one this file built out of the segments it is already
 *  walking, so it cannot silently disagree with them. */
function fromApi(j: ApiOk): ChartSeries {
  return {
    ticker: j.ticker,
    chain: j.chain,
    segments: j.segments,
    points: j.segments.flatMap((s) => (s.kind === "run" ? s.points : [])),
    counts: j.counts,
    dating: j.dating,
    deadband: j.deadband,
  };
}

function fmtUsd(n: number | null): string {
  if (n === null) return "—";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(n: number | null): string {
  if (n === null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

/** UTC, always. The archive's buckets are UTC and `hourToMs` goes through
 *  `Date.UTC` for the same reason: a label rendered in the viewer's zone would
 *  disagree with the axis it sits on, and the disagreement would be invisible
 *  to anyone in UTC. */
function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const s = d.toISOString();
  return `${s.slice(5, 10)} ${s.slice(11, 16)}Z`;
}

/** A maximal stretch of points where `pick` is non-null.
 *
 *  Prohibition 1 applied one level down. A `run` is a stretch of on-record
 *  HOURS, but an on-record hour can still carry a null on one side — the Base
 *  desk writes `dex_usd: null` when the pool read fails (#140) while the oracle
 *  is fine. Skipping those nulls inside a single polyline would bridge them
 *  exactly the way drawing the flat array bridges whole gaps, just at a grain
 *  small enough to escape review. Splitting is mechanical, not a judgement:
 *  there is no threshold and no tuning here. */
function subRuns(
  points: ChartPoint[],
  pick: (p: ChartPoint) => number | null,
): { ms: number; v: number }[][] {
  const out: { ms: number; v: number }[][] = [];
  let cur: { ms: number; v: number }[] = [];
  for (const p of points) {
    const v = pick(p);
    if (v === null) {
      if (cur.length) out.push(cur);
      cur = [];
      continue;
    }
    cur.push({ ms: hourToMs(p.hour), v });
  }
  if (cur.length) out.push(cur);
  return out;
}

type Hover =
  | { kind: "point"; idx: number }
  | { kind: "gap"; reason: ChartGapReason; hours: number }
  | null;

export default function TickerChart({
  ticker,
  chain,
  days: initialDays = 14,
}: {
  ticker: string;
  chain: HoodChain;
  days?: number;
}) {
  const [days, setDays] = useState(initialDays);
  const [data, setData] = useState<ApiOk | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hover, setHover] = useState<Hover>(null);

  useEffect(() => {
    let live = true;
    setData(null);
    setErr(null);
    setHover(null);
    // `chain` is in the query string, never assumed. The route 400s without it
    // rather than defaulting — see its header for why the most under-specified
    // request must not get the most confident answer.
    fetch(
      `/api/hood/ticker-series?ticker=${encodeURIComponent(ticker)}&chain=${encodeURIComponent(chain)}&days=${days}`,
    )
      .then(async (r) => {
        const j: ApiOk | ApiErr = await r.json();
        if (!live) return;
        if (!j.ok) {
          setErr(j.error ?? j.reason ?? `HTTP ${r.status}`);
          return;
        }
        setData(j);
      })
      .catch((e: unknown) => live && setErr((e as Error).message));
    return () => {
      live = false;
    };
  }, [ticker, chain, days]);

  const series = useMemo(() => (data ? fromApi(data) : null), [data]);

  const rangeChips = (
    <div className="flex items-center gap-1" role="group" aria-label="chart range">
      {RANGES.map((r) => {
        const on = r.days === days;
        return (
          <button
            key={r.label}
            type="button"
            onClick={() => setDays(r.days)}
            aria-pressed={on}
            className="rounded-md px-2 py-[3px] font-mono text-[9.5px] tracking-[0.14em] transition-colors"
            style={{
              color: on ? DEX : INK_4,
              backgroundColor: on ? "rgba(79,195,247,0.10)" : "transparent",
              boxShadow: on ? "inset 0 0 0 1px rgba(79,195,247,0.22)" : "none",
            }}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );

  if (err) {
    // "Could not read" — never "no data". The distinction is the archive's
    // central rule and it does not get to lapse in the failure branch.
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] tracking-[0.16em]" style={{ color: INK_4 }}>
            {ticker} · {chain} desk
          </span>
          {rangeChips}
        </div>
        <p className="font-mono text-[11px] leading-relaxed" style={{ color: DRIFT }}>
          history unavailable · {err}
        </p>
      </div>
    );
  }

  if (!series || !data) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] tracking-[0.16em]" style={{ color: INK_4 }}>
            {ticker} · {chain} desk
          </span>
          {rangeChips}
        </div>
        <div
          className="w-full animate-pulse rounded-xl"
          style={{ height: H_TOTAL, backgroundColor: "rgba(13,13,20,0.8)" }}
        />
      </div>
    );
  }

  const note = chartNote(series);

  if (!isPlottable(series)) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] tracking-[0.16em]" style={{ color: INK_4 }}>
            {ticker} · {chain} desk
          </span>
          {rangeChips}
        </div>
        <p className="font-mono text-[11px] leading-relaxed" style={{ color: INK_3 }}>
          {note ?? "Nothing on record for this window."}
        </p>
      </div>
    );
  }

  const domain = chartDomain(series)!;
  const span = domain.to_ms - domain.from_ms;
  const xMs = (ms: number) => ((ms - domain.from_ms) / span) * VW;

  // Price scale spans BOTH series so oracle and DEX are directly comparable —
  // separate scales would make a 0.2% drift look like a chasm or vanish, and
  // the whole point of this chart is the distance between the two lines.
  const prices = series.points.flatMap((p) =>
    [p.oracle_usd, p.dex_usd].filter((v): v is number => v !== null),
  );
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const padY = (hi - lo) * Y_PAD_FRAC || Math.max(hi * 0.001, 0.01);
  const yLo = lo - padY;
  const yHi = hi + padY;
  const yPrice = (v: number) => (1 - (v - yLo) / (yHi - yLo)) * H_PRICE;

  // Drift scale is symmetric around zero and never narrower than the deadband,
  // so the band is always visible at its true relative size. Letting the scale
  // shrink to the data would render a window that never left the deadband as a
  // dramatic full-height wiggle — technically auto-scaled, and the single most
  // misleading thing this chart could do given that 92% of production readings
  // sit inside that band.
  const drifts = series.points.flatMap((p) => (p.drift_pct === null ? [] : [Math.abs(p.drift_pct)]));
  const dMax = Math.max(series.deadband.abs_pct * 1.25, ...drifts, 0.001);
  const yDrift = (v: number) => H_PRICE + (1 - (v + dMax) / (2 * dMax)) * H_DRIFT;

  const poly = (pts: { ms: number; v: number }[], y: (v: number) => number) =>
    pts.map((q) => `${xMs(q.ms)},${y(q.v)}`).join(" ");

  const gapRects = series.segments.flatMap((s) =>
    s.kind === "gap"
      ? [{ seg: s, x0: xMs(hourToMs(s.from_hour)), x1: xMs(hourToMs(s.to_hour)) }]
      : [],
  );

  const last = series.points[series.points.length - 1];
  const dexPrices = series.points.flatMap((p) => (p.dex_usd === null ? [] : [p.dex_usd]));
  const dexHi = dexPrices.length ? Math.max(...dexPrices) : null;
  const dexLo = dexPrices.length ? Math.min(...dexPrices) : null;

  const hoverPt = hover?.kind === "point" ? series.points[hover.idx] : null;
  const hoverX = hoverPt ? xMs(hourToMs(hoverPt.hour)) : null;
  // Clamped 12–88% so the tooltip cannot leave the box on either edge — the
  // handoff's number, and the reason it is a percentage is that the panel width
  // is fluid.
  const tipLeft = hoverX === null ? 50 : Math.min(88, Math.max(12, (hoverX / VW) * 100));

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const ms = domain.from_ms + frac * span;

    // A gap wins over the nearest point. Snapping to an observation hours away
    // would draw a crosshair and a price on top of a hole, which is the tooltip
    // asserting a reading for an hour nobody looked at — the same bridging
    // error as prohibition 1, committed by the hover layer instead of the line.
    for (const g of series.segments) {
      if (g.kind !== "gap") continue;
      const a = hourToMs(g.from_hour);
      const b = hourToMs(g.to_hour);
      if (ms >= a && ms <= b) {
        setHover({ kind: "gap", reason: g.reason, hours: g.hours });
        return;
      }
    }

    let best = 0;
    let bestD = Infinity;
    series.points.forEach((p, i) => {
      const d = Math.abs(hourToMs(p.hour) - ms);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover({ kind: "point", idx: best });
  };

  const driftInk =
    hoverPt?.drift_pct == null ? INK_3 : hoverPt.drift_pct >= 0 ? SUCCESS : ERROR;

  return (
    <div className="flex flex-col gap-2">
      {/* ── header: the hero price block ──────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[24px] font-bold tracking-[-0.02em]" style={{ color: "#E2E8F0" }}>
              {fmtUsd(last.dex_usd)}
            </span>
            {last.drift_pct !== null && (
              <span
                className="font-mono text-[11px] font-medium"
                style={{ color: last.drift_pct >= 0 ? SUCCESS : ERROR }}
              >
                {fmtPct(last.drift_pct)} vs oracle
              </span>
            )}
          </div>
          <span className="font-mono text-[9.5px] tracking-[0.14em]" style={{ color: INK_4 }}>
            {/* Never "current". See the header note on the fourth deviation. */}
            LAST RECORDED {fmtWhen(last.at)} · {ticker} ON {chain.toUpperCase()}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1">
          {rangeChips}
          {dexHi !== null && dexLo !== null && (
            <span className="font-mono text-[9.5px]" style={{ color: INK_4 }}>
              dex hi {fmtUsd(dexHi)} · lo {fmtUsd(dexLo)}
            </span>
          )}
        </div>
      </div>

      {/* ── the chart ─────────────────────────────────────────────────────── */}
      <div
        className="relative w-full"
        style={{ height: H_TOTAL, cursor: "crosshair" }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <svg
          viewBox={`0 0 ${VW} ${H_TOTAL}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label={`${ticker} on the ${chain} desk — oracle and DEX price, ${series.counts.plotted} hourly points from the archive`}
        >
          <defs>
            <linearGradient id="dexArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={DEX} stopOpacity={0.22} />
              <stop offset="100%" stopColor={DEX} stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Gap bands, drawn UNDER everything. Only interior gaps land inside
              the domain at all; the edges map outside it and are stated in the
              caption instead — see `chartDomain`. */}
          {gapRects.map(({ seg, x0, x1 }, i) =>
            x1 < 0 || x0 > VW ? null : (
              <rect
                key={`g${i}`}
                x={Math.max(x0, 0)}
                y={0}
                width={Math.max(Math.min(x1, VW) - Math.max(x0, 0), 1)}
                height={H_TOTAL}
                fill={GAP_STYLE[seg.reason].fill}
              />
            ),
          )}

          {/* Gridlines — price band only. */}
          {[1, 2, 3, 4].map((i) => (
            <line
              key={`grid${i}`}
              x1={0}
              x2={VW}
              y1={(H_PRICE / 5) * i}
              y2={(H_PRICE / 5) * i}
              stroke={BORDER}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {/* Deadband: everything between ±0.5%. Drawn, not annotated, because
              a reader comparing a wiggle to a footnote will not do it. */}
          <rect
            x={0}
            y={yDrift(series.deadband.abs_pct)}
            width={VW}
            height={yDrift(-series.deadband.abs_pct) - yDrift(series.deadband.abs_pct)}
            fill="rgba(100,116,139,0.16)"
          />
          <line
            x1={0}
            x2={VW}
            y1={yDrift(0)}
            y2={yDrift(0)}
            stroke={BORDER}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />

          {/* ONE POLYLINE PER RUN. Never one through `series.points`. The area
              fill obeys the same rule — one shape per dex sub-run, never a
              single gradient stretched over a hole. */}
          {series.segments.map((s, i) => {
            if (s.kind !== "run") return null;
            const dexRuns = subRuns(s.points, (p) => p.dex_usd);
            const oracleRuns = subRuns(s.points, (p) => p.oracle_usd);
            const driftRuns = subRuns(s.points, (p) => p.drift_pct);
            return (
              <g key={`r${i}`}>
                {dexRuns.map((r, k) =>
                  r.length < 2 ? null : (
                    <path
                      key={`a${k}`}
                      d={`M ${xMs(r[0].ms)},${H_PRICE} L ${r
                        .map((q) => `${xMs(q.ms)},${yPrice(q.v)}`)
                        .join(" L ")} L ${xMs(r[r.length - 1].ms)},${H_PRICE} Z`}
                      fill="url(#dexArea)"
                    />
                  ),
                )}
                {oracleRuns.map((r, k) => (
                  <polyline
                    key={`o${k}`}
                    fill="none"
                    stroke={ORACLE}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    vectorEffect="non-scaling-stroke"
                    points={poly(r, yPrice)}
                  />
                ))}
                {dexRuns.map((r, k) => (
                  <polyline
                    key={`d${k}`}
                    fill="none"
                    stroke={DEX}
                    strokeWidth={2.5}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    points={poly(r, yPrice)}
                  />
                ))}
                {driftRuns.map((r, k) => (
                  <polyline
                    key={`f${k}`}
                    fill="none"
                    stroke={DRIFT}
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                    points={poly(r, yDrift)}
                  />
                ))}
              </g>
            );
          })}

          {/* Crosshair + the glowing dot, on the DEX point only. */}
          {hoverX !== null && (
            <line
              x1={hoverX}
              x2={hoverX}
              y1={0}
              y2={H_TOTAL}
              stroke={DEX}
              strokeWidth={1}
              strokeOpacity={0.55}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {/* The dot is HTML, not SVG: a circle in a `preserveAspectRatio="none"`
            viewBox is stretched into an ellipse by the panel's aspect ratio. */}
        {hoverPt?.dex_usd != null && hoverX !== null && (
          <span
            className="pointer-events-none absolute block rounded-full"
            style={{
              left: `${(hoverX / VW) * 100}%`,
              top: yPrice(hoverPt.dex_usd),
              width: 9,
              height: 9,
              marginLeft: -4.5,
              marginTop: -4.5,
              backgroundColor: DEX,
              boxShadow: `0 0 8px ${DEX}`,
            }}
          />
        )}

        {/* Tooltip. Clamped 12–88% so it never leaves the box. */}
        {hover && (
          <div
            className="pointer-events-none absolute top-1 z-10 rounded-lg px-2 py-1.5"
            style={{
              left: `${tipLeft}%`,
              transform: "translateX(-50%)",
              backgroundColor: "rgba(13,13,20,0.94)",
              boxShadow: `inset 0 0 0 1px ${BORDER}`,
              minWidth: 132,
            }}
          >
            {hover.kind === "gap" ? (
              <>
                <div className="font-mono text-[9.5px] tracking-[0.14em]" style={{ color: INK_4 }}>
                  {GAP_STYLE[hover.reason].label.toUpperCase()}
                </div>
                <div className="mt-0.5 font-mono text-[10px]" style={{ color: INK_2 }}>
                  {hover.hours}h with no reading
                </div>
              </>
            ) : (
              hoverPt && (
                <>
                  <div className="font-mono text-[9.5px] tracking-[0.14em]" style={{ color: INK_4 }}>
                    {fmtWhen(hoverPt.at)} · {hoverPt.is_open ? "OPEN" : "CLOSED"}
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3 font-mono text-[10px]">
                    <span style={{ color: DEX }}>dex</span>
                    <span style={{ color: "#E2E8F0" }}>{fmtUsd(hoverPt.dex_usd)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 font-mono text-[10px]">
                    <span style={{ color: ORACLE }}>oracle</span>
                    <span style={{ color: "#E2E8F0" }}>{fmtUsd(hoverPt.oracle_usd)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 font-mono text-[10px]">
                    <span style={{ color: DRIFT }}>drift</span>
                    <span style={{ color: driftInk }}>{fmtPct(hoverPt.drift_pct)}</span>
                  </div>
                </>
              )
            )}
          </div>
        )}
      </div>

      {/* ── legend + footer facts ─────────────────────────────────────────── */}
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[9px]"
        style={{ color: INK_4 }}
      >
        <span style={{ color: ORACLE }}>┄┄ oracle</span>
        <span style={{ color: DEX }}>── dex</span>
        <span style={{ color: DRIFT }}>── drift</span>
        <span>
          band = ±{series.deadband.abs_pct}% feed deadband · {series.deadband.inside}/
          {series.deadband.graded} readings inside
        </span>
        <span className="ml-auto">
          {/* The market clock is the one RECORDED at the last reading, not the
              clock now — `is_open` is captured per cycle precisely because
              re-deriving it from a timestamp gets holidays and half-days
              wrong. */}
          market {last.is_open ? "open" : "closed"} at last reading · {series.counts.plotted}h on
          record · {chain} desk
        </span>
      </div>

      {/* The caveats, in the one place a reader is already looking. Each is
          rendered only when it is TRUE — a permanently-visible disclaimer is a
          disclaimer nobody reads, which is how the honest ones get cheaper. */}
      {note && (
        <p className="font-mono text-[10px] leading-relaxed" style={{ color: INK_3 }}>
          {note}
        </p>
      )}
      {!data.complete && (
        <p className="font-mono text-[10px] leading-relaxed" style={{ color: DRIFT }}>
          Part of this window could not be read. Its contents are unknown — not empty.
        </p>
      )}
      {series.counts.trailing_hours > 0 && (
        <p className="font-mono text-[10px] leading-relaxed" style={{ color: DRIFT }}>
          No observation in the last {series.counts.trailing_hours}h — the price above is that old,
          and the line ends before the window does.
        </p>
      )}
      {series.dating.supported && series.dating.predates_field > 0 && (
        <p className="font-mono text-[10px] leading-relaxed" style={{ color: INK_3 }}>
          {series.dating.predates_field} of {series.counts.plotted} points predate the oracle-round
          field, so their drift cannot be separated from a stale feed.
        </p>
      )}
      {!series.dating.supported && (
        <p className="font-mono text-[10px] leading-relaxed" style={{ color: INK_3 }}>
          This desk does not record oracle rounds, so no reading here can be dated against the feed.
        </p>
      )}
    </div>
  );
}
