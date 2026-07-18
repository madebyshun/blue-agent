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
  /** Where the arrow was born. Only `"engine"` arrows are eligible for the
   *  public feed + hit-rate + arrows_today counters — a `"seeded"` arrow
   *  is a hand-crafted dev/QA fixture and can never taint the track
   *  record. Older records without this field are back-compat treated as
   *  `"engine"` (see `/api/hood/arrows`), but every arrow written going
   *  forward carries an explicit tag.
   *
   *  Reviewer T-A #1: "seed-test-arrow LUÔN set origin='seeded', kể cả khi
   *  real=1". Guaranteed by construction — the seed route hard-codes it. */
  origin: "engine" | "seeded";
  /** DEPRECATED. Kept for legacy read of arrows persisted before `origin`
   *  landed. New writers use `origin: "seeded"` instead. Filter treats
   *  `test === true` as "hide" identically. */
  test?: boolean;
  /** Human-language "why" attached by A4 (`rh-stock-agent-brief`) at fire
   *  time. Populated once, cached forever on the arrow record. Null when
   *  the A4 call failed or was skipped — the arrow still fires either way. */
  brief?: ArrowBrief | null;
}

export interface ArrowBrief {
  /** Deterministic 1-sentence "why" hard-mapped from A4's verdict (never
   *  LLM-picked). Always populated when the A4 call succeeded. */
  verdict_note: string;
  /** LLM-generated 1-liner context. Null if the LLM chain failed;
   *  `verdict_note` still carries the deterministic why. */
  one_line_context: string | null;
  /** Warnings from A4 verbatim — feed_abnormally_stale, thin_dex_pool,
   *  llm_context_unavailable, etc. Never edited. */
  warnings: string[];
  /** Which LLM served the context (virtuals / venice / bankr / null). */
  llm_provider: string | null;
  /** Full attempts trace — verifiable proof the Virtuals→Venice→Bankr
   *  chain played correctly. Reviewer T-A #2: on prod attempts[0] must
   *  show `provider: virtuals status: success`; local it's fine to see
   *  attempts[0]={virtuals, error, "VIRTUALS_API_KEY not set"} because
   *  the key is intentionally absent in .env.local. Stored on the arrow
   *  so a track-record reader can audit the chain later. */
  llm_attempts: Array<{
    provider: string;
    status: "success" | "error";
    duration_ms: number;
    error?: string;
  }>;
  /** Snapshot of the numeric facts A4 was given at fire time. Reviewer
   *  T-A verify concern: brief claimed "1.57% 24h decline" but the
   *  current snapshot showed -1.42% — was it legit drift or an LLM
   *  fabrication? With `facts_at_fire` a reader can settle it in one
   *  glance. Populated verbatim from A4's `facts` block. */
  facts_at_fire: {
    dex_price_usd: number | null;
    oracle_price_usd: number | null;
    dex_tvl_usd: number | null;
    dex_volume_24h_usd: number | null;
    dex_change_24h_pct: number | null;
    chainlink_age_seconds: number | null;
  };
  /** ISO timestamp when the brief was fetched. */
  fetched_at: string;
}
