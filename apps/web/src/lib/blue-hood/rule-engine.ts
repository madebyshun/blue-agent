/**
 * Blue Hood — arrow rule engine.
 *
 * Walks a fresh snapshot, decides which tickers deserve an arrow, and hands
 * them to the persistence layer to fire. Every rule matches the public
 * spec exactly (see docs/blue-hood/arrow-rules.md). The engine NEVER
 * generates numbers on its own — thresholds are literal constants, the
 * snapshot fields are the source of truth.
 *
 * A single-cycle guarantee: dedup keys live in KV under
 * `bh:arrow:open:{ticker}:{type}`. If an open arrow already exists for
 * that (ticker, type) we do NOT fire again; the previous arrow will grade
 * itself before we look at that pair again.
 *
 * MVP note: this file lands drift + arb only. Flow (D2) needs D2 in the
 * snapshot; whale (D1) is informational and heavy (1h/cadence) — both
 * land in a follow-up commit so the drift board can ship first.
 */
import { kvGet, kvSet } from "@/lib/kv";
import { KV_ARROW_SERIAL_COUNTER, kvArrow, kvArrowOpenIndex, KV_ARROW_FEED, TTL_ARROW_INDEX } from "./kv-keys";
import type { Arrow, ArrowType, HoodSnapshot, TickerSnapshot } from "./types";

// ── Thresholds (from spec Block 1.2) ─────────────────────────────────────
const DRIFT_MIN_ABS_PCT = 2.0;   // |drift| ≥ 2% during premarket/afterhours
const ARB_MIN_ABS_PCT = 1.0;     // |delta| ≥ 1% during regular hours
const MIN_TVL_USD = 5_000;       // dust floor — same as M4/M5 already enforce

const DRIFT_GRADING_WINDOW_H = 6;   // grade after next-open + 2h (see grader.ts)
const ARB_GRADING_WINDOW_H = 4;

/**
 * Given a snapshot row, decide if it should fire an arrow. Returns null if
 * no rule matches; otherwise returns the arrow shape (without id/serial —
 * those are assigned by `fireArrow`).
 */
export function detectArrow(row: TickerSnapshot):
  | { type: ArrowType; expected_direction: "up" | "down"; grading_window_h: number; reference_price: number }
  | null
{
  if (row.verdict === "ERROR" || row.verdict === "INSUFFICIENT_DATA") return null;
  const tvl = row.tvl_usd ?? 0;
  const drift = row.drift_pct ?? 0;
  const price = row.dex_usd ?? 0;
  if (price <= 0) return null;

  // ── drift: fire only when market is CLOSED and drift is significant ──
  //   • Positive drift → DEX above oracle → expect DEX to fall back at open
  //   • Negative drift → expect DEX to rise
  if (!row.market.is_open && Math.abs(drift) >= DRIFT_MIN_ABS_PCT) {
    if (tvl < MIN_TVL_USD) return null;
    return {
      type: "drift",
      expected_direction: drift > 0 ? "down" : "up",
      grading_window_h: DRIFT_GRADING_WINDOW_H,
      reference_price: price,
    };
  }

  // ── arb: fire only during REGULAR hours on a LONG_DEX / SHORT_DEX verdict ──
  //   • LONG_DEX (DEX below oracle) → arb long DEX → expect DEX to rise
  //   • SHORT_DEX (DEX above oracle) → arb short DEX → expect DEX to fall
  if (row.market.is_open && (row.verdict === "LONG_DEX" || row.verdict === "SHORT_DEX")) {
    if (Math.abs(drift) < ARB_MIN_ABS_PCT) return null;
    if (row.warnings.some((w) => w.startsWith("feed_abnormally_stale"))) return null;
    if (tvl < MIN_TVL_USD) return null;
    return {
      type: "arb",
      expected_direction: row.verdict === "LONG_DEX" ? "up" : "down",
      grading_window_h: ARB_GRADING_WINDOW_H,
      reference_price: price,
    };
  }

  return null;
}

// ── Fire path ──────────────────────────────────────────────────────────────
//
// De-dup + serial + persistence. Called by the engine driver (below) or a
// caller test. Splits from `runRuleEngine` so unit tests can exercise
// dedup logic without a full snapshot.

async function nextSerial(): Promise<string> {
  const cur = (await kvGet<number>(KV_ARROW_SERIAL_COUNTER)) ?? 0;
  const next = cur + 1;
  await kvSet(KV_ARROW_SERIAL_COUNTER, next);
  return `#${String(next).padStart(4, "0")}`;
}

interface OpenIndex {
  arrow_id: string;
  fired_at: string;
}

/**
 * Idempotency: skip if (ticker, type) already has an open arrow. Otherwise
 * mint a serial, persist the arrow record, update the open-index + feed
 * list, and return the fresh arrow. Returns null on skip.
 */
export async function fireArrow(
  ticker: string,
  detected: NonNullable<ReturnType<typeof detectArrow>>,
  snapshot_ref: number,
): Promise<Arrow | null> {
  const idxKey = kvArrowOpenIndex(ticker, detected.type);
  const existing = await kvGet<OpenIndex>(idxKey);
  if (existing) return null; // dedup — an open arrow already covers this pair

  const serial = await nextSerial();
  const id = cryptoUuid();
  const now = new Date().toISOString();
  const arrow: Arrow = {
    id,
    serial,
    ticker,
    type: detected.type,
    expected_direction: detected.expected_direction,
    grading_window_h: detected.grading_window_h,
    reference_price: detected.reference_price,
    snapshot_refs: [snapshot_ref],
    fired_at: now,
    status: "open",
    outcome: null,
    graded_at: null,
    outcome_detail: null,
  };

  await kvSet(kvArrow(id), arrow);
  await kvSet(idxKey, { arrow_id: id, fired_at: now } satisfies OpenIndex, TTL_ARROW_INDEX);

  // Push id onto the feed list (newest-first). We keep the feed unbounded
  // for now; when it grows past ~500 we can trim in a follow-up.
  const feed = (await kvGet<string[]>(KV_ARROW_FEED)) ?? [];
  feed.unshift(id);
  await kvSet(KV_ARROW_FEED, feed);

  return arrow;
}

/**
 * Small polyfill so this file compiles under Node's default runtime — the
 * upstash serverless runtime may not have `crypto.randomUUID` on all
 * versions of Node. Falls back to a deterministic hex + timestamp id.
 */
function cryptoUuid(): string {
  try {
    const g = globalThis as { crypto?: { randomUUID?: () => string } };
    if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  } catch { /* fall through */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ── Engine driver ──────────────────────────────────────────────────────────
export interface RuleEngineReport {
  cycle_id: number;
  arrows_fired: Arrow[];
  arrows_skipped_dedup: number;
  arrows_skipped_no_match: number;
}

export async function runRuleEngine(snap: HoodSnapshot): Promise<RuleEngineReport> {
  const fired: Arrow[] = [];
  let deduped = 0;
  let no_match = 0;

  for (const row of snap.tickers) {
    const det = detectArrow(row);
    if (!det) { no_match++; continue; }
    const arrow = await fireArrow(row.ticker, det, snap.cycle_id);
    if (arrow) fired.push(arrow);
    else deduped++;
  }

  return {
    cycle_id: snap.cycle_id,
    arrows_fired: fired,
    arrows_skipped_dedup: deduped,
    arrows_skipped_no_match: no_match,
  };
}
