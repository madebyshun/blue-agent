/**
 * `GET /api/hood/dislocation?ticker=<T>&chain=<base|robinhood>`
 *
 * Answers ONE question for a scheduled buyer: is this ticker dislocated right
 * now, and by how much? Read-only. Touches no funds, signs nothing, holds no
 * key. It is the first thing Blue Hood can sell.
 *
 * ── EVERY NUMBER IS READ, NEVER RECOMPUTED ────────────────────────────────
 * Every field below is copied out of the CURRENT desk snapshot. This route does
 * not price anything, does not call an RPC, does not reach GeckoTerminal, and
 * does not re-derive drift from oracle/dex. `drift_pct` has exactly one
 * definition and it lives upstream in the poller — a second one here would
 * disagree with the board and with the graded arrows on rounding alone, and a
 * buyer comparing the two would have no way to tell which was wrong.
 *
 * ── THE THREE-STATE RULE IS THE POINT OF THIS ROUTE ───────────────────────
 * A field that was MEASURED returns a number.
 * A field that was LOOKED FOR AND ABSENT returns `null`.
 * A field that is NEVER MEASURED ON THIS CHAIN is OMITTED entirely.
 *
 * Those are three different facts and collapsing any two is the most recurrent
 * bug family in this repo (#150, #161, #162, #206, #340, #342). Here it would
 * do more than mislead a dashboard: a buyer reading `drift_pct: 0` when the
 * truth is "we could not read KV" will execute into the exact dislocation this
 * endpoint exists to warn about. So a failed read NEVER produces a zero — it
 * produces `null` plus `stale: true` plus the reason.
 *
 * `oracle_age_seconds` is the live instance of the third state. `TickerSnapshot
 * .oracle_updated_at` is `undefined` on Robinhood ("that desk never had the
 * value to record") and `number | null` on Base ("Base read it and the feed was
 * unreadable"). That maps 1:1 onto measured / absent / never-measured, so this
 * route omits the key on RH rather than sending `null`, and the omission is
 * built by a conditional spread rather than left to `JSON.stringify` dropping
 * an `undefined` — so it is structural and a guard can assert it.
 *
 * ── `chain` IS REQUIRED. THERE IS NO DEFAULT ──────────────────────────────
 * A missing `chain` is 400, never a guess. `chainOf()` reads an absent chain as
 * Robinhood, which is CORRECT for a stored row (every row predating the Base
 * desk really is RH) and catastrophic for a QUERY — that is #206, where a bare
 * ticker scan resolved "drift on NVDA on Base" to a graded Robinhood arrow and
 * rendered it as the live Base answer. NVDA/META/GOOGL/AAPL exist on BOTH
 * chains as different tokens in different pools, so a ticker string alone does
 * not identify anything. Parsing goes through `parseHoodChain`, which returns
 * `undefined` for anything unrecognised — including a plausible-looking "Base",
 * "8453" or "ethereum" — so a typo can never become a chain choice. This is the
 * endpoint a stranger integrates against; it is the worst possible place to
 * guess.
 *
 * ── `threshold_pct` IS PER-SESSION, NOT PER-CHAIN ─────────────────────────
 * ⚠️ There is no per-chain threshold in the rule engine and never has been.
 * `detectCandidate()` gates on TWO numbers, both chain-independent:
 * `DRIFT_MIN_ABS_PCT` (2.0) while the market is CLOSED, `ARB_MIN_ABS_PCT` (1.0)
 * while it is OPEN. `api/hood/base-series/route.ts` already states this
 * verbatim ("the threshold is two numbers, not one") and picks between them the
 * same way at its line 84. So `threshold_pct` here is the threshold IN FORCE
 * for that row's market session, imported from `lib/blue-hood/types` — the one
 * definition the engine itself imports — and never a literal typed into this
 * file. `threshold_basis` names which of the two is in force so the caller
 * never has to infer it from `market_open`.
 *
 * ── NOT CACHED, DELIBERATELY ──────────────────────────────────────────────
 * `no-store`. `/api/hood/snapshot` is CDN-cached for 30s on its success path
 * and that is right for a board a human is watching. This answers "should I
 * trade in the next few seconds", and a cached dislocation is the precise
 * failure mode the staleness fields exist to prevent — it would pin one
 * caller's 30-second-old answer across every other caller.
 *
 * Scope, fixed: no auth beyond the counting key, no payment, not surfaced in
 * the UI. Metering is per-key from day one because without call counts we
 * cannot price this later and cannot tell a pilot customer what they used.
 */
import { NextResponse } from "next/server";
import { kvGetProbe } from "@/lib/kv";
import { KV_SNAPSHOT_LATEST, KV_BASE_ROWS_LATEST } from "@/lib/blue-hood/kv-keys";
import { publishDeskRow } from "@/lib/blue-hood/quarantine";
import {
  ARB_MIN_ABS_PCT,
  DRIFT_MIN_ABS_PCT,
  matchesChain,
  parseHoodChain,
  partitionBaseRows,
} from "@/lib/blue-hood/types";
import type { BaseDeskLatest, HoodChain, HoodSnapshot, TickerSnapshot } from "@/lib/blue-hood/types";
import { HEALTHY_MAX_AGE_S } from "@/lib/blue-hood/health";
import {
  callerKeyHash,
  recordDislocationCall,
  type DislocationOutcome,
} from "@/lib/blue-hood/dislocation-usage";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" } as const;

/**
 * How old a snapshot may be before this route calls it stale, in seconds.
 *
 * ⚠️ NOT `POLL_INTERVAL_S` (300), and the difference is deliberate. A snapshot's
 * `started_at` is the CYCLE START and a cycle runs ~280s, so at the moment the
 * next cycle finishes the previous snapshot is legitimately ~300s+ old on a
 * perfectly healthy desk. Thresholding at exactly one interval would therefore
 * mark a healthy desk stale during normal jitter — and a staleness flag that
 * fires in the healthy case is one a buyer learns to ignore, which costs
 * exactly the protection it exists to provide.
 *
 * `HEALTHY_MAX_AGE_S` (660, "~2.2 intervals") is the repo's EXISTING answer to
 * this same question — it is what `/api/hood/health` uses to call the desk
 * healthy. Reusing it means this route and the health endpoint can never
 * disagree about whether the desk is current, which they would drift into
 * within a month if this file held its own number. Both chains use it: the two
 * desks are driven by the same poll cycle and anchor to the same `started_at`.
 *
 * `stale_after_seconds` is echoed on every response so the caller never has to
 * know this constant to apply a stricter rule of their own.
 */
const STALE_AFTER_S = HEALTHY_MAX_AGE_S;

/** Machine-readable reason a response is degraded. `null` when it is not. */
type StaleReason = "kv_error" | "never_polled" | "snapshot_too_old";

function bad(
  code: string,
  message: string,
  keyHash: string,
  chain: HoodChain | "none",
): NextResponse {
  void recordDislocationCall(keyHash, chain, "rejected");
  return NextResponse.json({ ok: false, error: code, message }, { status: 400, headers: NO_STORE });
}

/**
 * Build the degraded body: `stale: true`, every measured field `null`, and the
 * reason named. Shares the field list with the live path below so the two can
 * never drift into different shapes — a caller that parses the happy path must
 * not crash on the sad one.
 *
 * ⚠️ EVERY NUMERIC FIELD HERE IS `null`, NOT `0`. `drift_pct: 0` would read as
 * "measured, and there is no dislocation", which is the one sentence this
 * endpoint must never say when the truth is "we do not know".
 */
function degraded(
  ticker: string,
  chain: HoodChain,
  reason: StaleReason,
  snapshotAt: string | null,
  ageSeconds: number | null,
  message: string,
) {
  return {
    ok: true,
    ticker,
    chain,
    stale: true,
    stale_reason: reason,
    stale_after_seconds: STALE_AFTER_S,
    snapshot_at: snapshotAt,
    snapshot_age_seconds: ageSeconds,
    message,
    drift_pct: null,
    oracle_price_usd: null,
    dex_price_usd: null,
    market_open: null,
    session: null,
    dex_tvl_usd: null,
    dex_total_tvl_usd: null,
    dex_volume_24h_usd: null,
    threshold_pct: null,
    threshold_basis: null,
    beyond_threshold: null,
  };
}

export async function GET(req: Request): Promise<NextResponse> {
  const keyHash = callerKeyHash(req);
  const url = new URL(req.url);

  // ── Input. Both params required; neither is ever guessed. ───────────────
  const tickerRaw = url.searchParams.get("ticker");
  if (!tickerRaw?.trim()) {
    return bad("missing_ticker", "Query parameter `ticker` is required, e.g. ?ticker=NVDA", keyHash, "none");
  }
  const ticker = tickerRaw.trim().toUpperCase();

  const chainRaw = url.searchParams.get("chain");
  if (chainRaw === null) {
    return bad(
      "missing_chain",
      "Query parameter `chain` is required and has no default. Use `base` or `robinhood`. " +
        "The same ticker can exist on both chains as different tokens in different pools, " +
        "so a ticker alone does not identify anything.",
      keyHash,
      "none",
    );
  }
  const chain = parseHoodChain(chainRaw);
  if (!chain) {
    return bad(
      "invalid_chain",
      `Unrecognised chain ${JSON.stringify(chainRaw)}. Exactly \`base\` or \`robinhood\` — ` +
        "case-sensitive, and a chain id like `8453` is not accepted.",
      keyHash,
      "none",
    );
  }

  // ── Snapshot. One key per desk; neither falls back to the other. ────────
  let rows: readonly TickerSnapshot[];
  let snapshotAt: string;

  if (chain === "base") {
    const probe = await kvGetProbe<BaseDeskLatest>(KV_BASE_ROWS_LATEST);
    if (probe.status === "error") {
      void recordDislocationCall(keyHash, chain, "stale");
      return NextResponse.json(
        degraded(ticker, chain, "kv_error", null, null,
          `KV unreachable (${probe.message}). Dislocation is UNKNOWN, not zero — do not read this as "no dislocation".`),
        { headers: NO_STORE },
      );
    }
    if (probe.status === "miss" || !probe.value?.rows?.length) {
      void recordDislocationCall(keyHash, chain, "stale");
      return NextResponse.json(
        degraded(ticker, chain, "never_polled", null, null,
          "The Base desk has produced no rows yet (cold start). No measurement exists to report."),
        { headers: NO_STORE },
      );
    }
    // #162 — check the Base marker rather than inherit it from the type. A blob
    // written by an older deploy can hold rows with no `chain` at all, and
    // `chainOf` would read that absence as Robinhood, answering a Base query
    // with a Robinhood row. `partitionBaseRows` is the check.
    rows = partitionBaseRows(probe.value.rows).attributed;
    snapshotAt = probe.value.started_at;
  } else {
    const probe = await kvGetProbe<HoodSnapshot>(KV_SNAPSHOT_LATEST);
    if (probe.status === "error") {
      void recordDislocationCall(keyHash, chain, "stale");
      return NextResponse.json(
        degraded(ticker, chain, "kv_error", null, null,
          `KV unreachable (${probe.message}). Dislocation is UNKNOWN, not zero — do not read this as "no dislocation".`),
        { headers: NO_STORE },
      );
    }
    if (probe.status === "miss") {
      void recordDislocationCall(keyHash, chain, "stale");
      return NextResponse.json(
        degraded(ticker, chain, "never_polled", null, null,
          "The Robinhood desk has produced no snapshot yet (cold start). No measurement exists to report."),
        { headers: NO_STORE },
      );
    }
    // The RH snapshot is RH-only by construction (`persistSnapshot` is the
    // load-bearing invariant), but rows predating the Base desk carry no
    // `chain` field at all. `matchesChain` applies the absent-row default,
    // which is correct HERE — on the row — and is exactly what must never be
    // applied to the query above.
    rows = probe.value.tickers.filter((r) => matchesChain(r, "robinhood"));
    snapshotAt = probe.value.started_at;
  }

  const found = rows.find((r) => r.ticker.toUpperCase() === ticker);
  if (!found) {
    void recordDislocationCall(keyHash, chain, "rejected");
    return NextResponse.json(
      {
        ok: false,
        error: "not_watched",
        message: `${ticker} is not on the ${chain} desk. This is a different answer from "no dislocation" — we have no position to report because we do not watch it.`,
        ticker,
        chain,
        // Public already via /api/hood/snapshot, and the single most useful
        // thing to hand an integrator who guessed a ticker wrong.
        watched: rows.map((r) => r.ticker).sort(),
      },
      { status: 404, headers: NO_STORE },
    );
  }

  // F6 — published through the quarantine: on the Robinhood desk the DEX
  // price and the drift derived from it are withheld (null, with the reason),
  // because that leg is GT's token-level figure, not the pool's rate.
  const row = publishDeskRow(found);

  // ── Freshness. Reported on EVERY response, stale or not. ────────────────
  const startedMs = new Date(snapshotAt).getTime();
  const ageSeconds = Number.isFinite(startedMs)
    ? Math.max(0, Math.round((Date.now() - startedMs) / 1000))
    : null;
  const stale = ageSeconds === null || ageSeconds > STALE_AFTER_S;

  // ── Threshold: read from the engine's own constants, per SESSION. ───────
  // Identical selection to api/hood/base-series/route.ts:84 and to
  // HoodClient.tsx:731. Never a literal in this file.
  const marketOpen = row.market.is_open;
  const thresholdPct = marketOpen ? ARB_MIN_ABS_PCT : DRIFT_MIN_ABS_PCT;

  // `null` — not `false` — when drift was not measured. "We did not measure a
  // dislocation" and "we measured, and there is none" are the two sentences
  // this endpoint exists to keep apart.
  const driftPct = row.drift_pct;
  const beyondThreshold = driftPct === null ? null : Math.abs(driftPct) >= thresholdPct;

  // ── oracle_age_seconds — the three-state field. ─────────────────────────
  // Measured AT POLL TIME, never against `Date.now()`: the field's own doc
  // block warns that an age is only meaningful against the instant it was
  // measured. `polled_at_ms` is an OFFSET from cycle start (not an absolute
  // timestamp), so the row's real poll instant is `started_at + polled_at_ms` —
  // using `started_at` alone would be up to a full ~280s cycle wrong.
  //   • number    — Base read the round and dated it.
  //   • null      — Base looked and the feed was unreadable.
  //   • undefined — this desk never records it (all of RH). Key is OMITTED.
  let oracleAgeSeconds: number | null | undefined;
  if (row.oracle_updated_at === undefined) {
    oracleAgeSeconds = undefined;
  } else if (row.oracle_updated_at === null) {
    oracleAgeSeconds = null;
  } else {
    const polledAtMs = startedMs + row.polled_at_ms;
    oracleAgeSeconds = Number.isFinite(polledAtMs)
      ? Math.max(0, Math.round(polledAtMs / 1000 - row.oracle_updated_at))
      : null;
  }

  void recordDislocationCall(keyHash, chain, stale ? "stale" : "ok");

  return NextResponse.json(
    {
      ok: true,
      ticker: row.ticker,
      chain,
      stale,
      // Named even when `stale` is true for age alone, so a caller never has to
      // infer WHY from the numbers.
      stale_reason: stale ? ("snapshot_too_old" satisfies StaleReason) : null,
      stale_after_seconds: STALE_AFTER_S,
      snapshot_at: snapshotAt,
      snapshot_age_seconds: ageSeconds,

      drift_pct: driftPct,
      oracle_price_usd: row.oracle_usd,
      dex_price_usd: row.dex_usd,
      market_open: marketOpen,
      session: row.market.session,

      // Omitted, not null, on a desk that never measures it. Conditional spread
      // so the absence is structural rather than a JSON.stringify side effect.
      ...(oracleAgeSeconds === undefined ? {} : { oracle_age_seconds: oracleAgeSeconds }),

      // `dex_tvl_usd` is the PRIMARY pool — the price frame a swap actually
      // executes against, which is what a buyer sizing a trade needs. It is
      // explicitly NOT the depth number: `types.ts` warns that thin primary
      // pools sit beside $21M WETH pools, so `dex_total_tvl_usd` is carried
      // alongside rather than instead. Same pairing the RWA brief already uses.
      dex_tvl_usd: row.tvl_usd,
      dex_total_tvl_usd: row.total_tvl_usd,
      dex_volume_24h_usd: row.volume_24h_usd,

      threshold_pct: thresholdPct,
      threshold_basis: marketOpen ? "market_open_arb" : "market_closed_drift",
      beyond_threshold: beyondThreshold,

      // Verbatim from the poller. `thin_dex_pool` / `feed_abnormally_stale`
      // change how much weight the drift deserves, so withholding them would
      // make the number look cleaner than it is.
      warnings: row.warnings,
      no_data_reason: row.no_data_reason,
      provenance: row.provenance,
      ...(row.provenance_note ? { provenance_note: row.provenance_note } : {}),
    },
    { headers: NO_STORE },
  );
}
