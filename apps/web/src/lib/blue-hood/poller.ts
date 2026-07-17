/**
 * Blue Hood — one poll cycle.
 *
 * Called by the cron route (/api/cron/blue-hood/poll) every 60s. Fans out
 * M5 (`rh-stock-arb`) for the whole watchlist, reshapes each response into
 * a `TickerSnapshot`, writes:
 *   • `bh:snapshot:latest` (the read path for /hood + the rule engine)
 *   • `bh:snapshot:hour:YYYYMMDDHH` (ring buffer for the sparkline / history)
 *
 * Design notes:
 *   • Concurrency-capped: 26 tokens × M5 in parallel is fine (Gate 3
 *     showed p95 1502ms for 20× concurrent M5 with zero 429s), but we still
 *     batch in groups of 8 so a burst doesn't spike GeckoTerminal.
 *   • Every field the /hood UI reads comes verbatim from the tool response —
 *     we never re-derive drift or verdict here. The tool is the source of
 *     truth, this file is glue.
 *   • On per-ticker failure we emit a `verdict: "ERROR"` row + `error` field
 *     rather than dropping the ticker; the UI can show "n/26 online" and
 *     preserve slot ordering.
 */
import { kvSet } from "@/lib/kv";
import { HOOD_WATCHLIST } from "./registry";
import { callTool } from "./tool-caller";
import {
  KV_SNAPSHOT_LATEST,
  TTL_SNAPSHOT_HOUR,
  kvSnapshotHour,
  yyyymmddhh,
} from "./kv-keys";
import type { HoodSnapshot, M5Verdict, MarketSession, TickerSnapshot } from "./types";

// M5 response shape (subset we care about — kept in this file so a change in
// the tool trips a compile error here first).
interface M5Response {
  verdict: M5Verdict;
  ticker: string;
  name: string;
  contract: string;
  market: { is_open: boolean; session: MarketSession; ny_time_iso: string };
  delta: { pct: number };
  chainlink: { price_usd: number };
  dex: {
    price_usd: number;
    tvl_usd: number;
    volume_24h_usd: number;
    pool_ref: string;
    is_v4_pool_id: boolean;
  };
  warnings: string[];
}

async function pollOne(ticker: string): Promise<TickerSnapshot> {
  const entry = HOOD_WATCHLIST.find((t) => t.ticker === ticker)!;
  const r = await callTool<M5Response>("rh-stock-arb", { ticker });

  if (!r.ok) {
    return {
      ticker,
      name: entry.name,
      contract: entry.contract,
      verdict: "ERROR",
      oracle_usd: null,
      dex_usd: null,
      tvl_usd: null,
      volume_24h_usd: null,
      drift_pct: null,
      pool_ref: null,
      is_v4_pool_id: false,
      market: {
        is_open: false,
        session: "regular",
        ny_time_iso: new Date().toISOString(),
      },
      warnings: [],
      error: `${r.status}: ${r.error}`,
    };
  }

  const d = r.data;
  return {
    ticker: d.ticker,
    name: d.name,
    contract: d.contract,
    verdict: d.verdict,
    oracle_usd: d.chainlink?.price_usd ?? null,
    dex_usd: d.dex?.price_usd ?? null,
    tvl_usd: d.dex?.tvl_usd ?? null,
    volume_24h_usd: d.dex?.volume_24h_usd ?? null,
    drift_pct: typeof d.delta?.pct === "number" ? d.delta.pct : null,
    pool_ref: d.dex?.pool_ref ?? null,
    is_v4_pool_id: Boolean(d.dex?.is_v4_pool_id),
    market: d.market,
    warnings: Array.isArray(d.warnings) ? d.warnings : [],
  };
}

/**
 * Fan out M5 across the watchlist in batches. Returns the full snapshot;
 * writing to KV is the caller's job so the cron route can also decide the
 * cycle_id (based on wall-clock hour bucket).
 */
export async function runPollCycle(): Promise<HoodSnapshot> {
  const started_at = new Date();
  const BATCH = 8;
  const rows: TickerSnapshot[] = [];
  for (let i = 0; i < HOOD_WATCHLIST.length; i += BATCH) {
    const slice = HOOD_WATCHLIST.slice(i, i + BATCH);
    const results = await Promise.all(slice.map((t) => pollOne(t.ticker)));
    rows.push(...results);
  }
  const finished_at = new Date();

  const tokens_errored = rows.filter((r) => r.verdict === "ERROR").length;
  const tvl_scanned_usd = rows.reduce((sum, r) => sum + (r.tvl_usd ?? 0), 0);
  // Market clock — read from the first successful row. All rows share the
  // same NY clock so this is safe.
  const first_ok = rows.find((r) => r.verdict !== "ERROR");
  const market = first_ok?.market ?? {
    is_open: false,
    session: "regular" as MarketSession,
    ny_time_iso: started_at.toISOString(),
  };

  return {
    cycle_id: Math.floor(started_at.getTime() / 1000),
    started_at: started_at.toISOString(),
    finished_at: finished_at.toISOString(),
    duration_ms: finished_at.getTime() - started_at.getTime(),
    tickers: rows,
    metrics: {
      tokens_watched: HOOD_WATCHLIST.length,
      tokens_errored,
      tvl_scanned_usd,
      market_is_open: market.is_open,
      market_session: market.session,
    },
  };
}

/**
 * Persist a snapshot to KV. Two keys:
 *   • latest — always overwritten
 *   • ring-buffer bucket — one write per hour bucket; downstream sparkline
 *     read walks 24 keys backwards from now.
 */
export async function persistSnapshot(snap: HoodSnapshot): Promise<void> {
  await kvSet(KV_SNAPSHOT_LATEST, snap);
  const bucket = yyyymmddhh(new Date(snap.started_at));
  await kvSet(kvSnapshotHour(bucket), snap, TTL_SNAPSHOT_HOUR);
}
