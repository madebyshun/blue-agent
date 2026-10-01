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
 * THE DOORS that carry that leg, and what closes each:
 *   • the latest snapshot (`KV_SNAPSHOT_LATEST`) — `publishDeskRow(s)`;
 *   • the permanent RH archive (`bh:series:day:*`, via `readSeriesDays`) —
 *     `publishRhArchivePoints`. The recorder keeps writing raw points; the
 *     routes that SERVE the archive withhold the DEX leg from them;
 *   • x402 handlers that read the leg LIVE — `resolvePrimaryPool` next to
 *     `chainlinkLatest` — and so never appear among the snapshot's readers:
 *       – M5 `rh-stock-arb`: HANDLERS publishes through `publishArbResult`;
 *         the raw reading is `measureRhStockArb`, reachable only through
 *         `callRecorderTool` (tool-caller.ts) by the poller and the grader;
 *       – A4 `rh-stock-agent-brief` and A3 `rh-stock-report`: their `facts`
 *         go through `publishRhFacts` BEFORE the verdict and BEFORE the prompt,
 *         so neither the hard-mapped direction nor the model's prose can be
 *         built on the withheld number;
 *       – M5 and A4 are also HALTED at the route (lib/tool-halts.ts): their
 *         product IS the direction, so a 200 without it charged full price for
 *         nothing. A3's product is the brief, which stands without the leg.
 *
 * NOT CLOSED, and said so rather than implied: the execution tools
 * (`rh-stock-swap-quote`, `rh-stock-swap-prepare`, `rh-sector-basket`) size and
 * quote trades from the same GeckoTerminal figure, and the two swap tools print
 * its gap to Chainlink as a slippage cross-check. They sell no direction, and
 * withholding the figure would remove the quote rather than a claim — so they
 * stay as they are until the price-source fix decides what a quote is built
 * on. That is part of the decision on the diagnosis, not of this module.
 *
 * Every reader of each door either publishes through its function, is halted,
 * or is a reader whose property is asserted — enforced by
 * scripts/rh-quarantine-check.ts, which enumerates readers by what they call,
 * not by a list of files known today (§1, §5, §6).
 */
import type { M5Verdict, SeriesPoint, TickerSnapshot } from "./types";

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

/** The RH desk's publishing state, for a response that carries a whole window
 *  of the desk rather than rows that can each say it (the archive routes). */
export function rhDeskProvenance(): { provenance: Provenance; provenance_note?: string } {
  return isQuarantinedRow({ chain: "robinhood" })
    ? { provenance: "quarantined", provenance_note: RH_DESK_QUARANTINE.note }
    : { provenance: "measured" };
}

/**
 * Points of the PERMANENT RH archive (`bh:series:day:*`) as they may be
 * PUBLISHED. The archive holds the same DEX leg as the snapshot — `mergeSeriesPoint`
 * copies `dex_usd` / `drift_pct` straight off each cycle's rows — so serving it
 * raw undid the quarantine one route over: `/api/hood/ticker-series` drew the
 * withheld drift under a board row that said it was withheld.
 *
 * The archive itself is untouched; this is a read-side projection. The oracle
 * price and total liquidity are real reads and stay. A row keeps its place in
 * the hour even when the DEX price was its only price: the hour WAS observed,
 * and dropping the row would turn "withheld" into "not priced", a different claim.
 *
 * Only for the RH archive. The Base archive (`bh:base:series:day:*`) has its own
 * reader and a DEX leg that is not under repair.
 */
export function publishRhArchivePoints(points: readonly SeriesPoint[]): SeriesPoint[] {
  if (!isQuarantinedRow({ chain: "robinhood" })) return [...points];
  return points.map((p) => ({
    ...p,
    rows: p.rows.map((r) => ({ ...r, dex_usd: null, drift_pct: null })),
  }));
}

/** Fields of the M5 `dex` object that are GeckoTerminal's token-level USD price
 *  of the stock, or a change computed on it — the leg F6 found is not the pool's
 *  own rate. Pool identity, depth and volume are real reads and are not here. */
const ARB_DEX_WITHHELD = ["price_usd", "change_1h", "change_24h", "change_24h_pct"] as const;

/**
 * An `rh-stock-arb` (M5) response body as it may be PUBLISHED — by
 * `HANDLERS["rh-stock-arb"]`, and therefore by anything that dispatches
 * through HANDLERS. The paid x402 route (and with it a chat credit call and
 * `blue_call`) is HALTED for this id in lib/tool-halts.ts, so this is the
 * defence in depth behind the halt, not the thing that stops the sale.
 *
 * Withholds the DEX price, the delta computed from it (`abs_usd`, `pct`) and the
 * verdict hard-mapped from that delta, exactly as `publishDeskRow` does for the
 * snapshot row the poller builds out of this same response. The Chainlink block,
 * the pool reference, its liquidity and volume, the market clock and the
 * warnings stay. A body with no reading in it (400 / 404 / 500 `error`) passes
 * through unchanged — there is nothing to withhold and nothing to mark.
 *
 * RH-only by construction: M5 reads Robinhood Chain and nothing else.
 */
export function publishArbResult<T extends Record<string, unknown>>(
  body: T,
): T | (T & { provenance: Provenance; provenance_note?: string }) {
  if (typeof body.error === "string" || !("verdict" in body)) return body;
  if (!isQuarantinedRow({ chain: "robinhood" })) return { ...body, provenance: "measured" };

  const dex = body.dex;
  let publishedDex: unknown = dex;
  if (dex && typeof dex === "object") {
    const d: Record<string, unknown> = { ...(dex as Record<string, unknown>) };
    for (const k of ARB_DEX_WITHHELD) if (k in d) d[k] = null;
    publishedDex = d;
  }
  const delta = body.delta;
  const publishedDelta =
    delta && typeof delta === "object"
      ? { ...(delta as Record<string, unknown>), abs_usd: null, pct: null }
      : delta;

  return {
    ...body,
    // An errored read is not published as a verdict at all (see above), so
    // every reading that reaches here had its verdict derived from the DEX leg.
    verdict: "INSUFFICIENT_DATA" satisfies M5Verdict,
    dex: publishedDex,
    delta: publishedDelta,
    provenance: "quarantined",
    provenance_note: RH_DESK_QUARANTINE.note,
  };
}

/** Keys of an RH `facts` block (A3 `rh-stock-report`, A4 `rh-stock-agent-brief`)
 *  that are GeckoTerminal's token-level USD price of the stock, or a change
 *  computed on it — the leg F6 found is not the pool's own rate. The Chainlink
 *  fields, pool identity, depth and volume are real reads and are not here. */
const FACTS_DEX_WITHHELD = ["dex_price_usd", "dex_change_24h_pct", "dex_change_1h_pct"] as const;

/**
 * An RH `facts` block as it may be USED — by the handler itself, before it
 * hard-maps a verdict from the block or hands it to a model as "verified
 * numbers, do not contradict them". Withholding on the way out would be too
 * late for both: the verdict word and the prose are already built on the
 * number by then. So the projection runs first and everything downstream sees
 * only what may be published.
 *
 * `withheld` is true only when there WAS a DEX figure to withhold. A token with
 * no dollar-anchored pool had no figure to begin with, and saying it was
 * "withheld" would replace a true reason (no pool) with a different one.
 *
 * RH-only by construction: A3 and A4 read Robinhood Chain and nothing else.
 */
export function publishRhFacts<T extends { dex_price_usd: number | null }>(facts: T): {
  facts: T;
  withheld: boolean;
  provenance: Provenance;
  provenance_note?: string;
} {
  if (!isQuarantinedRow({ chain: "robinhood" })) return { facts, withheld: false, provenance: "measured" };
  const f: Record<string, unknown> = { ...facts };
  for (const k of FACTS_DEX_WITHHELD) if (k in f) f[k] = null;
  return {
    facts: f as T,
    withheld: facts.dex_price_usd !== null,
    provenance: "quarantined",
    provenance_note: RH_DESK_QUARANTINE.note,
  };
}
