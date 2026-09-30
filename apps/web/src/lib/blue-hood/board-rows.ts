/**
 * Blue Hood — which bucket a drift-board row belongs in.
 *
 * WHY THIS IS ITS OWN MODULE
 * --------------------------
 * The board (`HoodClient.tsx`) and its sidebar (`HoodSidebar.tsx`) each carried
 * a private copy of `isDust` / `isNoData`, and both are `"use client"` trees no
 * script can import — the same reason `oracle-age.ts` and `detail-support.ts`
 * exist. Two untestable copies is how the F6 quarantine regressed the board
 * without any guard noticing:
 *
 *   `publishDeskRow` (quarantine.ts) publishes every Robinhood row with
 *   `dex_usd: null` and verdict `INSUFFICIENT_DATA`, and leaves
 *   `no_data_reason` at null because the poller DID read a pool. Both copies of
 *   `isNoData` read `dex_usd === null` as "no data", so every RH ticker — NVDA,
 *   TSLA, all of them, with real multi-million-dollar pools — sat under
 *   "No data", badged NO POOL with the tooltip "no valid pool for this token
 *   yet", TVL and volume printed as "—", and the row could not expand, so the
 *   G0 Swap and the detail panel never rendered for any RH token. The amber
 *   banner above said liquidity was unaffected; every row below it said there
 *   was no pool.
 *
 * A withheld reading is not a missing one. The quarantine withholds the DEX
 * price and everything derived from it; the pool, its liquidity and its volume
 * were read and stay. So a quarantined row is bucketed by that REAL liquidity
 * (tradable or dust), and the renderer marks its DEX / drift / verdict cells as
 * withheld instead of pretending the pool is absent.
 *
 * Pinned by scripts/rh-quarantine-check.ts, which runs this against the rows
 * `/api/hood/snapshot` actually publishes.
 */
import type { TickerSnapshot } from "./types";

// T2 — dust floor matches the engine's arrow gate. Anything under this is
// treated as untradable at the row level (verdict badged as DUST, drift
// faded, sorted last, hidden from default filter).
//
// Reads TOTAL token liquidity (sum across every pool), matching the
// rule-engine dust gate. Old check on `tvl_usd` (primary pool only)
// would badge NVDA as DUST because its USDG-quoted pool is thin — even
// though the bankr-robinhood WETH pool holds $21M. That was blinding
// the board to the deepest tokens on chain. Fallback to `tvl_usd` for
// rows served from mid-deploy cycles that predate `total_tvl_usd`.
export const DUST_TVL_USD = 5_000;

export function rowTotalTvl(r: TickerSnapshot): number {
  return r.total_tvl_usd ?? r.tvl_usd ?? 0;
}

/**
 * The row had a DEX reading and the quarantine withheld it (F6).
 *
 * Every published RH row carries `provenance: "quarantined"`, including the
 * ones that genuinely have no data, so provenance alone is not enough:
 *   • `ERROR` stays an error — `publishDeskRow` keeps it, "a different, true
 *     statement" — and renders FETCH FAILED.
 *   • a non-null `no_data_reason` means the POLLER found no pool / failed the
 *     fetch before any quarantine touched the row. That is a real absence.
 * Only what is left had a reading that was withheld.
 */
export function isWithheld(r: TickerSnapshot): boolean {
  return r.provenance === "quarantined" && r.verdict !== "ERROR" && r.no_data_reason === null;
}

export type BoardRowState = "tradable" | "dust" | "no_data";

/**
 * One classification for the board and the sidebar, so the two can no longer
 * disagree about the same row.
 *
 * A withheld row is judged on its liquidity like any other; it never falls
 * into `no_data` just because the price the quarantine removed is null.
 */
export function boardRowState(r: TickerSnapshot): BoardRowState {
  if (r.verdict === "ERROR") return "no_data";
  const withheld = isWithheld(r);
  if (!withheld && (r.verdict === "INSUFFICIENT_DATA" || r.dex_usd === null)) return "no_data";
  return rowTotalTvl(r) < DUST_TVL_USD ? "dust" : "tradable";
}
