/**
 * Blue Hood — one poll cycle.
 *
 * Called by the 60s scheduler (/api/cron/blue-hood/poll). Fans out M5
 * (`rh-stock-arb`) across the watchlist and reshapes each response into a
 * `TickerSnapshot`. Writes:
 *   • `bh:snapshot:latest` — read path for /hood + the rule engine
 *   • `bh:snapshot:hour:YYYYMMDDHH` — ring buffer for the sparkline / history
 *
 * ── Rate-limit strategy (T1) ───────────────────────────────────────────────
 * GeckoTerminal's free tier caps at ~30 req/min. The earlier "batch 8×"
 * approach burst all 24 tokens in <2s and got rate-limited from position ~9
 * onwards ("alphabet cutoff" at INTC). This poller now runs SEQUENTIAL with
 * a stagger delay so 24 tokens land across ~60s, which sits under GT's
 * cap and gives the memo layer time to reuse.
 *
 * The exact stagger is `BH_POLL_STAGGER_MS` (default 2500ms → 60s cycle).
 * On a warm handler the 60s memo TTL in `rwa-market.ts` means a same-token
 * re-poll one cycle later still hits network (memo just expired) — that's
 * intentional; we want fresh prices, not stale ones.
 */
import { kvSet } from "@/lib/kv";
import { HOOD_WATCHLIST, HOOD_REGISTRY_STATS } from "./registry";
import { callTool } from "./tool-caller";
import {
  KV_SNAPSHOT_LATEST,
  TTL_SNAPSHOT_HOUR,
  kvSnapshotHour,
  yyyymmddhh,
} from "./kv-keys";
import type { HoodSnapshot, M5Verdict, MarketSession, TickerSnapshot } from "./types";
import { cacheAgeS } from "@/lib/robinhood/rwa-market";
import { readSparkline } from "./sparkline";

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
    /** Deprecated alias for `primary_pool_tvl_usd`; kept for older M5 outputs. */
    tvl_usd: number;
    /** Primary pool TVL — the pool the swap path uses. */
    primary_pool_tvl_usd?: number;
    /** SUM across every RH-Chain pool for this token. Feeds the dust gate. */
    total_tvl_usd?: number;
    /** Number of pools discovered for this token. */
    pool_count?: number;
    volume_24h_usd: number;
    pool_ref: string;
    is_v4_pool_id: boolean;
  };
  warnings: string[];
}

const GT_TOKENS_URL_BASE = "https://api.geckoterminal.com/api/v2/networks/robinhood/tokens";
// 3s stagger → 24 tokens over ~72s per cycle. GT rate-limit on the RH
// network endpoint seems to sit around 20 req/min in practice (below the
// 30/min free-tier claim); 3s stagger stays safely under.
const DEFAULT_STAGGER_MS = 3000;
function staggerMs(): number {
  const raw = process.env.BH_POLL_STAGGER_MS;
  if (raw === undefined || raw === "") return DEFAULT_STAGGER_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_STAGGER_MS;
}

async function pollOne(ticker: string, cycleStart: number): Promise<TickerSnapshot> {
  const entry = HOOD_WATCHLIST.find((t) => t.ticker === ticker)!;
  const polled_at_ms = Date.now() - cycleStart;
  const r = await callTool<M5Response>("rh-stock-arb", { ticker });

  // Freshness attribution — inspect the memo for the URL M5 hit internally.
  const gtUrl = `${GT_TOKENS_URL_BASE}/${entry.contract.toLowerCase()}/pools?page=1`;
  const data_age_s = cacheAgeS(gtUrl);

  // T-B1 — read cached sparkline (no network here; the refresh cron owns
  // populating the cache). Null when cold; the UI hides the column when
  // it's null or below 6 candles.
  const sparkline = await readSparkline(ticker);

  if (!r.ok) {
    // T-B.1 #4 — tool call itself failed: fetch_failed. `no_pool` is
    // reserved for the case where the tool DID reach the upstream but
    // no pool exists.
    return {
      ticker,
      name: entry.name,
      contract: entry.contract,
      verdict: "ERROR",
      oracle_usd: null,
      dex_usd: null,
      tvl_usd: null,
      total_tvl_usd: null,
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
      polled_at_ms,
      data_age_s,
      sparkline,
      no_data_reason: "fetch_failed",
    };
  }

  const d = r.data;
  const hasDex = d.dex?.price_usd !== undefined && d.dex.price_usd !== null;
  // T-B.1 #4 — for successful responses with no DEX data, infer the
  // reason from the memo cache. GT hit succeeded (memo populated) but
  // no valid pool = no_pool. GT hit not memoized (data_age_s === null)
  // and we still have no DEX = the fetch inside M5 got null (rate-limit
  // or upstream error) → fetch_failed.
  const no_data_reason: "no_pool" | "fetch_failed" | null = hasDex
    ? null
    : (data_age_s !== null ? "no_pool" : "fetch_failed");

  return {
    ticker: d.ticker,
    name: d.name,
    contract: d.contract,
    verdict: d.verdict,
    oracle_usd: d.chainlink?.price_usd ?? null,
    dex_usd: d.dex?.price_usd ?? null,
    // `tvl_usd` = primary-pool TVL (unchanged shape). `total_tvl_usd`
    // (T-B fix — dust-gate correctness): SUM across all pools; falls
    // back to primary if M5 predates the field so mid-deploy cycles are
    // safe. Rule engine reads `total_tvl_usd ?? tvl_usd` for the gate.
    tvl_usd: d.dex?.primary_pool_tvl_usd ?? d.dex?.tvl_usd ?? null,
    total_tvl_usd: d.dex?.total_tvl_usd ?? d.dex?.tvl_usd ?? null,
    volume_24h_usd: d.dex?.volume_24h_usd ?? null,
    drift_pct: typeof d.delta?.pct === "number" ? d.delta.pct : null,
    pool_ref: d.dex?.pool_ref ?? null,
    is_v4_pool_id: Boolean(d.dex?.is_v4_pool_id),
    market: d.market,
    warnings: Array.isArray(d.warnings) ? d.warnings : [],
    polled_at_ms,
    data_age_s,
    sparkline,
    no_data_reason,
  };
}

/**
 * Sequential+staggered poll. Logs one `[poller]` line per token so a
 * NO_DATA row can be attributed to the exact position in the cycle.
 */
export async function runPollCycle(): Promise<HoodSnapshot> {
  const started_at = new Date();
  const rows: TickerSnapshot[] = [];
  const gap = staggerMs();

  console.log(`[poller] cycle=${Math.floor(started_at.getTime() / 1000)} strategy=sequential stagger_ms=${gap} count=${HOOD_WATCHLIST.length}`);

  for (let i = 0; i < HOOD_WATCHLIST.length; i++) {
    const token = HOOD_WATCHLIST[i];
    const t0 = Date.now();
    const row = await pollOne(token.ticker, started_at.getTime());
    const elapsed_ms = Date.now() - t0;
    const ageStr = row.data_age_s === null ? "cold" : `age=${row.data_age_s.toFixed(1)}s`;
    console.log(`[poller] seq=${i + 1}/${HOOD_WATCHLIST.length} ticker=${row.ticker} verdict=${row.verdict} elapsed_ms=${elapsed_ms} ${ageStr}`);
    rows.push(row);
    if (gap > 0 && i < HOOD_WATCHLIST.length - 1) {
      await new Promise((res) => setTimeout(res, gap));
    }
  }

  const finished_at = new Date();
  const tokens_errored = rows.filter((r) => r.verdict === "ERROR").length;
  // `tvl_scanned_usd` used to sum only primary-pool TVL (missed the
  // bankr-robinhood WETH depth). Now sums TOTAL liquidity per token —
  // matches what the dust gate sees and what a user would call "total
  // depth we're watching". Falls back to primary if `total_tvl_usd` is
  // null (M5 predates the field).
  const tvl_scanned_usd = rows.reduce((sum, r) => sum + (r.total_tvl_usd ?? r.tvl_usd ?? 0), 0);
  // T-B.1 #4 — count no-data rows by reason. A `fetch_failed` streak
  // across cycles is a throttle-tail signal that needs looking at.
  const no_data_no_pool = rows.filter((r) => r.no_data_reason === "no_pool").length;
  const no_data_fetch_failed = rows.filter((r) => r.no_data_reason === "fetch_failed").length;
  console.log(`[poller] cycle-end no_data_by_reason no_pool=${no_data_no_pool} fetch_failed=${no_data_fetch_failed} errored=${tokens_errored}`);
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
      registry_total: HOOD_REGISTRY_STATS.rwa_candidates,
      tokens_watched: HOOD_WATCHLIST.length,
      tokens_no_feed: HOOD_REGISTRY_STATS.no_chainlink_feed,
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
