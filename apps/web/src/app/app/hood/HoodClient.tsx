"use client";

/**
 * /hood client — live drift board + arrows feed.
 *
 * Layout follows the AppShell design language exactly:
 *   • bg #050508  · surface #0B0D13 · border #1A1A2E
 *   • font-mono for every number
 *   • section headers `// HOOD · <SECTION>` in slate-500 tracking-widest
 *   • primary interactive accent: Robinhood green #00C805 (per spec —
 *     this is the ONE place blue is not the accent; blue only shows in
 *     the footer "powered by 30 Blue Hub skills" attribution)
 *
 * Two data fetches, both `no-store`:
 *   • /api/hood/snapshot — poller's latest snapshot
 *   • /api/hood/arrows   — fired arrows + graded hit-rate
 * Both refresh every 15s; a single AbortController handles unmount.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { HoodSnapshot, TickerSnapshot, M5Verdict, Arrow } from "@/lib/blue-hood/types";

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
type Filter = "all" | "drifting" | "flow" | "frozen";

type SnapshotRes = { ok: true; snapshot: HoodSnapshot } | { ok: false; error: string };
type ArrowsRes =
  | {
      ok: true;
      arrows: Arrow[];
      arrows_today: number;
      hit_rate:
        | { ready: true; pct: number; sample: number }
        | { ready: false; sample: number; needed: number };
    }
  | { ok: false; error: string };

export default function HoodClient() {
  const [snap, setSnap] = useState<HoodSnapshot | null>(null);
  const [arrowsData, setArrowsData] = useState<Extract<ArrowsRes, { ok: true }> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<number>(0);
  const [sort, setSort] = useState<SortKey>("drift");
  const [filter, setFilter] = useState<Filter>("all");

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

  const rows = useMemo<TickerSnapshot[]>(() => {
    if (!snap) return [];
    let list = snap.tickers.filter((r) => r.verdict !== "ERROR");
    if (filter === "drifting") list = list.filter((r) => Math.abs(r.drift_pct ?? 0) >= 1);
    else if (filter === "flow") list = list.filter((r) => (r.volume_24h_usd ?? 0) >= 5_000);
    else if (filter === "frozen") list = list.filter((r) =>
      r.verdict === "FROZEN_ALIGNED" || r.verdict === "PREMARKET_DRIFT" || r.verdict === "AFTERHOURS_DRIFT",
    );
    return [...list].sort((a, b) => {
      if (sort === "drift") return Math.abs(b.drift_pct ?? 0) - Math.abs(a.drift_pct ?? 0);
      if (sort === "volume") return (b.volume_24h_usd ?? 0) - (a.volume_24h_usd ?? 0);
      return (b.tvl_usd ?? 0) - (a.tvl_usd ?? 0);
    });
  }, [snap, sort, filter]);

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: BG }}>
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
        <Header snap={snap} lastFetch={lastFetch} />

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
          <FilterPills value={filter} onChange={setFilter} />
          <div className="ml-auto flex items-center gap-2 text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>
            <span>sort</span>
            <SortToggle value={sort} onChange={setSort} />
          </div>
        </div>

        <DriftBoard rows={rows} />

        <div className="h-10" />
        <SectionHeader label="// HOOD · ARROWS FEED" />
        <ArrowsFeed data={arrowsData} />

        <Footer />
      </div>
    </div>
  );
}

// ── Header ─────────────────────────────────────────────────────────────────
function Header({ snap, lastFetch }: { snap: HoodSnapshot | null; lastFetch: number }) {
  const marketBadge = (() => {
    if (!snap) return { label: "…", color: MUTED };
    const { market_is_open, market_session } = snap.metrics;
    if (market_is_open) return { label: "NYSE OPEN", color: GREEN_TEXT };
    if (market_session === "premarket") return { label: "PREMARKET", color: AMBER };
    if (market_session === "afterhours") return { label: "AFTER HOURS", color: AMBER };
    return { label: "MARKET CLOSED", color: MUTED };
  })();

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
          {ago === null ? "…" : `updated ${ago}s ago`}
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

  const items: { label: string; value: string; sub?: string }[] = [
    { label: "ARROWS TODAY", value: arrows ? String(arrows.arrows_today) : "…", sub: "fired in last 24h" },
    { label: "HIT RATE 7D", value: hitLabel, sub: hitSub },
    {
      label: "TOKENS WATCHED",
      value: snap ? `${snap.metrics.tokens_watched - snap.metrics.tokens_errored}/${snap.metrics.tokens_watched}` : "…",
      sub: snap && snap.metrics.tokens_errored > 0 ? `${snap.metrics.tokens_errored} errored` : "chainlink-backed",
    },
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
function FilterPills({ value, onChange }: { value: Filter; onChange: (v: Filter) => void }) {
  const opts: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "drifting", label: "Drifting" },
    { key: "flow", label: "Flow signals" },
    { key: "frozen", label: "Frozen" },
  ];
  return (
    <div className="flex gap-1">
      {opts.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
            style={{
              borderColor: active ? RH_GREEN : BORDER,
              backgroundColor: active ? "rgba(0,200,5,0.10)" : "transparent",
              color: active ? RH_GREEN : "#9aa1ac",
            }}
          >
            {o.label}
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
function DriftBoard({ rows }: { rows: TickerSnapshot[] }) {
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
            <th className="px-3 py-2 text-right">TVL</th>
            <th className="px-3 py-2 text-right">Vol 24h</th>
            <th className="px-3 py-2 text-left">Verdict</th>
          </tr>
        </thead>
        <tbody className="font-mono text-[13px]">
          {rows.map((r) => (<DriftRow key={r.ticker} r={r} />))}
        </tbody>
      </table>
    </div>
  );
}

function DriftRow({ r }: { r: TickerSnapshot }) {
  const drift = r.drift_pct ?? 0;
  const driftColor = Math.abs(drift) < 0.5 ? "#9aa1ac" : drift > 0 ? GREEN_TEXT : RED;
  const thin = (r.tvl_usd ?? 0) < 5_000;

  return (
    <tr className="border-b last:border-b-0 hover:bg-black/40" style={{ borderColor: "#0f1218" }}>
      <td className="px-3 py-2 text-left">
        <a
          href={`https://robinhoodchain.blockscout.com/token/${r.contract}`}
          target="_blank"
          rel="noreferrer"
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
          <a href={poolUrl(r.pool_ref)} target="_blank" rel="noreferrer" className="text-[#E7E9EE] hover:underline">
            {formatUsd(r.dex_usd)}
          </a>
        ) : (
          <span className="text-[#E7E9EE]">{formatUsd(r.dex_usd)}</span>
        )}
      </td>
      <td className="px-3 py-2 text-right" style={{ color: driftColor }}>
        {drift > 0 ? "+" : ""}{drift.toFixed(2)}%
      </td>
      <td
        className="px-3 py-2 text-right"
        style={{ color: thin ? AMBER : "#9aa1ac" }}
        title={thin ? "Thin pool — spot may be dominated by a single trade" : undefined}
      >
        {formatUsd(r.tvl_usd)}
      </td>
      <td className="px-3 py-2 text-right" style={{ color: "#9aa1ac" }}>{formatUsd(r.volume_24h_usd)}</td>
      <td className="px-3 py-2 text-left"><VerdictBadge verdict={r.verdict} /></td>
    </tr>
  );
}

function VerdictBadge({ verdict }: { verdict: M5Verdict | "ERROR" }) {
  const map: Record<M5Verdict | "ERROR", { label: string; color: string; bg: string }> = {
    ALIGNED: { label: "ALIGNED", color: GREEN_TEXT, bg: "rgba(34,197,94,0.10)" },
    LONG_DEX: { label: "LONG DEX", color: GREEN_TEXT, bg: "rgba(34,197,94,0.10)" },
    SHORT_DEX: { label: "SHORT DEX", color: RED, bg: "rgba(239,68,68,0.10)" },
    FROZEN_ALIGNED: { label: "FROZEN", color: "#9aa1ac", bg: "#0f1218" },
    PREMARKET_DRIFT: { label: "PRE DRIFT", color: AMBER, bg: "rgba(245,179,66,0.10)" },
    AFTERHOURS_DRIFT: { label: "AH DRIFT", color: AMBER, bg: "rgba(245,179,66,0.10)" },
    INSUFFICIENT_DATA: { label: "NO DATA", color: MUTED, bg: "#0f1218" },
    ERROR: { label: "ERR", color: RED, bg: "rgba(239,68,68,0.10)" },
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

  return (
    <tr className="border-b last:border-b-0 hover:bg-black/40" style={{ borderColor: "#0f1218" }}>
      <td className="px-3 py-2 text-left" style={{ color: RH_GREEN }}>{a.serial}</td>
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
