/**
 * Robinhood Chain desk quarantine (F6 — rebuild plan §4 #2, 2026-09-30).
 *
 * WHAT WAS MEASURED (scripts/rh-f6-diagnose.ts, 2026-09-30, market open, 35 RH
 * tickers with a USD-anchored pool): the desk's "DEX price" is GeckoTerminal's
 * token-level `*_token_price_usd`, and that is NOT the anchored pool's own
 * rate — 34 of 35 differ from `pool rate × anchor at par` by more than 0.1%,
 * 16 by more than 1%. It sits closer to the Chainlink oracle than the pool
 * does (desk vs oracle > 2%: 1 ticker; pool vs oracle > 2%: 8). So the RH
 * "drift" compares GT's figure with Chainlink; it is not a measurement of the
 * DEX. The ×1.052 USDG hypothesis on file did NOT reproduce that day: GT
 * priced USDG within 0.8% of $1 on every pool.
 *
 * WHAT THE QUARANTINE DOES: every PUBLISHED read of the RH desk withholds the
 * numbers derived from that leg — `dex_usd`, `drift_pct`, and the verdict
 * computed from them — and says why, with `provenance: "quarantined"`. The
 * Chainlink price and the pool's liquidity / volume are real reads and stay.
 * The Base desk is untouched (its DEX leg is DexScreener's pair price).
 *
 * WHAT IT DOES NOT DO: stop the recorder. The poller keeps writing raw rows
 * (plan: "ghi tiếp; không bán"), so the archive can be re-derived once the
 * price source is fixed — that fix is a decision on the diagnosis, not part
 * of this module. Arrows are frozen (arrow-freeze.ts), so no RH arrow fires.
 *
 * Every reader of `KV_SNAPSHOT_LATEST` must either publish rows through
 * `publishDeskRow` or be a listed non-publishing reader — enforced by
 * scripts/rh-quarantine-check.ts.
 */
import type { M5Verdict, TickerSnapshot } from "./types";

export const RH_DESK_QUARANTINE = {
  active: true,
  diagnosed: "2026-09-30",
  code: "rh_dex_leg_not_pool_price",
  note:
    "Robinhood Chain desk: the DEX price here is GeckoTerminal's token-level USD figure, not the pool's own rate " +
    "(measured 2026-09-30: 16 of 35 tickers more than 1% apart), so drift and cross-venue spread are withheld until " +
    "the price source is fixed. The Chainlink oracle price and pool liquidity are unaffected.",
} as const;

export type Provenance = "measured" | "quarantined";

/** Set only by `withQuarantineLiftedForTest` — never by production code
 *  (scripts/rh-quarantine-check.ts fails if anything under src/ calls it). */
let liftedForTest = false;

/**
 * TEST-ONLY. Runs `fn` with the quarantine lifted, so the guards that pin the
 * drift and spread arithmetic keep exercising the code that serves the day F6
 * is fixed. A module variable, not an env var: an env override is exactly the
 * kind of switch that lifts a quarantine in production without touching a file
 * any guard reads.
 */
export async function withQuarantineLiftedForTest<T>(fn: () => Promise<T>): Promise<T> {
  liftedForTest = true;
  try { return await fn(); } finally { liftedForTest = false; }
}

/** RH row? Absent `chain` is Robinhood — the snapshot's own default. */
export function isQuarantinedRow(row: Pick<TickerSnapshot, "chain">): boolean {
  return RH_DESK_QUARANTINE.active && !liftedForTest && (row.chain === undefined || row.chain === "robinhood");
}

/** A row as it may be PUBLISHED. Quarantined rows keep every read fact and
 *  lose the numbers derived from the unverified DEX leg. */
export function publishDeskRow<T extends TickerSnapshot>(row: T): T & { provenance: Provenance; provenance_note?: string } {
  if (!isQuarantinedRow(row)) return { ...row, provenance: "measured" };
  // An errored row stays errored — that is a different, true statement.
  const verdict: M5Verdict | "ERROR" = row.verdict === "ERROR" ? "ERROR" : "INSUFFICIENT_DATA";
  return {
    ...row,
    dex_usd: null,
    drift_pct: null,
    verdict,
    provenance: "quarantined",
    provenance_note: RH_DESK_QUARANTINE.note,
  };
}

export function publishDeskRows<T extends TickerSnapshot>(rows: readonly T[]): (T & { provenance: Provenance; provenance_note?: string })[] {
  return rows.map((r) => publishDeskRow(r));
}
