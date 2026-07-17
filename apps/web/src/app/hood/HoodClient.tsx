"use client";

/**
 * /hood client — live drift board.
 *
 * Fetches `/api/hood/snapshot` every 15s, renders:
 *   • Header + market clock
 *   • Metric strip (arrows today · hit rate 7d · tokens watched · TVL scanned)
 *   • Drift board table (sort/filter local; sparkline in a follow-up)
 *
 * Design tokens:
 *   • Base: #050508 (page), #0B0D13 (surface), #1a1d24 (border)
 *   • Accent: Robinhood green #00C805
 *   • Semantic: green = hit / positive drift ; red = miss / negative ; amber = thin pool
 *   • All numbers monospace, all rows link out to Blockscout / GT
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { HoodSnapshot, TickerSnapshot, M5Verdict } from "@/lib/blue-hood/types";

const REFRESH_MS = 15_000;
const RH_GREEN = "#00C805";
const AMBER = "#f5b342";
const RED = "#ef4444";
const GREEN_TEXT = "#22c55e";

type SortKey = "drift" | "volume" | "tvl";
type Filter = "all" | "drifting" | "flow" | "frozen";

interface ApiOk {
  ok: true;
  snapshot: HoodSnapshot;
}
interface ApiErr {
  ok: false;
  error: string;
}

export default function HoodClient() {
  const [snap, setSnap] = useState<HoodSnapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<number>(0);
  const [sort, setSort] = useState<SortKey>("drift");
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/hood/snapshot", { cache: "no-store" });
      const body: ApiOk | ApiErr = await r.json();
      if (!body.ok) {
        setErr(body.error);
      } else {
        setSnap(body.snapshot);
        setErr(null);
      }
      setLastFetch(Date.now());
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const rows = useMemo<TickerSnapshot[]>(() => {
    if (!snap) return [];
    let list = snap.tickers.filter((r) => r.verdict !== "ERROR");
    if (filter === "drifting")
      list = list.filter((r) => Math.abs(r.drift_pct ?? 0) >= 1);
    else if (filter === "flow")
      // Placeholder until D2 flow lands in the snapshot (Block 1.2). For now
      // "flow" ≈ pools with significant recent volume, so we can at least
      // scaffold the filter UI.
      list = list.filter((r) => (r.volume_24h_usd ?? 0) >= 5_000);
    else if (filter === "frozen")
      list = list.filter((r) => r.verdict === "FROZEN_ALIGNED" || r.verdict === "PREMARKET_DRIFT" || r.verdict === "AFTERHOURS_DRIFT");

    return [...list].sort((a, b) => {
      if (sort === "drift") return Math.abs(b.drift_pct ?? 0) - Math.abs(a.drift_pct ?? 0);
      if (sort === "volume") return (b.volume_24h_usd ?? 0) - (a.volume_24h_usd ?? 0);
      return (b.tvl_usd ?? 0) - (a.tvl_usd ?? 0);
    });
  }, [snap, sort, filter]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Header snap={snap} lastFetch={lastFetch} />

      {err && (
        <div
          role="alert"
          className="mb-6 rounded border border-amber-800/60 bg-amber-950/40 px-3 py-2 text-sm text-amber-200"
        >
          Poller warming up: {err}. If you just cloned locally, hit{" "}
          <code className="font-mono">/api/cron/blue-hood/poll</code> (dev bypasses auth).
        </div>
      )}

      <MetricStrip snap={snap} />

      <SectionHeader label="// HOOD · DRIFT BOARD" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterPills value={filter} onChange={setFilter} />
        <div className="ml-auto flex items-center gap-2 text-[11px] uppercase tracking-widest text-[#6b7280]">
          <span>sort</span>
          <SortToggle value={sort} onChange={setSort} />
        </div>
      </div>

      <DriftBoard rows={rows} />

      <Footer />
    </div>
  );
}

// ── Header ─────────────────────────────────────────────────────────────────
function Header({ snap, lastFetch }: { snap: HoodSnapshot | null; lastFetch: number }) {
  const marketBadge = (() => {
    if (!snap) return { label: "…", color: "#6b7280" };
    const { market_is_open, market_session } = snap.metrics;
    if (market_is_open) return { label: "NYSE OPEN", color: GREEN_TEXT };
    if (market_session === "premarket") return { label: "PREMARKET", color: AMBER };
    if (market_session === "afterhours") return { label: "AFTER HOURS", color: AMBER };
    return { label: "MARKET CLOSED", color: "#6b7280" };
  })();

  const ago = lastFetch ? Math.max(0, Math.round((Date.now() - lastFetch) / 1000)) : null;

  return (
    <header className="mb-8 flex flex-wrap items-baseline gap-x-4 gap-y-2">
      <div className="flex items-baseline gap-3">
        <div
          className="text-2xl font-bold tracking-tight"
          style={{ color: RH_GREEN }}
        >
          Blue Hood
        </div>
        <div className="text-sm text-[#9aa1ac]">
          copilot for Robinhood Chain
        </div>
      </div>
      <div className="ml-auto flex items-center gap-4 font-mono text-xs">
        <span style={{ color: marketBadge.color }}>● {marketBadge.label}</span>
        <span className="text-[#6b7280]">
          {ago === null ? "…" : `updated ${ago}s ago`}
        </span>
      </div>
    </header>
  );
}

// ── Metric strip ───────────────────────────────────────────────────────────
function MetricStrip({ snap }: { snap: HoodSnapshot | null }) {
  const items: { label: string; value: string; sub?: string }[] = [
    { label: "ARROWS TODAY", value: "0", sub: "engine pending" },
    { label: "HIT RATE 7D", value: "n/a", sub: "warming up · 0/10" },
    {
      label: "TOKENS WATCHED",
      value: snap ? `${snap.metrics.tokens_watched - snap.metrics.tokens_errored}/${snap.metrics.tokens_watched}` : "…",
      sub: snap && snap.metrics.tokens_errored > 0 ? `${snap.metrics.tokens_errored} errored` : undefined,
    },
    {
      label: "TVL SCANNED",
      value: snap ? formatUsd(snap.metrics.tvl_scanned_usd) : "…",
      sub: "primary pools",
    },
  ];

  return (
    <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded border border-[#1a1d24] bg-[#0B0D13] px-4 py-3"
        >
          <div className="mb-1 text-[10px] uppercase tracking-widest text-[#6b7280]">
            {it.label}
          </div>
          <div className="font-mono text-xl text-white">{it.value}</div>
          {it.sub && (
            <div className="mt-1 text-[11px] text-[#6b7280]">{it.sub}</div>
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
              borderColor: active ? RH_GREEN : "#1a1d24",
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
            style={{
              borderColor: active ? "#3f4550" : "#1a1d24",
              color: active ? "#E7E9EE" : "#6b7280",
            }}
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
      <div className="rounded border border-dashed border-[#1a1d24] py-12 text-center text-sm text-[#6b7280]">
        No rows match this filter yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded border border-[#1a1d24]">
      <table className="w-full text-sm">
        <thead className="text-[10px] uppercase tracking-widest text-[#6b7280]">
          <tr className="border-b border-[#1a1d24]">
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
          {rows.map((r) => (
            <DriftRow key={r.ticker} r={r} />
          ))}
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
    <tr className="border-b border-[#0f1218] last:border-b-0 hover:bg-[#0f1218]/60">
      <td className="px-3 py-2 text-left">
        <a
          href={`https://robinhoodchain.blockscout.com/token/${r.contract}`}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-white hover:text-[color:var(--rh)]"
          style={{ ["--rh" as string]: RH_GREEN }}
        >
          {r.ticker}
        </a>
      </td>
      <td className="px-3 py-2 text-right text-[#E7E9EE]">
        {formatUsd(r.oracle_usd)}
      </td>
      <td className="px-3 py-2 text-right">
        {r.pool_ref ? (
          <a
            href={poolUrl(r.pool_ref, r.is_v4_pool_id)}
            target="_blank"
            rel="noreferrer"
            className="text-[#E7E9EE] hover:underline"
          >
            {formatUsd(r.dex_usd)}
          </a>
        ) : (
          <span className="text-[#E7E9EE]">{formatUsd(r.dex_usd)}</span>
        )}
      </td>
      <td className="px-3 py-2 text-right" style={{ color: driftColor }}>
        {drift > 0 ? "+" : ""}
        {drift.toFixed(2)}%
      </td>
      <td
        className="px-3 py-2 text-right"
        style={{ color: thin ? AMBER : "#9aa1ac" }}
        title={thin ? "Thin pool — spot may be dominated by a single trade" : undefined}
      >
        {formatUsd(r.tvl_usd)}
      </td>
      <td className="px-3 py-2 text-right text-[#9aa1ac]">
        {formatUsd(r.volume_24h_usd)}
      </td>
      <td className="px-3 py-2 text-left">
        <VerdictBadge verdict={r.verdict} />
      </td>
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
    INSUFFICIENT_DATA: { label: "NO DATA", color: "#6b7280", bg: "#0f1218" },
    ERROR: { label: "ERR", color: RED, bg: "rgba(239,68,68,0.10)" },
  };
  const s = map[verdict];
  return (
    <span
      className="rounded px-2 py-0.5 text-[10px] font-semibold tracking-wider"
      style={{ color: s.color, backgroundColor: s.bg }}
    >
      {s.label}
    </span>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────
function SectionHeader({ label }: { label: string }) {
  return (
    <div className="mb-3 text-[11px] uppercase tracking-widest text-[#6b7280]">
      {label}
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-12 border-t border-[#1a1d24] pt-6 text-[11px] text-[#6b7280]">
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <span>Oracle: Chainlink AggregatorV3 on RH Chain</span>
        <span>DEX: GeckoTerminal (Uniswap V3/V4)</span>
        <span>Powered by 30 Blue Hub skills · x402 · $0.05/call</span>
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

function poolUrl(poolRef: string, isV4: boolean): string {
  // v4 poolIds are bytes32 hashes GeckoTerminal indexes under /pools/<id>
  // v3 pool addresses are the same path shape; both work here.
  const _ = isV4;
  return `https://www.geckoterminal.com/robinhood/pools/${poolRef}`;
}
