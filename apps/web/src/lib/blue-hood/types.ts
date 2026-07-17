/**
 * Blue Hood — shared type definitions.
 *
 * The poller writes normalized snapshots + arrows into KV; /hood + the
 * alert delivery layer read from KV. This file is the single source of
 * truth for those shapes so every reader/writer stays honest.
 */

// ── Snapshot ──────────────────────────────────────────────────────────────
// One row per registry ticker per poll cycle. The M5 arb tool already
// gives us most of what /hood needs — verdict, market clock, drift %,
// pool metadata. We only re-shape it (drop noisy nested fields), never
// re-derive numbers here.

export type M5Verdict =
  | "ALIGNED"
  | "LONG_DEX"
  | "SHORT_DEX"
  | "FROZEN_ALIGNED"
  | "PREMARKET_DRIFT"
  | "AFTERHOURS_DRIFT"
  | "INSUFFICIENT_DATA";

export type MarketSession = "regular" | "premarket" | "afterhours" | "weekend" | "holiday";

export interface TickerSnapshot {
  /** Ticker symbol, uppercase. */
  ticker: string;
  /** Human-readable name from registry. */
  name: string;
  /** ERC-20 contract on Robinhood Chain. */
  contract: string;
  /** M5 verdict, or "ERROR" if the poll failed for this row. */
  verdict: M5Verdict | "ERROR";
  /** Chainlink oracle price, USD. Null on error. */
  oracle_usd: number | null;
  /** Deepest DEX pool spot price, USD. Null on error. */
  dex_usd: number | null;
  /** Pool TVL (USD) — used for dust-floor gating in the rule engine. */
  tvl_usd: number | null;
  /** 24h volume in the primary pool — same dust-floor gate. */
  volume_24h_usd: number | null;
  /** dex/oracle drift as a percentage. Positive = DEX above oracle. */
  drift_pct: number | null;
  /** Reference to the primary pool (address or v4 pool id). */
  pool_ref: string | null;
  /** Whether pool_ref is a Uniswap v4 poolId (bytes32) vs a v3 pool address. */
  is_v4_pool_id: boolean;
  /** Market clock at time of snapshot (open + session). */
  market: {
    is_open: boolean;
    session: MarketSession;
    ny_time_iso: string;
  };
  /** Warnings surfaced verbatim from M5 (feed_abnormally_stale, thin_dex_pool, etc.). */
  warnings: string[];
  /** Error message if `verdict === "ERROR"`. */
  error?: string;
  /** Wall-clock ms since cycle start when this row was polled. Used by the
   *  UI to compute per-row freshness (`age_s = now - snap.started_at - polled_at_ms`). */
  polled_at_ms: number;
  /** How stale the GT pool response was when reshaped (seconds). Null on
   *  cold fetch, a number when memo-served. Reviewer T1(d): "token nào
   *  serve từ cache cũ phải nói". */
  data_age_s: number | null;
}

export interface HoodSnapshot {
  /** Monotonic snapshot id. Also used as ring-buffer key. */
  cycle_id: number;
  /** ISO timestamp the poll cycle started. */
  started_at: string;
  /** ISO timestamp the poll cycle finished. */
  finished_at: string;
  /** Wall-clock duration in ms. */
  duration_ms: number;
  /** One row per token watched this cycle. */
  tickers: TickerSnapshot[];
  /** Aggregated metrics for the /hood header strip. Denominators are HONEST:
   *  `registry_total` is the RWA candidate set (stocks + ETFs, not the whole
   *  registry — utility WETH/USDG are plumbing, not positions to watch). */
  metrics: {
    /** Every stock + ETF in the RWA registry. The UI shows "N/registry_total". */
    registry_total: number;
    /** Rows this cycle actually polled (registry_total minus no-Chainlink drops). */
    tokens_watched: number;
    /** Registry rows dropped this cycle because they lack a Chainlink feed. */
    tokens_no_feed: number;
    /** Rows polled but whose M5 call errored. Subset of tokens_watched. */
    tokens_errored: number;
    tvl_scanned_usd: number;
    market_is_open: boolean;
    market_session: MarketSession;
  };
}

// ── Arrow ──────────────────────────────────────────────────────────────────
// An arrow is a graded signal fired by the rule engine (Block 1.2). This
// file only declares the type; the engine + grader land in a follow-up
// commit so /hood can still render "no arrows yet" without them.

export type ArrowType = "drift" | "arb" | "flow" | "whale";

export type ArrowStatus = "open" | "graded" | "informational";

export type ArrowOutcome = "hit" | "miss" | "informational" | null;

export interface Arrow {
  /** UUID or ULID for uniqueness. */
  id: string;
  /** Aesthetic serial: `#0001`, `#0002` — monotonic per-project. */
  serial: string;
  /** Ticker this arrow is about. */
  ticker: string;
  /** Arrow type — determines grading rule. */
  type: ArrowType;
  /** Which direction the arrow expects the DEX price to move. */
  expected_direction: "up" | "down" | null;
  /** How many hours we wait before grading. */
  grading_window_h: number;
  /** DEX price at fire time (used as the grading baseline). */
  reference_price: number;
  /** Free-form snapshot ids we can cross-reference at grade time. */
  snapshot_refs: number[];
  /** ISO timestamp fired. */
  fired_at: string;
  /** Current lifecycle status. */
  status: ArrowStatus;
  /** Outcome once graded. Null until then. */
  outcome: ArrowOutcome;
  /** ISO timestamp graded, null until then. */
  graded_at: string | null;
  /** Free-form detail — e.g. "gap closed 62%", "price moved +1.7% opposite in 3h". */
  outcome_detail: string | null;
  /** True for arrows minted by `/api/cron/blue-hood/seed-test-arrow` (dev
   *  UI smoke). Filtered out of the public feed + hit-rate. Absent on real
   *  arrows so the field never accidentally reads as truthy. */
  test?: boolean;
}
