/**
 * Robinhood Chain desk quarantine (F6 — rebuild plan §4 #2, 2026-09-30;
 * price source FIXED 2026-10-01 — see "AFTER THE FIX" below).
 *
 * WHAT WAS MEASURED (scripts/rh-f6-diagnose.ts, 2026-09-30, market open, 35 RH
 * tickers with a USD-anchored pool): the desk's "DEX price" was GeckoTerminal's
 * token-level `*_token_price_usd`, and that is NOT the anchored pool's own
 * rate — 34 of 35 differed from `pool rate × anchor at par` by more than 0.1%,
 * 16 by more than 1%. It sat closer to the Chainlink oracle than the pool
 * did (desk vs oracle > 2%: 1 ticker; pool vs oracle > 2%: 8). So the RH
 * "drift" compared GT's figure with Chainlink; it was not a measurement of the
 * DEX. The ×1.052 USDG hypothesis on file did NOT reproduce that day: GT
 * priced USDG within 0.8% of $1 on every pool.
 *
 * AFTER THE FIX (2026-10-01): the reader prices the selected pool from its OWN
 * exchange rate × the anchor's dollar value — USDG at par, WETH at RH's
 * Chainlink ETH/USD, null (never GT's figure) if that read fails
 * (lib/robinhood/rwa-price.ts, pool-rate block; `PoolMeta.price_usd` in
 * rwa-market.ts). Pool selection and the anchor rule did not change. Every M5
 * reading now says how it priced the leg (`dex_price_basis: "pool_rate"`), the
 * poller copies that onto each RH row as `dex_source`, and the archive keeps
 * it. So the quarantine is no longer "the RH desk" — it is "RH rows WITHOUT
 * the stamp":
 *   • rows recorded before the fix (every RH row in `bh:series:day:*` up to
 *     the deploy, and a latest snapshot written by the old code) stay withheld
 *     on every door — the archive is NOT re-derived or rewritten;
 *   • rows measured the new way are published as `provenance: "measured"`;
 *   • a reading that stops carrying the stamp — a regression to the old figure
 *     — is withheld again automatically. The stamp is read off the reading,
 *     never asserted by the reader that publishes it.
 *
 * WHAT A WITHHOLDING DOES: the numbers derived from the old DEX leg — `dex_usd`,
 * `drift_pct`, and the verdict computed from them — are nulled and the reason
 * attached, with `provenance: "quarantined"`. The Chainlink price and the
 * pool's liquidity / volume are real reads and stay. The Base desk is untouched
 * (its DEX leg is DexScreener's pair price, and no Base row is ever withheld).
 *
 * WHAT IT DOES NOT DO: stop the recorder. The poller writes raw rows, stamped
 * or not. Arrows stay frozen (arrow-freeze.ts) — the fix does not unfreeze
 * them, and `DRIFT_MIN_ABS_PCT` is unchanged.
 *
 * THE DOORS that carry that leg, and what closes each for an unstamped reading:
 *   • the latest snapshot (`KV_SNAPSHOT_LATEST`) — `publishDeskRow(s)`;
 *   • the permanent RH archive (`bh:series:day:*`, via `readSeriesDays`) —
 *     `publishRhArchivePoints`, per row, and `rhArchiveProvenance` for the
 *     window. The recorder keeps writing raw points; the routes that SERVE the
 *     archive withhold the DEX leg of the rows recorded before the fix;
 *   • x402 handlers that read the leg LIVE — `resolvePrimaryPool` next to
 *     `chainlinkLatest` — and so never appear among the snapshot's readers:
 *       – M5 `rh-stock-arb`: HANDLERS publishes through `publishArbResult`;
 *         the raw reading is `measureRhStockArb`, reachable only through
 *         `callRecorderTool` (tool-caller.ts) by the poller and the grader;
 *       – A4 `rh-stock-agent-brief` and A3 `rh-stock-report`: their `facts`
 *         go through `publishRhFacts` BEFORE the verdict and BEFORE the prompt,
 *         so neither the hard-mapped direction nor the model's prose can be
 *         built on a withheld number;
 *       – M5 and A4 were HALTED at the route (lib/tool-halts.ts) while every
 *         reading they made was the old figure. Lifted with the fix: they read
 *         live through the fixed selector, so each reading carries the stamp.
 *
 * The execution tools (`rh-stock-swap-quote`, `rh-stock-swap-prepare`,
 * `rh-sector-basket`) size and quote trades from the same `PoolMeta.price_usd`,
 * so they moved to the pool rate with the fix — the two swap tools'
 * `pool_oracle_delta_pct` is now the pool's own gap to Chainlink.
 *
 * Every reader of each door either publishes through its function, is halted,
 * or is a reader whose property is asserted — enforced by
 * scripts/rh-quarantine-check.ts, which enumerates readers by what they call,
 * not by a list of files known today (§1, §5, §6), and pins that a stamped row
 * publishes while an unstamped one stays withheld.
 */
import type { M5Verdict, SeriesPoint, TickerSnapshot } from "./types";

export const RH_DESK_QUARANTINE = {
  active: true,
  diagnosed: "2026-09-30",
  /** The day the price source was fixed. Rows recorded before it carry no
   *  `dex_source` stamp and stay withheld; rows after it publish. */
  fixed: "2026-10-01",
  code: "rh_dex_leg_not_pool_price",
  note:
    "Robinhood Chain readings recorded before 2026-10-01 took the DEX price from GeckoTerminal's token-level USD figure, " +
    "not the pool's own rate (measured 2026-09-30: 16 of 35 tickers more than 1% apart), so their DEX price, drift and " +
    "verdict are withheld. Readings since then are priced from the pool's own rate and are published. " +
    "The Chainlink oracle price and pool liquidity are unaffected.",
} as const;

/** The stamp a reading measured the fixed way carries (`RH_DEX_PRICE_BASIS`
 *  in lib/robinhood/rwa-price.ts). Restated as a literal so this module stays
 *  free of the price layer's imports; rh-quarantine-check pins the two equal. */
const POOL_RATE = "pool_rate";

export type Provenance = "measured" | "quarantined";

/** Set only by `withQuarantineLiftedForTest` — never by production code
 *  (scripts/rh-quarantine-check.ts fails if anything under src/ calls it). */
let liftedForTest = false;

/**
 * TEST-ONLY. Runs `fn` with the quarantine lifted, so the guards that pin the
 * drift and spread arithmetic can exercise the publishing path on fixtures
 * that predate the stamp. A module variable, not an env var: an env override
 * is exactly the kind of switch that lifts a quarantine in production without
 * touching a file any guard reads.
 */
export async function withQuarantineLiftedForTest<T>(fn: () => Promise<T>): Promise<T> {
  liftedForTest = true;
  try { return await fn(); } finally { liftedForTest = false; }
}

/** Is a reading with this DEX price basis held back? Only an unstamped one. */
function basisQuarantined(basis: unknown): boolean {
  return RH_DESK_QUARANTINE.active && !liftedForTest && basis !== POOL_RATE;
}

/** An RH row recorded WITHOUT the pool-rate stamp, i.e. before the F6 fix.
 *  Absent `chain` is Robinhood — the snapshot's own default. Base rows never. */
export function isQuarantinedRow(row: Pick<TickerSnapshot, "chain" | "dex_source">): boolean {
  return (row.chain === undefined || row.chain === "robinhood") && basisQuarantined(row.dex_source);
}

/** A row as it may be PUBLISHED. Quarantined rows keep every read fact and
 *  lose the numbers derived from the old DEX leg. */
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

/**
 * The publishing state of a set of PUBLISHED RH desk rows, for a response that
 * describes the desk as a whole (the board banner, `rh_desk` on the snapshot).
 * "quarantined" while any of them is withheld — i.e. until the first cycle
 * recorded after the fix replaces the latest snapshot — then "measured".
 */
export function rhDeskStateOf(rows: readonly { provenance?: Provenance }[]): { provenance: Provenance; provenance_note?: string } {
  return rows.some((r) => r.provenance === "quarantined")
    ? { provenance: "quarantined", provenance_note: RH_DESK_QUARANTINE.note }
    : { provenance: "measured" };
}

/**
 * The publishing state of a WINDOW of the RH archive, for a response that
 * carries hours of it rather than rows that can each say it (the archive
 * routes). Pass the points as read; `ticker` narrows it to one ticker's rows.
 * "quarantined" ⟹ at least one row in the window was recorded before the fix
 * and has its DEX leg withheld by `publishRhArchivePoints`; the rows recorded
 * after it are served as measured alongside. A window wholly after the fix is
 * "measured".
 */
export function rhArchiveProvenance(points: readonly SeriesPoint[], ticker?: string): { provenance: Provenance; provenance_note?: string } {
  const t = ticker?.toUpperCase();
  const withheld = points.some((p) =>
    p.rows.some((r) => (t === undefined || r.ticker.toUpperCase() === t) && basisQuarantined(r.dex_source)),
  );
  return withheld
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
 * Per row since the fix: a row stamped `dex_source: "pool_rate"` is served as
 * recorded; a row without the stamp (everything recorded before 2026-10-01)
 * has its DEX leg withheld. The archive itself is untouched; this is a
 * read-side projection. The oracle price and total liquidity are real reads
 * and stay. A row keeps its place in the hour even when the DEX price was its
 * only price: the hour WAS observed, and dropping the row would turn
 * "withheld" into "not priced", a different claim.
 *
 * Only for the RH archive. The Base archive (`bh:base:series:day:*`) has its own
 * reader and a DEX leg that was never under repair.
 */
export function publishRhArchivePoints(points: readonly SeriesPoint[]): SeriesPoint[] {
  return points.map((p) => ({
    ...p,
    rows: p.rows.map((r) => (basisQuarantined(r.dex_source) ? { ...r, dex_usd: null, drift_pct: null } : r)),
  }));
}

/** Fields of the M5 `dex` object that are the DEX price of the stock, or a
 *  change reported against it — withheld when the reading predates the fix.
 *  Pool identity, depth and volume are real reads and are not here. */
const ARB_DEX_WITHHELD = ["price_usd", "change_1h", "change_24h", "change_24h_pct"] as const;

/**
 * An `rh-stock-arb` (M5) response body as it may be PUBLISHED — by
 * `HANDLERS["rh-stock-arb"]`, and therefore by anything that dispatches
 * through HANDLERS, the paid x402 route included.
 *
 * A reading that carries `dex_price_basis: "pool_rate"` was measured from the
 * pool's own rate and is published as measured. One that does not — the old
 * figure, or a regression to it — has the DEX price, the delta computed from it
 * (`abs_usd`, `pct`) and the verdict hard-mapped from that delta withheld,
 * exactly as `publishDeskRow` does for a snapshot row. The Chainlink block, the
 * pool reference, its liquidity and volume, the market clock and the warnings
 * stay. A body with no reading in it (400 / 404 / 500 `error`) passes through
 * unchanged — there is nothing to withhold and nothing to mark.
 *
 * RH-only by construction: M5 reads Robinhood Chain and nothing else.
 */
export function publishArbResult<T extends Record<string, unknown>>(
  body: T,
): T | (T & { provenance: Provenance; provenance_note?: string }) {
  if (typeof body.error === "string" || !("verdict" in body)) return body;
  if (!basisQuarantined(body.dex_price_basis)) return { ...body, provenance: "measured" };

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
 *  that are the DEX price of the stock, or a change reported against it. The
 *  Chainlink fields, pool identity, depth and volume are real reads and are
 *  not here. */
const FACTS_DEX_WITHHELD = ["dex_price_usd", "dex_change_24h_pct", "dex_change_1h_pct"] as const;

/**
 * An RH `facts` block as it may be USED — by the handler itself, before it
 * hard-maps a verdict from the block or hands it to a model as "verified
 * numbers, do not contradict them". Withholding on the way out would be too
 * late for both: the verdict word and the prose are already built on the
 * number by then. So the projection runs first and everything downstream sees
 * only what may be published.
 *
 * `basis` is the DEX price basis of the reading the facts were built from
 * (`resolvePrimaryPool(...).price_basis`). "pool_rate" ⟹ measured the fixed way
 * and used as is; anything else ⟹ withheld, as before the fix.
 *
 * `withheld` is true only when there WAS a DEX figure to withhold. A token with
 * no dollar-anchored pool had no figure to begin with, and saying it was
 * "withheld" would replace a true reason (no pool) with a different one.
 *
 * RH-only by construction: A3 and A4 read Robinhood Chain and nothing else.
 */
export function publishRhFacts<T extends { dex_price_usd: number | null }>(facts: T, basis: unknown): {
  facts: T;
  withheld: boolean;
  provenance: Provenance;
  provenance_note?: string;
} {
  if (!basisQuarantined(basis)) return { facts, withheld: false, provenance: "measured" };
  const f: Record<string, unknown> = { ...facts };
  for (const k of FACTS_DEX_WITHHELD) if (k in f) f[k] = null;
  return {
    facts: f as T,
    withheld: facts.dex_price_usd !== null,
    provenance: "quarantined",
    provenance_note: RH_DESK_QUARANTINE.note,
  };
}
