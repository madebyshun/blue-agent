// The decision half of `stock-screen`, kept pure and OUT of the handler on
// purpose: `readBaseStockQuote` pulls `viem` and the whole chain stack, so any
// scoring rule living beside it can only be exercised by a live read. Here it
// takes plain quote objects and returns a verdict per row, which means a test
// can drive every branch — including the ones that only fire when a price is
// missing, and those are the ones that matter most.
//
// A filter the caller did not supply is null, not a default. A screen that
// silently applies a ceiling nobody asked for returns a shorter list that reads
// like a finding.
import type { BaseStockQuote } from "@/lib/base-stocks/b20-quote";

export type ScreenFilters = {
  /** null ⟹ no drift ceiling. */
  max_abs_drift_pct: number | null;
  /** 0 ⟹ no liquidity floor. */
  min_liquidity_usd: number;
  /** null ⟹ no staleness ceiling. */
  max_oracle_age_seconds: number | null;
  /** Blue Hood's own arrow gate. Off unless asked for: it is our judgement. */
  require_can_fire: boolean;
};

export type ScreenRow = {
  ticker: string;
  passed: boolean;
  /** Why it was rejected, in the filter's own vocabulary. Empty when passed. */
  failed_on: string[];
};

/** Every filter runs. We report ALL reasons a row failed, not the first one:
 *  a caller tuning a threshold needs to know the others are still failing. */
export function gradeQuote(q: BaseStockQuote, f: ScreenFilters): ScreenRow {
  const failed: string[] = [];

  if (f.max_abs_drift_pct !== null) {
    // A missing drift cannot clear a drift filter. Treating it as 0 would
    // invent the exact number the filter exists to bound.
    if (q.drift_pct === null) failed.push("drift_unreadable");
    else if (Math.abs(q.drift_pct) > f.max_abs_drift_pct) failed.push("drift_over_max");
  }

  if (f.min_liquidity_usd > 0) {
    if (q.dex_liquidity_usd === null) failed.push("liquidity_unreadable");
    else if (q.dex_liquidity_usd < f.min_liquidity_usd) failed.push("liquidity_under_min");
  }

  if (f.max_oracle_age_seconds !== null) {
    if (q.feed_age_seconds === null) failed.push("oracle_age_unreadable");
    else if (q.feed_age_seconds > f.max_oracle_age_seconds) failed.push("oracle_stale");
  }

  if (f.require_can_fire && !q.can_fire) {
    failed.push(`can_fire_false:${q.suppressed_reason ?? "unknown"}`);
  }

  return { ticker: q.ticker, passed: failed.length === 0, failed_on: failed };
}

/** Widest |drift| first. A null drift sorts last rather than as zero, so a row
 *  we could not measure never outranks one we measured and found tight. */
export function byDriftDesc(a: BaseStockQuote, b: BaseStockQuote): number {
  const k = (d: number | null) => (d === null ? -1 : Math.abs(d));
  return k(b.drift_pct) - k(a.drift_pct);
}

export function splitQuotes(
  quotes: BaseStockQuote[],
  f: ScreenFilters,
  limit: number,
): { rows: BaseStockQuote[]; rejected: ScreenRow[] } {
  const graded = quotes.map((q) => ({ q, v: gradeQuote(q, f) }));
  const rows = graded
    .filter((g) => g.v.passed)
    .map((g) => g.q)
    .sort(byDriftDesc)
    .slice(0, limit);
  const rejected = graded.filter((g) => !g.v.passed).map((g) => g.v);
  return { rows, rejected };
}
