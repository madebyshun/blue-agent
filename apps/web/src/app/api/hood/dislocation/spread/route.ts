/**
 * `GET /api/hood/dislocation/spread?ticker=<T>`
 *
 * Answers the question the per-chain endpoint structurally cannot: the SAME
 * stock trades on Base 8453 and on Robinhood Chain 4663 as two different tokens
 * in two different pools — by how much do the two venues disagree with each
 * other, right now?
 *
 * MEASURED 2026-09-28 across all 32 watched ticker×venue pairs in production:
 * for 3 of the 8 tickers listed on both chains, the gap BETWEEN THE TWO VENUES
 * was larger than either venue's gap against its own Chainlink feed (AMZN
 * 0.581%, META 0.531%, MSFT 0.384%). That number was the most interesting thing
 * in the whole sweep and no endpoint returned it — a caller had to make two
 * requests and do the subtraction, which means most callers never saw it.
 *
 * ── WHY THIS IS A SEPARATE ROUTE, NOT `?chain=both` ───────────────────────
 * `chain` on the per-ticker endpoint is REQUIRED, has no default, and is parsed
 * by `parseHoodChain`, which rejects anything it does not recognise. Teaching it
 * a third value would weaken the one guard standing between a typo and a wrong
 * chain (#206), and it would give one URL two incompatible response shapes. The
 * question here genuinely has no chain argument: it is about both, always. So
 * `chain` is REFUSED here rather than ignored — a caller who sends it has
 * misunderstood which endpoint they are on, and silently dropping the parameter
 * would let them believe they had filtered something.
 *
 * ── THE ONE DERIVED NUMBER IN BLUE HOOD, AND WHY IT IS ALLOWED ────────────
 * The sibling route's rule is "every number is read, never recomputed", because
 * a second definition of `drift_pct` would disagree with the board and with the
 * graded arrows on rounding alone. `spread_pct` is different: no upstream
 * definition of it exists anywhere, so there is nothing to disagree with. It is
 * computed HERE, in code, from two values that were each read verbatim — never
 * by an LLM, never from a re-quote. Every input to it (`dex_price_usd` on each
 * side) is still read, and `spread_basis` ships the formula in the response so a
 * caller never has to guess the sign convention.
 *
 * ── 🔴 THE HONESTY PROPERTY THIS ROUTE LIVES OR DIES BY: SAME CYCLE ───────
 * A spread is only a statement about two VENUES if both prices were measured at
 * the same instant. If the Base desk's snapshot is from 09:45 and the Robinhood
 * one from 09:52, then "the venues disagree by 0.6%" is indistinguishable from
 * "the stock moved 0.6% in seven minutes" — and the second is not a product, it
 * is a fabrication with a decimal point on it.
 *
 * So when the two desks' `started_at` differ, `spread_pct` is `null` and
 * `spread_unavailable_reason` is `"cycle_skew"`. It is NOT computed-with-a-
 * warning: a number that is present is a number that gets used, and a caller
 * sizing a trade will not read the caveat. `cycle_skew_seconds` is always
 * reported so the caller can see exactly how far apart they were.
 *
 * Today the two desks share one poll cycle and one `started_at` (the sibling
 * route's `STALE_AFTER_S` doc block records the same invariant), so this path is
 * expected never to fire. That is precisely why it is worth having: this
 * endpoint is also the canary that tells us the two desks have desynchronised,
 * and the failure would otherwise be invisible.
 *
 * ── THREE-STATE, AT VENUE GRANULARITY ────────────────────────────────────
 * 16 of the 24 Robinhood tickers are not listed on Base at all. A venue that
 * does not watch the ticker returns `{ watched: false }` and NOTHING ELSE — the
 * price keys are OMITTED, not `null` and certainly not `0`. "We do not watch it
 * there" is a third fact, distinct from "we looked and the feed was unreadable"
 * (`null`) and from "we measured it" (a number). `watched` carries that fact
 * structurally, so a guard can assert the omission.
 *
 * Read-only. Touches no funds, signs nothing, holds no key. `no-store`, for the
 * same reason as the sibling: a cached spread is a spread that is no longer true.
 */
import { NextResponse } from "next/server";
import { kvGetProbe } from "@/lib/kv";
import { KV_SNAPSHOT_LATEST, KV_BASE_ROWS_LATEST } from "@/lib/blue-hood/kv-keys";
import { matchesChain, partitionBaseRows } from "@/lib/blue-hood/types";
import type { BaseDeskLatest, HoodSnapshot, TickerSnapshot } from "@/lib/blue-hood/types";
import { HEALTHY_MAX_AGE_S } from "@/lib/blue-hood/health";
import { callerKeyHash, recordDislocationCall } from "@/lib/blue-hood/dislocation-usage";
import { publishDeskRows, RH_DESK_QUARANTINE } from "@/lib/blue-hood/quarantine";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" } as const;

/** Same constant, same reasoning, as the sibling route. Deliberately not a
 *  second number: the two endpoints must never disagree about staleness. */
const STALE_AFTER_S = HEALTHY_MAX_AGE_S;

/** Why `spread_pct` is null. `null` when it is not. */
type SpreadUnavailable =
  /** The two desks' snapshots are from different poll cycles. */
  | "cycle_skew"
  /** One or both desks could not be read at all. */
  | "desk_unreadable"
  /** The ticker is not watched on one of the two venues. */
  | "not_on_both_venues"
  /** Watched on both, but a venue had no DEX price to compare. */
  | "no_dex_price"
  /** A venue's DEX leg is quarantined (F6 — lib/blue-hood/quarantine.ts). */
  | "quarantined";

/**
 * Why a desk could not be read. Deliberately the SAME two codes the sibling
 * route publishes, so a caller integrating against both endpoints learns one
 * vocabulary — `kv_error` is "we asked and the store failed", `never_polled` is
 * "we asked and there has never been an answer". They are not interchangeable:
 * the first is our outage, the second is our coverage.
 */
type DeskError = "kv_error" | "never_polled";

/** What one desk returned. `rows: null` means the read itself failed. */
interface DeskRead {
  rows: readonly TickerSnapshot[] | null;
  snapshotAt: string | null;
  error: DeskError | null;
  /** The store's own message, kept separate so the CODE stays machine-readable. */
  errorDetail: string | null;
}

async function readBaseDesk(): Promise<DeskRead> {
  const probe = await kvGetProbe<BaseDeskLatest>(KV_BASE_ROWS_LATEST);
  if (probe.status === "error") {
    return { rows: null, snapshotAt: null, error: "kv_error", errorDetail: probe.message ?? null };
  }
  if (probe.status === "miss" || !probe.value?.rows?.length) {
    return { rows: null, snapshotAt: null, error: "never_polled", errorDetail: null };
  }
  // #162 — the Base marker is CHECKED, never inherited. A blob written by an
  // older deploy can hold rows with no `chain`, and `chainOf` would read that
  // absence as Robinhood, putting an RH row on the Base side of a spread.
  return {
    rows: partitionBaseRows(probe.value.rows).attributed,
    snapshotAt: probe.value.started_at,
    error: null,
    errorDetail: null,
  };
}

async function readRhDesk(): Promise<DeskRead> {
  const probe = await kvGetProbe<HoodSnapshot>(KV_SNAPSHOT_LATEST);
  if (probe.status === "error") {
    return { rows: null, snapshotAt: null, error: "kv_error", errorDetail: probe.message ?? null };
  }
  if (probe.status === "miss") {
    return { rows: null, snapshotAt: null, error: "never_polled", errorDetail: null };
  }
  // `matchesChain` applies the absent-row default, correct HERE on the row and
  // never on a query. Same split as the sibling route.
  // F6 — published through the quarantine, so a withheld RH DEX price can
  // never reach the subtraction below.
  return {
    rows: publishDeskRows(probe.value.tickers.filter((r) => matchesChain(r, "robinhood"))),
    snapshotAt: probe.value.started_at,
    error: null,
    errorDetail: null,
  };
}

/**
 * One venue's block.
 *
 * ⚠️ Returns `{ watched: false }` with every other key ABSENT when the desk does
 * not carry the ticker. Building the object by spread rather than by assigning
 * `null`s keeps the omission structural — `JSON.stringify` dropping an
 * `undefined` is an implementation detail a guard cannot assert against, and the
 * distinction it would erase is the whole point of this shape.
 */
function venueBlock(desk: DeskRead, ticker: string) {
  if (desk.rows === null) {
    return { watched: null, unreadable: true, reason: desk.error, reason_detail: desk.errorDetail };
  }
  const row = desk.rows.find((r) => r.ticker.toUpperCase() === ticker);
  if (!row) return { watched: false };
  return {
    watched: true,
    dex_price_usd: row.dex_usd,
    oracle_price_usd: row.oracle_usd,
    drift_pct: row.drift_pct,
    dex_tvl_usd: row.tvl_usd,
    dex_total_tvl_usd: row.total_tvl_usd,
    dex_volume_24h_usd: row.volume_24h_usd,
    market_open: row.market.is_open,
    session: row.market.session,
    snapshot_at: desk.snapshotAt,
    warnings: row.warnings,
    no_data_reason: row.no_data_reason,
    provenance: row.provenance ?? "measured",
    ...(row.provenance_note ? { provenance_note: row.provenance_note } : {}),
  };
}

/** The row behind a venue block, or null. Kept separate so the block builder
 *  stays a pure shape function and the arithmetic below reads one source. */
function rowOf(desk: DeskRead, ticker: string): TickerSnapshot | null {
  if (desk.rows === null) return null;
  return desk.rows.find((r) => r.ticker.toUpperCase() === ticker) ?? null;
}

export async function GET(req: Request): Promise<NextResponse> {
  const keyHash = callerKeyHash(req);
  const url = new URL(req.url);

  const tickerRaw = url.searchParams.get("ticker");
  if (!tickerRaw?.trim()) {
    void recordDislocationCall(keyHash, "both", "rejected");
    return NextResponse.json(
      {
        ok: false,
        error: "missing_ticker",
        message: "Query parameter `ticker` is required, e.g. ?ticker=AMZN",
      },
      { status: 400, headers: NO_STORE },
    );
  }
  const ticker = tickerRaw.trim().toUpperCase();

  // Refused, not ignored — see the header. A caller who sent `chain` believes
  // they narrowed something, and this endpoint cannot narrow.
  if (url.searchParams.get("chain") !== null) {
    void recordDislocationCall(keyHash, "both", "rejected");
    return NextResponse.json(
      {
        ok: false,
        error: "chain_not_accepted",
        message:
          "This endpoint compares Base 8453 against Robinhood Chain 4663 and takes no `chain` parameter. " +
          "For a single venue use /api/hood/dislocation?ticker=<T>&chain=<base|robinhood>.",
      },
      { status: 400, headers: NO_STORE },
    );
  }

  const [base, rh] = await Promise.all([readBaseDesk(), readRhDesk()]);

  // ── Freshness, and the same-cycle property. ──────────────────────────────
  const baseMs = base.snapshotAt ? new Date(base.snapshotAt).getTime() : NaN;
  const rhMs = rh.snapshotAt ? new Date(rh.snapshotAt).getTime() : NaN;
  const bothTimed = Number.isFinite(baseMs) && Number.isFinite(rhMs);
  const cycleSkewSeconds = bothTimed ? Math.round(Math.abs(baseMs - rhMs) / 1000) : null;
  /**
   * String IDENTITY, not a tolerance. The two desks are written by one poll
   * cycle and carry one `started_at` (measured 2026-09-28: both chains served
   * `2026-09-28T09:45:46.435Z`), so any difference at all means they came from
   * different cycles and the comparison is no longer venue-against-venue.
   *
   * Consequence worth stating because it reads like a bug: sub-second skew
   * yields `same_cycle: false` alongside `cycle_skew_seconds: 0`. That is not a
   * contradiction — the refusal is driven by the identity, and the rounded
   * second is only there to tell a human how far apart they were. A tolerance
   * here would be the bug: it would let a genuinely desynchronised pair through
   * whenever the desync was small, which is exactly when a price move and a
   * venue disagreement are least distinguishable.
   */
  const sameCycle = bothTimed ? base.snapshotAt === rh.snapshotAt : null;

  // Age is measured from the OLDER of the two desks: a spread is only as fresh
  // as its staler leg, and reporting the newer one would overstate it.
  const oldestMs = bothTimed ? Math.min(baseMs, rhMs) : (Number.isFinite(baseMs) ? baseMs : rhMs);
  const ageSeconds = Number.isFinite(oldestMs)
    ? Math.max(0, Math.round((Date.now() - oldestMs) / 1000))
    : null;

  /**
   * ⚠️ A DESK THAT COULD NOT BE READ IS STALE, even though nothing here is old.
   *
   * Written as a boolean alone, `stale` was `false` whenever ONE desk errored
   * and the other happened to be fresh: the failure was reported truthfully
   * further down (`spread_unavailable_reason`, `venues.x.unreadable`) but a
   * caller who branches on `stale` — the obvious thing to branch on — would
   * have read the response as healthy. The sibling route already answers a KV
   * failure with `stale: true, stale_reason: "kv_error"`, so this is the
   * established vocabulary rather than a new one, and the two endpoints must
   * not disagree about what `stale` means.
   *
   * Ordered most-specific-first: an outage outranks a coverage gap, which
   * outranks mere age, because that is the order in which a caller should stop
   * trusting the number.
   */
  const staleReason: "kv_error" | "never_polled" | "snapshot_too_old" | null =
    base.error === "kv_error" || rh.error === "kv_error"
      ? "kv_error"
      : base.error === "never_polled" || rh.error === "never_polled"
        ? "never_polled"
        : ageSeconds === null || ageSeconds > STALE_AFTER_S
          ? "snapshot_too_old"
          : null;
  const stale = staleReason !== null;

  const baseRow = rowOf(base, ticker);
  const rhRow = rowOf(rh, ticker);

  // ── The spread. Null unless every precondition holds. ────────────────────
  let spreadPct: number | null = null;
  let spreadAbsUsd: number | null = null;
  let reason: SpreadUnavailable | null = null;

  if (base.rows === null || rh.rows === null) {
    reason = "desk_unreadable";
  } else if (!baseRow || !rhRow) {
    reason = "not_on_both_venues";
  } else if (baseRow.provenance === "quarantined" || rhRow.provenance === "quarantined") {
    // Before the cycle and price checks: a quarantined leg is not "missing a
    // price", it is a price we decline to publish, and the reason must say so.
    reason = "quarantined";
  } else if (sameCycle !== true) {
    // See the header: computed-with-a-warning is not an option, because a
    // number that is present is a number that gets used.
    reason = "cycle_skew";
  } else if (
    typeof baseRow.dex_usd !== "number" ||
    typeof rhRow.dex_usd !== "number" ||
    rhRow.dex_usd === 0
  ) {
    reason = "no_dex_price";
  } else {
    spreadAbsUsd = baseRow.dex_usd - rhRow.dex_usd;
    spreadPct = (spreadAbsUsd / rhRow.dex_usd) * 100;
  }

  // The finding that motivated the endpoint: do the two venues disagree with
  // EACH OTHER more than either disagrees with its own oracle? `null` whenever
  // any of the three inputs is missing — never `false`, which would read as a
  // measured "no".
  const bd = baseRow?.drift_pct;
  const rd = rhRow?.drift_pct;
  const widerThanEitherDrift =
    spreadPct === null || typeof bd !== "number" || typeof rd !== "number"
      ? null
      : Math.abs(spreadPct) > Math.abs(bd) && Math.abs(spreadPct) > Math.abs(rd);

  // Market clock is one clock; both desks derive it from the same NYSE status.
  // If they ever disagree, say so rather than picking a winner.
  const bOpen = baseRow?.market.is_open;
  const rOpen = rhRow?.market.is_open;
  const marketAgrees = bOpen === undefined || rOpen === undefined || bOpen === rOpen;
  const marketOpen = !marketAgrees ? null : (bOpen ?? rOpen ?? null);
  const session = !marketAgrees ? null : (baseRow?.market.session ?? rhRow?.market.session ?? null);

  void recordDislocationCall(keyHash, "both", stale || spreadPct === null ? "stale" : "ok");

  return NextResponse.json(
    {
      ok: true,
      ticker,

      spread_pct: spreadPct,
      spread_abs_usd: spreadAbsUsd,
      // Shipped in the response so the sign convention is never inferred.
      spread_basis: "(base.dex_price_usd - robinhood.dex_price_usd) / robinhood.dex_price_usd * 100",
      spread_unavailable_reason: reason,
      ...(reason === "quarantined" ? { spread_unavailable_note: RH_DESK_QUARANTINE.note } : {}),
      spread_wider_than_either_oracle_drift: widerThanEitherDrift,

      same_cycle: sameCycle,
      cycle_skew_seconds: cycleSkewSeconds,
      stale,
      stale_reason: staleReason,
      stale_after_seconds: STALE_AFTER_S,
      // Named for what it is: the age of the STALER leg, not of one desk.
      oldest_snapshot_age_seconds: ageSeconds,

      market_open: marketOpen,
      session,
      ...(marketAgrees ? {} : { market_clock_disagreement: true }),

      venues: {
        base: venueBlock(base, ticker),
        robinhood: venueBlock(rh, ticker),
      },
    },
    { headers: NO_STORE },
  );
}
