"use client";

/**
 * /hood client — live drift board + arrows feed + contextual sidebar.
 *
 * Layout mirrors Blue Chat + Blue Hub: three columns on lg+ screens
 *   [ 72px AppShell rail ][ 288px HoodSidebar ][ flex-1 main content ]
 * Below lg the sidebar hides (AppShell's mobile drawer already exposes
 * the primary product nav; per-page context is one tap away via the
 * hamburger, mirroring Chat's mobile pattern).
 *
 * Design tokens follow AppShell:
 *   • bg #050508  · surface #0B0D13 · border #1A1A2E
 *   • font-mono for every number
 *   • section headers `// HOOD · <SECTION>` in slate-500 tracking-widest
 *   • Robinhood green #00C805 is THIS page's interactive accent (spec:
 *     "accent riêng của section này"); blue #4FC3F7 shows only in the
 *     footer "powered by 30 Blue Hub skills" attribution.
 *
 * Two data fetches, both `no-store`:
 *   • /api/hood/snapshot — poller's latest snapshot
 *   • /api/hood/arrows   — fired arrows + graded hit-rate (test arrows
 *                          are filtered server-side; the UI can trust
 *                          whatever comes back is the public record)
 * Both refresh every 15s; a single AbortController handles unmount.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HoodSnapshot, TickerSnapshot, M5Verdict, Arrow } from "@/lib/blue-hood/types";
import HoodSidebar from "./HoodSidebar";
import TickerDetailPanel from "./TickerDetailPanel";

const REFRESH_MS = 15_000;
const RH_GREEN = "#00C805";
const BLUE = "#4FC3F7";
const AMBER = "#f5b342";
const RED = "#ef4444";
const GREEN_TEXT = "#22c55e";
const BG = "#050508";
const SURFACE = "#0B0D13";
const BORDER = "#1A1A2E";
const MUTED = "#6b7280";

type SortKey = "drift" | "volume" | "tvl";
type Filter = "tradable" | "drifting" | "flow" | "frozen" | "dust" | "no_data" | "all";

// T2 — dust floor matches the engine's arrow gate. Anything under this is
// treated as untradable at the row level (verdict badged as DUST, drift
// faded, sorted last, hidden from default filter).
const DUST_TVL_USD = 5_000;

function isDust(r: TickerSnapshot): boolean {
  return r.verdict !== "ERROR" && r.dex_usd !== null && (r.tvl_usd ?? 0) < DUST_TVL_USD;
}
function isNoData(r: TickerSnapshot): boolean {
  return r.verdict === "ERROR" || r.verdict === "INSUFFICIENT_DATA" || r.dex_usd === null;
}
function isTradable(r: TickerSnapshot): boolean {
  return !isDust(r) && !isNoData(r);
}
function isFrozenLike(v: TickerSnapshot["verdict"]): boolean {
  return v === "FROZEN_ALIGNED" || v === "PREMARKET_DRIFT" || v === "AFTERHOURS_DRIFT";
}

type SnapshotRes = { ok: true; snapshot: HoodSnapshot } | { ok: false; error: string };
type ArrowsRes =
  | {
      ok: true;
      arrows: Arrow[];
      arrows_today: number;
      hit_rate:
        | { ready: true; pct: number; sample: number }
        | { ready: false; sample: number; needed: number };
      test_arrows_hidden: number;
    }
  | { ok: false; error: string };

export default function HoodClient() {
  const [snap, setSnap] = useState<HoodSnapshot | null>(null);
  const [arrowsData, setArrowsData] = useState<Extract<ArrowsRes, { ok: true }> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<number>(0);
  const [sort, setSort] = useState<SortKey>("drift");
  // T2 — default filter hides dust so the top of the board is tradable
  // rows, not COIN +132% on a $1k pool.
  const [filter, setFilter] = useState<Filter>("tradable");
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const [s, a] = await Promise.all([
        fetch("/api/hood/snapshot", { cache: "no-store", signal }).then((r) => r.json() as Promise<SnapshotRes>),
        fetch("/api/hood/arrows", { cache: "no-store", signal }).then((r) => r.json() as Promise<ArrowsRes>),
      ]);
      if (s.ok) { setSnap(s.snapshot); setErr(null); } else { setErr(s.error); }
      if (a.ok) setArrowsData(a);
      setLastFetch(Date.now());
    } catch (e) {
      if ((e as Error).name !== "AbortError") setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    const ctl = new AbortController();
    load(ctl.signal);
    const t = setInterval(() => load(ctl.signal), REFRESH_MS);
    return () => { ctl.abort(); clearInterval(t); };
  }, [load]);

  // T2 + T3 — categorize once so filter pill counts + row grouping stay in sync.
  const buckets = useMemo(() => {
    if (!snap) return { tradable: [], dust: [], no_data: [] } as Record<"tradable" | "dust" | "no_data", TickerSnapshot[]>;
    const tradable: TickerSnapshot[] = [];
    const dust: TickerSnapshot[] = [];
    const no_data: TickerSnapshot[] = [];
    for (const r of snap.tickers) {
      if (isNoData(r)) no_data.push(r);
      else if (isDust(r)) dust.push(r);
      else tradable.push(r);
    }
    return { tradable, dust, no_data };
  }, [snap]);

  const filtered = useMemo<TickerSnapshot[]>(() => {
    let list: TickerSnapshot[];
    switch (filter) {
      case "tradable": list = buckets.tradable; break;
      case "dust":     list = buckets.dust; break;
      case "no_data":  list = buckets.no_data; break;
      case "drifting": list = buckets.tradable.filter((r) => Math.abs(r.drift_pct ?? 0) >= 1); break;
      case "flow":     list = buckets.tradable.filter((r) => (r.volume_24h_usd ?? 0) >= 5_000); break;
      case "frozen":   list = buckets.tradable.filter((r) => isFrozenLike(r.verdict)); break;
      case "all":      list = [...buckets.tradable, ...buckets.dust, ...buckets.no_data]; break;
    }
    return [...list].sort((a, b) => {
      if (sort === "drift") return Math.abs(b.drift_pct ?? 0) - Math.abs(a.drift_pct ?? 0);
      if (sort === "volume") return (b.volume_24h_usd ?? 0) - (a.volume_24h_usd ?? 0);
      return (b.tvl_usd ?? 0) - (a.tvl_usd ?? 0);
    });
  }, [buckets, sort, filter]);

  const marketBadge = useMemo(() => {
    if (!snap) return { label: "…", color: MUTED };
    const { market_is_open, market_session } = snap.metrics;
    if (market_is_open) return { label: "NYSE OPEN", color: GREEN_TEXT };
    if (market_session === "premarket") return { label: "PREMARKET", color: AMBER };
    if (market_session === "afterhours") return { label: "AFTER HOURS", color: AMBER };
    if (market_session === "weekend") return { label: "WEEKEND · CLOSED", color: MUTED };
    if (market_session === "holiday") return { label: "HOLIDAY · CLOSED", color: MUTED };
    return { label: "MARKET CLOSED", color: MUTED };
  }, [snap]);

  const scrollToTicker = useCallback((ticker: string) => {
    // If the current filter is hiding the ticker, drop back to "all" first
    // so the row is actually in the DOM to scroll to.
    if (filter !== "all") setFilter("all");
    // rAF because setFilter's re-render hasn't landed yet on same tick.
    requestAnimationFrame(() => {
      const el = rowRefs.current[ticker];
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [filter]);

  return (
    <div className="flex-1 min-h-0 flex flex-row" style={{ backgroundColor: BG }}>
      <HoodSidebar
        snap={snap}
        arrows={arrowsData?.arrows ?? null}
        marketLabel={marketBadge.label}
        marketColor={marketBadge.color}
        onSelectTicker={scrollToTicker}
      />

      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
          <Header snap={snap} lastFetch={lastFetch} marketBadge={marketBadge} />

          {err && (
            <div
              role="alert"
              className="mb-6 rounded border px-3 py-2 text-sm"
              style={{ borderColor: "#3b2a15", backgroundColor: "#1a1408", color: "#f6c88f" }}
            >
              Poller warming up: {err}. In dev, POST to <code className="font-mono text-white">/api/cron/blue-hood/poll</code> with your <code className="font-mono text-white">CRON_SECRET</code>.
            </div>
          )}

          <MetricStrip snap={snap} arrows={arrowsData} />

          <SectionHeader label="// HOOD · DRIFT BOARD" />

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <FilterPills value={filter} onChange={setFilter} buckets={buckets} />
            <div className="ml-auto flex items-center gap-2 text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>
              <span>sort</span>
              <SortToggle value={sort} onChange={setSort} />
            </div>
          </div>

          <DriftBoard rows={filtered} rowRefs={rowRefs} arrows={arrowsData?.arrows ?? null} />

          <div className="h-10" />
          <SectionHeader label="// HOOD · ARROWS FEED" />
          <ArrowsFeed data={arrowsData} />

          <Footer />
        </div>
      </div>
    </div>
  );
}

// ── Header ─────────────────────────────────────────────────────────────────
function Header({
  snap,
  lastFetch,
  marketBadge,
}: {
  snap: HoodSnapshot | null;
  lastFetch: number;
  marketBadge: { label: string; color: string };
}) {
  const ago = lastFetch ? Math.max(0, Math.round((Date.now() - lastFetch) / 1000)) : null;

  return (
    <header className="mb-8 flex flex-wrap items-baseline gap-x-4 gap-y-2">
      <div className="flex items-baseline gap-3">
        <div className="text-2xl font-bold tracking-tight" style={{ color: RH_GREEN }}>
          Blue Hood
        </div>
        <div className="text-sm" style={{ color: "#9aa1ac" }}>
          copilot for Robinhood Chain
        </div>
      </div>
      <div className="ml-auto flex items-center gap-4 font-mono text-xs">
        <span style={{ color: marketBadge.color }}>● {marketBadge.label}</span>
        <span style={{ color: MUTED }}>
          {ago === null || !snap ? "…" : `updated ${ago}s ago`}
        </span>
      </div>
    </header>
  );
}

// ── Metric strip ───────────────────────────────────────────────────────────
function MetricStrip({
  snap,
  arrows,
}: {
  snap: HoodSnapshot | null;
  arrows: Extract<ArrowsRes, { ok: true }> | null;
}) {
  const hitLabel = arrows
    ? arrows.hit_rate.ready ? `${arrows.hit_rate.pct}%` : "n/a"
    : "…";
  const hitSub = arrows
    ? arrows.hit_rate.ready
      ? `${arrows.hit_rate.sample} graded · 7d`
      : `warming up · ${arrows.hit_rate.sample}/${arrows.hit_rate.needed}`
    : undefined;

  // BLOCKER 2 — honest denominator. Show "watched / registry_total" and
  // annotate the drops so no one has to guess where the missing 2 went.
  const watchedValue = snap
    ? `${snap.metrics.tokens_watched - snap.metrics.tokens_errored}/${snap.metrics.registry_total}`
    : "…";
  const watchedSub = snap
    ? snap.metrics.tokens_errored > 0
      ? `${snap.metrics.tokens_errored} errored · ${snap.metrics.tokens_no_feed} no feed`
      : snap.metrics.tokens_no_feed > 0
        ? `${snap.metrics.tokens_no_feed} no Chainlink feed`
        : "chainlink-backed"
    : undefined;

  const items: { label: string; value: string; sub?: string }[] = [
    { label: "ARROWS TODAY", value: arrows ? String(arrows.arrows_today) : "…", sub: "fired in last 24h" },
    { label: "HIT RATE 7D", value: hitLabel, sub: hitSub },
    { label: "TOKENS WATCHED", value: watchedValue, sub: watchedSub },
    { label: "TVL SCANNED", value: snap ? formatUsd(snap.metrics.tvl_scanned_usd) : "…", sub: "primary pools" },
  ];

  return (
    <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded border px-4 py-3"
          style={{ borderColor: BORDER, backgroundColor: SURFACE }}
        >
          <div className="mb-1 font-mono text-[9px] uppercase tracking-widest" style={{ color: MUTED }}>
            {it.label}
          </div>
          <div className="font-mono text-xl text-white">{it.value}</div>
          {it.sub && (
            <div className="mt-1 text-[11px]" style={{ color: MUTED }}>{it.sub}</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Filter + sort ──────────────────────────────────────────────────────────
function FilterPills({
  value,
  onChange,
  buckets,
}: {
  value: Filter;
  onChange: (v: Filter) => void;
  buckets: Record<"tradable" | "dust" | "no_data", TickerSnapshot[]>;
}) {
  // T5 — every pill shows its bucket count. Empty buckets get grayed but
  // stay clickable so the presence of a category is always visible.
  const driftingN = buckets.tradable.filter((r) => Math.abs(r.drift_pct ?? 0) >= 1).length;
  const flowN = buckets.tradable.filter((r) => (r.volume_24h_usd ?? 0) >= 5_000).length;
  const frozenN = buckets.tradable.filter((r) => isFrozenLike(r.verdict)).length;

  const opts: { key: Filter; label: string; count: number }[] = [
    { key: "tradable", label: "Tradable", count: buckets.tradable.length },
    { key: "drifting", label: "Drifting", count: driftingN },
    { key: "flow",     label: "Flow",     count: flowN },
    { key: "frozen",   label: "Frozen",   count: frozenN },
    { key: "dust",     label: "Dust",     count: buckets.dust.length },
    { key: "no_data",  label: "No data",  count: buckets.no_data.length },
  ];
  return (
    <div className="flex flex-wrap gap-1">
      {opts.map((o) => {
        const active = o.key === value;
        const empty = o.count === 0;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            disabled={empty && !active}
            className="rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed"
            style={{
              borderColor: active ? RH_GREEN : BORDER,
              backgroundColor: active ? "rgba(0,200,5,0.10)" : "transparent",
              color: active ? RH_GREEN : empty ? "#3f4550" : "#9aa1ac",
              opacity: empty && !active ? 0.55 : 1,
            }}
          >
            <span>{o.label}</span>
            <span className="ml-1 font-mono tabular-nums" style={{ opacity: 0.65 }}>({o.count})</span>
          </button>
        );
      })}
    </div>
  );
}

function SortToggle({ value, onChange }: { value: SortKey; onChange: (v: SortKey) => void }) {
  const opts: { key: SortKey; label: string }[] = [
    { key: "drift", label: "Drift" },
    { key: "volume", label: "Volume" },
    { key: "tvl", label: "TVL" },
  ];
  return (
    <div className="flex gap-1">
      {opts.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className="rounded border px-2 py-1 text-[11px] font-medium transition-colors"
            style={{ borderColor: active ? "#3f4550" : BORDER, color: active ? "#E7E9EE" : MUTED }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Drift board ────────────────────────────────────────────────────────────
function DriftBoard({
  rows,
  rowRefs,
  arrows,
}: {
  rows: TickerSnapshot[];
  rowRefs: React.MutableRefObject<Record<string, HTMLTableRowElement | null>>;
  arrows: Arrow[] | null;
}) {
  // T-B2 — accordion: at most one row expanded at a time.
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = useCallback((ticker: string) => {
    setExpanded((cur) => (cur === ticker ? null : ticker));
  }, []);

  if (rows.length === 0) {
    return (
      <div
        className="rounded border border-dashed py-12 text-center text-sm"
        style={{ borderColor: BORDER, color: MUTED }}
      >
        No rows match this filter yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded border" style={{ borderColor: BORDER, backgroundColor: SURFACE }}>
      <table className="w-full text-sm">
        <thead className="font-mono text-[9px] uppercase tracking-widest" style={{ color: MUTED }}>
          <tr className="border-b" style={{ borderColor: BORDER }}>
            <th className="px-3 py-2 text-left">Ticker</th>
            <th className="px-3 py-2 text-right">Oracle</th>
            <th className="px-3 py-2 text-right">DEX</th>
            <th className="px-3 py-2 text-right">Drift</th>
            <th className="px-3 py-2 text-left">24h</th>
            <th className="px-3 py-2 text-right">TVL</th>
            <th className="px-3 py-2 text-right">Vol 24h</th>
            <th className="px-3 py-2 text-left">Verdict</th>
          </tr>
        </thead>
        <tbody className="font-mono text-[13px]">
          {rows.map((r) => {
            const openArrow = arrows?.find((a) => a.ticker === r.ticker && a.status === "open") ?? null;
            return (
              <DriftRow
                key={r.ticker}
                r={r}
                rowRefs={rowRefs}
                expanded={expanded === r.ticker}
                onToggle={() => toggle(r.ticker)}
                openArrow={openArrow}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// T-B1 — sparkline SVG. 1-stroke polyline, no axis, colored by current
// drift sign. Faded horizontal rule = current oracle price. Hidden
// entirely when < 6 candles (never draw a stub line).
function Sparkline({
  points,
  oracle,
  driftPct,
}: {
  points: number[] | null;
  oracle: number | null;
  driftPct: number | null;
}) {
  if (!points || points.length < 6) return <span style={{ color: "#334155" }}>—</span>;

  const w = 60;
  const h = 20;
  const pad = 1;
  const min = Math.min(...points, oracle ?? points[0]);
  const max = Math.max(...points, oracle ?? points[0]);
  const range = max - min || 1;
  const yFor = (v: number) => pad + (1 - (v - min) / range) * (h - pad * 2);
  const step = (w - pad * 2) / (points.length - 1);
  const d = points
    .map((v, i) => `${i === 0 ? "M" : "L"}${(pad + i * step).toFixed(2)},${yFor(v).toFixed(2)}`)
    .join(" ");

  const drift = driftPct ?? 0;
  const strokeColor =
    Math.abs(drift) < 0.5 ? "#64748b" : drift > 0 ? GREEN_TEXT : RED;
  const oracleY = oracle !== null && Number.isFinite(oracle) ? yFor(oracle) : null;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {oracleY !== null && (
        <line
          x1={0}
          x2={w}
          y1={oracleY}
          y2={oracleY}
          stroke="#3f4550"
          strokeWidth={0.5}
          strokeDasharray="2 2"
          opacity={0.7}
        />
      )}
      <path d={d} fill="none" stroke={strokeColor} strokeWidth={1.2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function DriftRow({
  r,
  rowRefs,
  expanded,
  onToggle,
  openArrow,
}: {
  r: TickerSnapshot;
  rowRefs: React.MutableRefObject<Record<string, HTMLTableRowElement | null>>;
  expanded: boolean;
  onToggle: () => void;
  openArrow: Arrow | null;
}) {
  const drift = r.drift_pct ?? 0;
  const dust = isDust(r);
  const noData = isNoData(r);
  const driftColor = Math.abs(drift) < 0.5 ? "#9aa1ac" : drift > 0 ? GREEN_TEXT : RED;

  // T3 — NO DATA row is a distinct visual state: dim oracle, no DEX, no drift.
  if (noData) {
    return (
      <tr
        ref={(el) => { rowRefs.current[r.ticker] = el; }}
        className="border-b last:border-b-0 hover:bg-black/40"
        style={{ borderColor: "#0f1218" }}
      >
        <td className="px-3 py-2 text-left">
          <a
            href={`https://robinhoodchain.blockscout.com/token/${r.contract}`}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-slate-500 hover:text-slate-300"
          >
            {r.ticker}
          </a>
        </td>
        <td className="px-3 py-2 text-right text-slate-500">{formatUsd(r.oracle_usd)}</td>
        <td className="px-3 py-2 text-right text-slate-600">—</td>
        <td className="px-3 py-2 text-right text-slate-600">—</td>
        {/* T-B1 — NO POOL DATA gets an em-dash placeholder in the sparkline column. */}
        <td className="px-3 py-2 text-left text-slate-600">—</td>
        <td className="px-3 py-2 text-right text-slate-600">—</td>
        <td className="px-3 py-2 text-right text-slate-600">—</td>
        <td className="px-3 py-2 text-left">
          <span
            className="rounded px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider"
            style={{ color: "#6b7280", backgroundColor: "#0f1218" }}
            title={r.error ?? "GT returned no pool data. Retry next cycle."}
          >
            NO POOL DATA
          </span>
        </td>
      </tr>
    );
  }

  // T2 — dust row: badge = DUST (gray), drift faded, no LONG/SHORT verdict.
  const rowOpacity = dust ? 0.55 : 1;
  const driftDisplay = dust ? { color: "#4b5563" } : { color: driftColor };
  // T-B1 — sparkline cell content: only shown for tradable rows. Dust
  // rows fall through to the same em-dash placeholder as the header row.
  const sparklineCell = dust ? (
    <span style={{ color: "#334155" }}>—</span>
  ) : (
    <Sparkline points={r.sparkline} oracle={r.oracle_usd} driftPct={r.drift_pct ?? null} />
  );

  const chevron = expanded ? "▾" : "▸";

  return (
    <>
      <tr
        ref={(el) => { rowRefs.current[r.ticker] = el; }}
        className="border-b last:border-b-0 hover:bg-black/40 cursor-pointer"
        style={{ borderColor: "#0f1218", opacity: rowOpacity }}
        onClick={onToggle}
      >
        <td className="px-3 py-2 text-left">
          <span style={{ color: MUTED, marginRight: 4 }}>{chevron}</span>
          <a
            href={`https://robinhoodchain.blockscout.com/token/${r.contract}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-white transition-colors"
            onMouseEnter={(e) => (e.currentTarget.style.color = RH_GREEN)}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#ffffff")}
          >
            {r.ticker}
          </a>
        </td>
        <td className="px-3 py-2 text-right text-[#E7E9EE]">{formatUsd(r.oracle_usd)}</td>
        <td className="px-3 py-2 text-right">
          {r.pool_ref ? (
            <a
              href={poolUrl(r.pool_ref)}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-[#E7E9EE] hover:underline"
            >
              {formatUsd(r.dex_usd)}
            </a>
          ) : (
            <span className="text-[#E7E9EE]">{formatUsd(r.dex_usd)}</span>
          )}
        </td>
        <td className="px-3 py-2 text-right font-mono" style={driftDisplay}>
          {drift > 0 ? "+" : ""}{drift.toFixed(2)}%
        </td>
        <td className="px-3 py-2 text-left align-middle">{sparklineCell}</td>
        <td
          className="px-3 py-2 text-right"
          style={{ color: dust ? AMBER : "#9aa1ac" }}
          title={dust ? `Below $${DUST_TVL_USD.toLocaleString()} — arrows are gated off this row` : undefined}
        >
          {formatUsd(r.tvl_usd)}
        </td>
        <td className="px-3 py-2 text-right" style={{ color: "#9aa1ac" }}>{formatUsd(r.volume_24h_usd)}</td>
        <td className="px-3 py-2 text-left">
          {dust ? <DustBadge /> : <VerdictBadge verdict={r.verdict} />}
        </td>
      </tr>
      {expanded && (
        <tr style={{ borderBottom: "1px solid #0f1218" }}>
          <td colSpan={8} className="px-4 py-3" style={{ backgroundColor: "#07090e" }}>
            <TickerDetailPanel ticker={r.ticker} contract={r.contract} openArrow={openArrow} />
          </td>
        </tr>
      )}
    </>
  );
}

// T2 — separate badge so LONG/SHORT never leaks onto a dust row.
function DustBadge() {
  return (
    <span
      className="rounded px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider"
      style={{ color: "#6b7280", backgroundColor: "#0f1218" }}
      title="Pool TVL below $5k floor — the engine won't fire arrows off this row"
    >
      DUST
    </span>
  );
}

function VerdictBadge({ verdict }: { verdict: M5Verdict | "ERROR" }) {
  // T4 — semantic colors by direction/state:
  //   LONG DEX  = green  (DEX cheaper than oracle → buy DEX)
  //   SHORT DEX = red    (DEX more expensive → sell DEX / short)
  //   ALIGNED   = gray   (no signal, not a direction)
  //   FROZEN_*  = amber  (market closed, tool is honest that this isn't arb)
  const map: Record<M5Verdict | "ERROR", { label: string; color: string; bg: string }> = {
    ALIGNED:          { label: "ALIGNED",   color: "#94a3b8", bg: "#0f1218" },
    LONG_DEX:         { label: "LONG DEX",  color: GREEN_TEXT, bg: "rgba(34,197,94,0.10)" },
    SHORT_DEX:        { label: "SHORT DEX", color: RED,        bg: "rgba(239,68,68,0.10)" },
    FROZEN_ALIGNED:   { label: "FROZEN",    color: AMBER,      bg: "rgba(245,179,66,0.10)" },
    PREMARKET_DRIFT:  { label: "PRE DRIFT", color: AMBER,      bg: "rgba(245,179,66,0.10)" },
    AFTERHOURS_DRIFT: { label: "AH DRIFT",  color: AMBER,      bg: "rgba(245,179,66,0.10)" },
    INSUFFICIENT_DATA:{ label: "NO DATA",   color: MUTED,      bg: "#0f1218" },
    ERROR:            { label: "ERR",       color: RED,        bg: "rgba(239,68,68,0.10)" },
  };
  const s = map[verdict];
  return (
    <span
      className="rounded px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider"
      style={{ color: s.color, backgroundColor: s.bg }}
    >
      {s.label}
    </span>
  );
}

// ── Arrows feed ────────────────────────────────────────────────────────────
function ArrowsFeed({ data }: { data: Extract<ArrowsRes, { ok: true }> | null }) {
  if (!data) {
    return (
      <div className="rounded border border-dashed py-8 text-center text-sm" style={{ borderColor: BORDER, color: MUTED }}>
        Loading feed…
      </div>
    );
  }
  if (data.arrows.length === 0) {
    return (
      <div className="rounded border py-8 text-center text-sm" style={{ borderColor: BORDER, backgroundColor: SURFACE, color: MUTED }}>
        No arrows fired yet. The engine skips a ticker when TVL &lt; $5k,
        the feed is abnormally stale, or an open arrow already covers that
        (ticker, type). Next cycle in ≤ 60s.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded border" style={{ borderColor: BORDER, backgroundColor: SURFACE }}>
      <table className="w-full text-sm">
        <thead className="font-mono text-[9px] uppercase tracking-widest" style={{ color: MUTED }}>
          <tr className="border-b" style={{ borderColor: BORDER }}>
            <th className="px-3 py-2 text-left">Serial</th>
            <th className="px-3 py-2 text-left">Ticker</th>
            <th className="px-3 py-2 text-left">Signal</th>
            <th className="px-3 py-2 text-left">Fired</th>
            <th className="px-3 py-2 text-left">Ref px</th>
            <th className="px-3 py-2 text-left">Outcome</th>
          </tr>
        </thead>
        <tbody className="font-mono text-[13px]">
          {data.arrows.map((a) => <ArrowRow key={a.id} a={a} />)}
        </tbody>
      </table>
    </div>
  );
}

function ArrowRow({ a }: { a: Arrow }) {
  const [open, setOpen] = useState(false);
  const signal = (() => {
    if (a.type === "drift") return `DRIFT ${a.expected_direction === "up" ? "↑" : "↓"}`;
    if (a.type === "arb") return `ARB ${a.expected_direction === "up" ? "long dex" : "short dex"}`;
    if (a.type === "flow") return `FLOW ${a.expected_direction === "up" ? "buy" : "sell"}`;
    return "WHALE Δ";
  })();
  const outcome = (() => {
    if (a.status === "open") return { label: "WATCHING", color: BLUE };
    if (a.outcome === "hit") return { label: "HIT", color: GREEN_TEXT };
    if (a.outcome === "miss") return { label: "MISS", color: RED };
    if (a.outcome === "informational") return { label: "INFO", color: MUTED };
    return { label: "—", color: MUTED };
  })();

  const hasBrief = !!a.brief;
  const chevron = open ? "▾" : "▸";

  return (
    <>
      <tr
        className="border-b last:border-b-0 hover:bg-black/40 cursor-pointer"
        style={{ borderColor: "#0f1218" }}
        onClick={() => setOpen((v) => !v)}
      >
        <td className="px-3 py-2 text-left" style={{ color: RH_GREEN }}>
          <span style={{ color: MUTED, marginRight: 4 }}>{chevron}</span>
          {a.serial}
        </td>
        <td className="px-3 py-2 text-left text-white">{a.ticker}</td>
        <td className="px-3 py-2 text-left" style={{ color: "#9aa1ac" }}>{signal}</td>
        <td className="px-3 py-2 text-left" style={{ color: MUTED }}>{formatRelTime(a.fired_at)}</td>
        <td className="px-3 py-2 text-left" style={{ color: "#E7E9EE" }}>${a.reference_price.toFixed(2)}</td>
        <td className="px-3 py-2 text-left">
          <span
            className="rounded px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider"
            style={{ color: outcome.color, backgroundColor: `${outcome.color}18` }}
            title={a.outcome_detail ?? undefined}
          >
            {outcome.label}
          </span>
        </td>
      </tr>
      {open && (
        <tr style={{ borderBottom: "1px solid #0f1218" }}>
          <td colSpan={6} className="px-3 py-3" style={{ backgroundColor: "#07090e" }}>
            <ArrowBriefBlock a={a} hasBrief={hasBrief} />
          </td>
        </tr>
      )}
    </>
  );
}

// T-A — arrow expand block. Shows A4's verdict_note + LLM one-liner +
// warnings + outcome detail (once graded). Never re-fetches; reads the
// snapshot the engine attached at fire time.
function ArrowBriefBlock({ a, hasBrief }: { a: Arrow; hasBrief: boolean }) {
  return (
    <div className="flex flex-col gap-2 text-[12px]">
      {hasBrief ? (
        <>
          <div className="font-mono text-white leading-relaxed">
            {a.brief!.verdict_note}
          </div>
          {a.brief!.one_line_context && (
            <div className="italic" style={{ color: "#cbd5e1" }}>
              &ldquo;{a.brief!.one_line_context}&rdquo;
            </div>
          )}
          {a.brief!.warnings.length > 0 && (
            <ul className="mt-1 space-y-1">
              {a.brief!.warnings.map((w, i) => (
                <li key={i} className="font-mono text-[11px]" style={{ color: AMBER }}>
                  ⚠ {w}
                </li>
              ))}
            </ul>
          )}
          <FactsAtFire brief={a.brief!} />
          <div className="pt-1 font-mono text-[10px]" style={{ color: MUTED }}>
            brief · {a.brief!.llm_provider ?? "no LLM"} · chain{" "}
            {a.brief!.llm_attempts.map((att) => `${att.provider}:${att.status}`).join("→") || "n/a"}
            {" "}· {formatRelTime(a.brief!.fetched_at)}
          </div>
        </>
      ) : (
        <div className="font-mono text-[11px]" style={{ color: MUTED }}>
          No brief attached — A4 was unavailable when this arrow fired. Numbers still stand on their own.
        </div>
      )}
      {a.outcome_detail && (
        <div
          className="mt-2 rounded border px-2 py-1.5 font-mono text-[11px]"
          style={{ borderColor: BORDER, color: "#E7E9EE" }}
        >
          <span style={{ color: MUTED }}>outcome · </span>{a.outcome_detail}
        </div>
      )}
    </div>
  );
}

// T-A verify — the numeric facts A4 saw when it wrote the brief. Any
// number the LLM cites (e.g. "1.57% 24h decline") should be traceable
// back to one of these values; otherwise the LLM is confabulating.
function FactsAtFire({ brief }: { brief: import("@/lib/blue-hood/types").ArrowBrief }) {
  const f = brief.facts_at_fire;
  if (!f) return null;
  const pairs: [string, string][] = [
    ["dex", f.dex_price_usd !== null ? `$${f.dex_price_usd.toFixed(4)}` : "—"],
    ["oracle", f.oracle_price_usd !== null ? `$${f.oracle_price_usd.toFixed(4)}` : "—"],
    ["tvl", f.dex_tvl_usd !== null ? formatUsd(f.dex_tvl_usd) : "—"],
    ["vol 24h", f.dex_volume_24h_usd !== null ? formatUsd(f.dex_volume_24h_usd) : "—"],
    ["chg 24h", f.dex_change_24h_pct !== null ? `${f.dex_change_24h_pct.toFixed(2)}%` : "—"],
    ["feed age", f.chainlink_age_seconds !== null ? `${f.chainlink_age_seconds}s` : "—"],
  ];
  return (
    <div
      className="mt-2 rounded border px-2 py-1.5 font-mono text-[11px]"
      style={{ borderColor: BORDER, backgroundColor: "#0a0c11", color: "#9aa1ac" }}
    >
      <div className="mb-1 font-mono text-[9px] uppercase tracking-widest" style={{ color: MUTED }}>
        facts at fire · anything in the brief above should reconcile against these
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5">
        {pairs.map(([k, v]) => (
          <span key={k}>
            <span style={{ color: MUTED }}>{k}</span> {v}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────
function SectionHeader({ label }: { label: string }) {
  return (
    <div className="mb-3 font-mono text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>
      {label}
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-12 border-t pt-6 text-[11px]" style={{ borderColor: BORDER, color: MUTED }}>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <span>Oracle: Chainlink AggregatorV3 on RH Chain</span>
        <span>DEX: GeckoTerminal (Uniswap V3/V4)</span>
        <span>
          Powered by 30 <span style={{ color: BLUE }}>Blue Hub</span> skills · x402 · $0.05/call
        </span>
      </div>
    </footer>
  );
}

// ── Utils ──────────────────────────────────────────────────────────────────
function formatUsd(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n > 0) return `$${n.toFixed(4)}`;
  return "$0";
}

function poolUrl(poolRef: string): string {
  return `https://www.geckoterminal.com/robinhood/pools/${poolRef}`;
}

function formatRelTime(iso: string): string {
  const sec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
