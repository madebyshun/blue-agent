/**
 * The two free Blue Hood readers — `hood-live` and `hood-track-record`.
 *
 * Run: `npx tsx scripts/hood-x402-readers-check.ts` from `apps/web/`.
 * Also runs automatically under `npm test` (opt-out discovery in run-tests.ts).
 *
 * ═══ WHY THIS FILE EXISTS ═══
 *
 * Both handlers are deliberately THIN — they wrap library functions that already
 * encode the hard-won rules (`getPublicTrackRecordProbe` owns the outage shape,
 * `partitionBaseRows` owns chain attribution, `hit-rate-gate` owns the sample
 * threshold). Thin is the right shape and it is also the danger: every invariant
 * they depend on lives in a DIFFERENT file, so a wrapper can be rewritten into a
 * liar without touching a single line the other guards watch.
 *
 * Concretely, each of these is one small edit away and none of them fails to
 * compile:
 *   · swap `getPublicTrackRecordProbe` for the older `readPublicArrows` shape and
 *     a dead database starts reporting "we have never fired an arrow" — on the
 *     one endpoint whose entire purpose is to prove that we have;
 *   · emit `pct` from `pct_internal` and the withheld percentage is published
 *     below its own sample gate;
 *   · let `parseHoodChain` fall back to `"robinhood"` and a Base question gets
 *     answered with Robinhood rows;
 *   · call `chainOf` instead of testing `r.chain === "base"` and an unattributed
 *     row renders under a Robinhood identity with a Blockscout link;
 *   · collapse the two 503s and a monitoring blackout is reported as "the poller
 *     has not run".
 *
 * The library guards cannot see any of that, because none of it happens in the
 * library. This suite watches the seam.
 *
 * ═══ HOW TO READ A CASE ═══
 *
 * Cases are grouped by handler (T = track record, L = live) and every one names
 * the single edit that must make it go red. A case with no such edit is
 * decoration and should be deleted rather than kept for the count.
 *
 * NEGATIVE CONTROLS — make the change, this suite must go red:
 *   a. `hood-track-record`: return a record instead of 503 on `status !== "ok"` ... T1
 *   a'. `hood-track-record`: answer 503 unconditionally .......................... T1b
 *   b. `hood-track-record`: emit `pct` when `ready === false` ....................... T2
 *   c. `hood-track-record`: spread `pct_internal` into the response ................. T3
 *   d. `hood-track-record`: emit `confidence_interval` unconditionally .............. T4, T5
 *   e. `hood-live`: default an absent `chain` input to `"robinhood"` ................ L1
 *   f. `hood-live`: accept an unknown chain instead of 400ing ....................... L2
 *   g. `hood-live`: use `chainOf` in place of the `r.chain === "base"` test ......... L5
 *   h. `hood-live`: drop the freshness gate before the partition .................... L6
 *   i. `hood-live`: merge the two 503 causes into one ............................... L7
 *   j. `hood-live`: hardcode `data_age_basis` to one desk ........................... L4
 *   k. `hood-live`: count `returned_*` pre-filter ................................... L3
 *
 * Hermetic: runs against the in-memory KV fallback and refuses to start if real
 * credentials are present — this suite WRITES `bh:snapshot:latest`, which every
 * public Blue Hood surface reads.
 */
import { kv, kvSet, kvDel } from "../src/lib/kv";
import {
  KV_SNAPSHOT_LATEST,
  KV_BASE_ROWS_LATEST,
  KV_ARROW_HYDRATED,
  BASE_ROWS_MAX_AGE_MS,
} from "../src/lib/blue-hood/kv-keys";
import { HYDRATED_VERSION, type HydratedFeed } from "../src/lib/blue-hood/arrow-cache";
import { HIT_RATE_MIN_SAMPLE_AGGREGATE } from "../src/lib/blue-hood/hit-rate-gate";
import { HANDLERS } from "../src/app/api/x402/_handlers/index";
import type {
  Arrow,
  ArrowType,
  BaseDeskLatest,
  HoodSnapshot,
  MarketSession,
  TickerSnapshot,
} from "../src/lib/blue-hood/types";

let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  console.log(`${pass ? "  ✓" : "  ✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}

const NOW = Date.now();
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

/** Mirrors the `ALIGNED_PCT_CLOSED` that `base-poller.ts` and `rh-stock-arb.ts`
 *  each declare privately (both 1.5). Copied rather than imported on purpose:
 *  neither is exported, and importing `base-poller` would drag an RPC client
 *  into a suite whose entire point is that it touches no network. If the real
 *  threshold moves, this fixture just labels a row slightly differently — no
 *  assertion here depends on the number. */
const ALIGNED_PCT_CLOSED = 1.5;

// ── Fixtures ────────────────────────────────────────────────────────────────

function row(
  ticker: string,
  chain: "base" | "robinhood" | undefined,
  contract: string,
  drift: number,
): TickerSnapshot {
  return {
    ticker,
    // `undefined` is a REAL case, not a lazy fixture: 24 live RH rows predate the
    // chain marker, which is why `chainOf` reads absence as robinhood.
    ...(chain ? { chain } : {}),
    name: `${ticker} Inc`,
    contract,
    // The market fixture below is CLOSED (weekend), so the only verdicts a
    // poller can write on this row are the closed-market pair. Derived from
    // |drift| rather than pinned, so a row carrying 2.2% drift cannot also
    // claim it is aligned — a fixture that contradicts itself is how a guard
    // starts passing for the wrong reason. Nothing in this suite ASSERTS on
    // `verdict`; it only has to be legal and self-consistent.
    //
    // The first draft said `"NEUTRAL"`, which is not an `M5Verdict` at all and
    // compiled only because of the cast at the end of this object. That is the
    // cast earning its keep in reverse: widen it to `as unknown as` and this
    // fixture silently stops resembling anything production writes.
    verdict: Math.abs(drift) < ALIGNED_PCT_CLOSED ? "FROZEN_ALIGNED" : "AFTERHOURS_DRIFT",
    oracle_usd: 100,
    dex_usd: 100 + drift,
    tvl_usd: 500_000,
    total_tvl_usd: 900_000,
    volume_24h_usd: 250_000,
    drift_pct: drift,
    pool_ref: "0xpool",
    is_v4_pool_id: false,
    market: { is_open: false, session: "weekend", ny_time_iso: iso(0) },
    warnings: [],
    polled_at_ms: 1_200,
    data_age_s: 42,
    sparkline: null,
    // `null` because this row HAS data — the field records why a row is blind,
    // and a fixture with a price that also claims a blindness reason would be a
    // shape production never writes. The cast below stays narrow deliberately:
    // it exists to skip optional fields, not to let a fixture drift out of the
    // real type. `as unknown as` would have hidden exactly this omission.
    no_data_reason: null,
  } as TickerSnapshot;
}

function snapshot(tickers: TickerSnapshot[]): HoodSnapshot {
  return {
    cycle_id: 1,
    started_at: iso(60_000),
    finished_at: iso(30_000),
    duration_ms: 30_000,
    tickers,
    metrics: {
      registry_total: 40,
      tokens_eligible: 30,
      tokens_watched: tickers.length,
      tokens_no_feed: 10,
      tokens_not_enabled: 6,
      tokens_errored: 0,
      tvl_scanned_usd: 1_000_000,
      market_is_open: false,
      market_session: "weekend",
    },
  };
}

const SESSIONS: MarketSession[] = ["regular", "premarket", "afterhours", "weekend"];
function arrow(i: number, hit: boolean): Arrow {
  const type: ArrowType = i % 2 === 0 ? "drift" : "arb";
  const session = SESSIONS[i % SESSIONS.length];
  return {
    id: `x402-readers-${i}`,
    serial: `#${String(7000 + i).padStart(4, "0")}`,
    ticker: ["NVDA", "AMD", "INTC", "MU"][i % 4],
    type,
    expected_direction: i % 2 === 0 ? "up" : "down",
    grading_window_h: type === "drift" ? 6 : 4,
    reference_price: 100,
    snapshot_refs: [],
    // Inside the rolling 7-day gate window, anchored to the real clock so this
    // suite cannot quietly stop exercising the gate next week.
    fired_at: iso(2 * 3_600_000 + (i + 1) * 900_000),
    status: "graded",
    outcome: hit ? "hit" : "miss",
    graded_at: iso(2 * 3_600_000 + i * 900_000),
    outcome_detail: null,
    origin: "engine",
    snapshot_at_fire: {
      dex_price_usd: 103,
      oracle_price_usd: 100,
      dex_tvl_usd: 200_000,
      dex_total_tvl_usd: null,
      dex_volume_24h_usd: 150_000,
      dex_change_24h_pct: null,
      chainlink_age_seconds: null,
    },
    market_at_fire: { is_open: session === "regular", session, ny_time_iso: iso(0) },
  };
}

async function seedArrows(arrows: Arrow[]): Promise<void> {
  await kvSet(KV_ARROW_HYDRATED, {
    v: HYDRATED_VERSION,
    built_at: iso(0),
    arrows,
  } satisfies HydratedFeed);
}

/**
 * Swap in a `kv.get` that throws; always restore.
 *
 * Mirrors the Upstash cap outages (#123, #148), where reads are throttled but
 * the database is alive. This is the ONLY way to reach the `unavailable` branch:
 * a DELETED key is a different fact (see T1b) and takes the success path.
 */
async function withReadFailure<T>(fn: () => Promise<T>): Promise<T> {
  const real = kv.get.bind(kv);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (kv as any).get = async () => {
    throw new Error("max requests limit exceeded");
  };
  try {
    return await fn();
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (kv as any).get = real;
  }
}

type Json = Record<string, unknown>;
async function call(tool: string, body: unknown): Promise<{ status: number; body: Json }> {
  const res = await HANDLERS[tool](
    new Request(`https://blueagent.dev/api/x402/${tool}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  let parsed: Json = {};
  try {
    parsed = (await res.json()) as Json;
  } catch {
    /* a non-JSON body is itself a failure the caller asserts on */
  }
  return { status: res.status, body: parsed };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dig = (o: any, ...path: string[]) => path.reduce((a, k) => a?.[k], o);

async function main() {
  console.log("\nhood x402 readers — a thin wrapper is still allowed to lie\n");

  // ── 0. SAFETY GATE ────────────────────────────────────────────────────────
  // Same gate as track-record-read-test.ts, for the same reason: the key names
  // are byte-identical to production's, so "it's only the dev database" is not a
  // defence. This suite writes the snapshot blob /hood renders.
  const liveKv =
    (process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL) &&
    (process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN);
  if (liveKv) {
    console.error("  ✗ ABORT — KV credentials are set. This suite writes bh:snapshot:latest.");
    console.error("            Run it with no KV env.");
    process.exit(1);
  }
  console.log("  ✓ safety gate — no KV credentials; in-memory fallback\n");

  // ══════════════════════════════════════════════════════════════════════════
  // T. hood-track-record
  // ══════════════════════════════════════════════════════════════════════════

  // ── T1: an UNREADABLE feed is NOT an empty record ─────────────────────────
  // The single most important assertion here. `getPublicTrackRecordProbe` can
  // answer "unavailable"; the deleted shape it replaced answered `[]`, which
  // `buildPublicTrackRecord` turns into a confident `total_graded: 0` — i.e.
  // "Blue Hood has never fired an arrow" — on the one endpoint whose purpose is
  // to prove that it has.
  //
  // The fault must be a THROW, not a missing key. That distinction is the whole
  // point and it is easy to get wrong in the fixture rather than the code: the
  // first draft of this case deleted the key and asserted 503, which failed
  // against a CORRECT handler. A deleted key is a cold start, and a cold start
  // really does have zero arrows — see T1b.
  console.log("T1. the arrow feed cannot be READ (KV throws)");
  {
    await seedArrows([arrow(0, true), arrow(1, false)]);
    const { status, body } = await withReadFailure(() => call("hood-track-record", {}));
    check("answers 503, not 200", status === 503, `got ${status}`);
    check("names the cause", body.error === "arrow_feed_unavailable", String(body.error));
    check(
      "does NOT ship a record",
      body.headline === undefined && body.receipts === undefined,
      "headline/receipts must be absent",
    );
    check(
      "says the record is unknown rather than empty",
      typeof body.note === "string" && /NOT a claim that zero arrows exist/i.test(body.note),
      String(body.note),
    );
  }

  // ── T1b: a COLD START is a real empty record, and answers 200 ─────────────
  // The counterpart to T1, and load-bearing in the same way group C is in
  // `track-record-read-test.ts`: without it, "always answer 503" would satisfy
  // T1 forever while taking the proof endpoint permanently dark. An absent key
  // is not an outage — it is the honest statement that nothing has been stored
  // yet, and the gate already says `ready: false` rather than inventing a rate.
  console.log("\nT1b. no arrow feed stored yet (cold start)");
  {
    await kvDel(KV_ARROW_HYDRATED);
    const { status, body } = await call("hood-track-record", {});
    check("answers 200 — absent is not unreadable", status === 200, `got ${status}`);
    check("ships a real record", body.receipts !== undefined, "receipts must be present");
    check(
      "and still publishes no percentage",
      dig(body, "headline", "hit_rate", "pct") === undefined,
      JSON.stringify(dig(body, "headline", "hit_rate")),
    );
    check(
      "does NOT report the outage cause",
      body.error === undefined,
      String(body.error),
    );
  }

  // ── T2/T3: below the gate, there is no percentage anywhere ────────────────
  // `statsFor` computes `pct_internal` unconditionally. The whole gate is the
  // sanitize step that strips it. If the wrapper spreads the raw object, a
  // percentage computed from 3 arrows gets published as a hit rate.
  console.log("\nT2/T3. a sample BELOW the aggregate gate");
  {
    await seedArrows([arrow(0, true), arrow(1, true), arrow(2, false)]);
    const { status, body } = await call("hood-track-record", {});
    const hr = dig(body, "headline", "hit_rate");
    check("still answers 200 — a small sample is data, not an outage", status === 200, `got ${status}`);
    check("ready is false", hr?.ready === false, JSON.stringify(hr?.ready));
    check("publishes NO percentage", hr?.pct === undefined, JSON.stringify(hr?.pct));
    check(
      "says how many more it needs",
      hr?.needed === HIT_RATE_MIN_SAMPLE_AGGREGATE,
      `${hr?.needed} vs ${HIT_RATE_MIN_SAMPLE_AGGREGATE}`,
    );
    check("pct_internal never reaches the wire", !("pct_internal" in (hr ?? {})), JSON.stringify(hr));
    // T4 half: a CI is an attribute of a PUBLISHED percentage. Emitting one
    // below the gate would republish the withheld number as an interval.
    check(
      "no confidence interval below the gate",
      hr?.confidence_interval === undefined,
      JSON.stringify(hr?.confidence_interval),
    );
  }

  // ── T4/T5: above the gate, the interval appears and agrees with pct ───────
  // Without this case, "never emit a CI" would pass T2 forever while the
  // feature silently did nothing.
  console.log("\nT4/T5. a sample ABOVE the aggregate gate");
  {
    const n = HIT_RATE_MIN_SAMPLE_AGGREGATE + 10;
    await seedArrows(Array.from({ length: n }, (_, i) => arrow(i, i % 10 < 7)));
    const { status, body } = await call("hood-track-record", {});
    const hr = dig(body, "headline", "hit_rate");
    check("answers 200", status === 200, `got ${status}`);
    check("ready is true", hr?.ready === true, JSON.stringify(hr?.ready));
    check("publishes a percentage", typeof hr?.pct === "number", JSON.stringify(hr?.pct));
    const ci = hr?.confidence_interval;
    check("ships a confidence interval", ci !== undefined, JSON.stringify(ci));
    check("labels its basis", ci?.basis === "wilson_95", String(ci?.basis));
    check(
      "interval is inside [0,1] — the Wilson property the normal approximation lacks",
      ci?.low >= 0 && ci?.high <= 1 && ci.low <= ci.high,
      JSON.stringify(ci),
    );
    // The gate's integer must remain the published one. Re-deriving a sharper
    // percentage here would put two different hit rates on two pages of one site.
    check(
      "pct sits inside its own interval",
      hr.pct / 100 >= ci.low - 0.0001 && hr.pct / 100 <= ci.high + 0.0001,
      `pct=${hr.pct} ci=${JSON.stringify(ci)}`,
    );
    check("pct_internal still never reaches the wire", !("pct_internal" in hr), JSON.stringify(hr));
    // Receipts are the point of a free scoreboard: they must be recomputable.
    check(
      "returns receipts so the number can be recomputed",
      Array.isArray(dig(body, "receipts", "arrows")),
      JSON.stringify(Object.keys(dig(body, "receipts") ?? {})),
    );
    check("window says whether the record was truncated", typeof dig(body, "window", "truncated") === "boolean");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // L. hood-live
  // ══════════════════════════════════════════════════════════════════════════

  const RH = row("NVDA", "robinhood", "0xRH00000000000000000000000000000000000001", 0.4);
  const RH_LEGACY = row("AAPL", undefined, "0xRH00000000000000000000000000000000000002", 0.2);
  const BASE = row("NVDA", "base", "0xBA00000000000000000000000000000000000001", 1.1);

  async function seedBoth(baseRows: TickerSnapshot[], baseStartedAgoMs = 60_000) {
    await kvSet(KV_SNAPSHOT_LATEST, snapshot([RH, RH_LEGACY]));
    await kvSet(KV_BASE_ROWS_LATEST, {
      started_at: iso(baseStartedAgoMs),
      rows: baseRows,
    } as BaseDeskLatest);
  }

  // ── L1: an absent chain input means BOTH desks, never robinhood ───────────
  // #206's third instance. The row default and the input default are two
  // different absences; collapsing them made Blue Chat answer "drift on NVDA on
  // Base" with a graded Robinhood arrow.
  console.log("\nL1. no chain input");
  {
    await seedBoth([BASE]);
    const { status, body } = await call("hood-live", {});
    check("answers 200", status === 200, `got ${status}`);
    check("reports the filter as both", body.chain_filter === "both", String(body.chain_filter));
    const chains = new Set((body.rows as { chain: string }[]).map((r) => r.chain));
    check("returns BOTH desks", chains.has("base") && chains.has("robinhood"), JSON.stringify([...chains]));
  }

  // ── L2: an unknown chain is rejected, not silently reinterpreted ──────────
  console.log("\nL2. an unknown chain input");
  {
    const { status, body } = await call("hood-live", { chain: "ethereum" });
    check("answers 400", status === 400, `got ${status}`);
    check(
      "names both real venues in the error",
      typeof body.error === "string" && /base/i.test(body.error) && /robinhood/i.test(body.error),
      String(body.error),
    );
  }

  // ── L3: every count names its own population ──────────────────────────────
  // The first shape answered `returned: 0, robinhood: 24` for chain=base —
  // advertising 24 rows it did not return.
  console.log("\nL3. counts under an active filter");
  {
    const { body } = await call("hood-live", { chain: "base" });
    const c = body.counts as Record<string, number>;
    const rows = body.rows as { chain: string }[];
    check("returned matches the row array", c.returned === rows.length, `${c.returned} vs ${rows.length}`);
    check(
      "returned_* sum to returned",
      c.returned_robinhood + c.returned_base === c.returned,
      JSON.stringify(c),
    );
    check("no Robinhood row survives a base filter", c.returned_robinhood === 0, JSON.stringify(c));
    check(
      "available_* still describe the unfiltered desks",
      c.available_robinhood === 2,
      JSON.stringify(c),
    );
  }

  // ── L4: data_age_s travels with the basis that makes it readable ──────────
  console.log("\nL4. data_age_basis per desk");
  {
    const { body } = await call("hood-live", {});
    const rows = body.rows as { chain: string; data_age_basis: string; explorer: string }[];
    check(
      "base rows are labelled chainlink_round_age",
      rows.filter((r) => r.chain === "base").every((r) => r.data_age_basis === "chainlink_round_age"),
      JSON.stringify(rows.map((r) => [r.chain, r.data_age_basis])),
    );
    check(
      "robinhood rows are labelled dex_cache_age",
      rows.filter((r) => r.chain === "robinhood").every((r) => r.data_age_basis === "dex_cache_age"),
      JSON.stringify(rows.map((r) => [r.chain, r.data_age_basis])),
    );
    // An address without its chain is unreadable, and the two explorers do not
    // resolve each other's addresses.
    check(
      "every explorer link is built from its own row's chain",
      rows.every((r) =>
        r.chain === "base"
          ? /basescan\.org/i.test(r.explorer)
          : /robinhoodchain|blockscout/i.test(r.explorer),
      ),
      JSON.stringify(rows.map((r) => [r.chain, r.explorer])),
    );
  }

  // ── L5: an unattributed Base row is DROPPED and COUNTED ───────────────────
  // `kvGet<BaseDeskLatest>` is an unchecked cast, so the type binds the writer
  // and proves nothing here. Showing nothing is recoverable; showing NVDA's Base
  // row under a Robinhood identity is #161.
  console.log("\nL5. a Base blob carrying a row with no chain marker");
  {
    const unmarked = row("META", undefined, "0xBA00000000000000000000000000000000000009", 2.2);
    await seedBoth([BASE, unmarked]);
    const { body } = await call("hood-live", { chain: "base" });
    const rows = body.rows as { ticker: string }[];
    check("the unattributed row is not returned", !rows.some((r) => r.ticker === "META"), JSON.stringify(rows.map((r) => r.ticker)));
    check(
      "the shortfall is reported, not swallowed",
      dig(body, "base_desk", "unattributed") === 1,
      JSON.stringify(dig(body, "base_desk")),
    );
    check(
      "count reflects only what was attributed",
      dig(body, "base_desk", "count") === 1,
      JSON.stringify(dig(body, "base_desk")),
    );
  }

  // ── L6: a stale Base blob is dropped and SAID to be stale ─────────────────
  // A wrong price that looks fresh is worse than no price, because it is
  // actionable. The gate must run BEFORE the partition.
  console.log("\nL6. a Base blob older than the freshness gate");
  {
    await seedBoth([BASE], BASE_ROWS_MAX_AGE_MS + 60_000);
    const { body } = await call("hood-live", {});
    check("desk reports stale", dig(body, "base_desk", "status") === "stale", JSON.stringify(dig(body, "base_desk")));
    check("no Base row is returned", dig(body, "base_desk", "count") === 0, JSON.stringify(dig(body, "base_desk")));
    check(
      "the Robinhood desk is unaffected",
      (body.rows as { chain: string }[]).every((r) => r.chain === "robinhood") &&
        (body.rows as unknown[]).length === 2,
      JSON.stringify((body.rows as { chain: string }[]).map((r) => r.chain)),
    );
  }

  // ── L7: BLIND is not DOWN ─────────────────────────────────────────────────
  // A missing snapshot means the poller has not run. That is a different answer
  // from an unreadable KV, and reporting the second as the first is the blind
  // message that masked the 2026-07-27 Upstash-cap outage.
  console.log("\nL7. no snapshot stored at all");
  {
    await kvDel(KV_SNAPSHOT_LATEST);
    await kvDel(KV_BASE_ROWS_LATEST);
    const { status, body } = await call("hood-live", {});
    check("answers 503", status === 503, `got ${status}`);
    check("reports never_polled", body.error === "never_polled", String(body.error));
    check(
      "and NOT the unreachable-KV cause — the two must stay distinguishable",
      body.error !== "kv_unreachable",
      String(body.error),
    );
  }

  console.log(
    failures === 0
      ? "\nPASS — the wrappers still inherit the rules they claim to\n"
      : `\nFAIL — ${failures} assertion(s)\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
