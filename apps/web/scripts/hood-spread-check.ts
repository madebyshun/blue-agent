/**
 * Guards for `GET /api/hood/dislocation/spread` — the cross-venue endpoint.
 *
 * WHAT IS BEING DEFENDED
 * ----------------------
 * This endpoint publishes the ONE derived number in Blue Hood. Everywhere else
 * the rule is "every number is read, never recomputed"; here `spread_pct` is
 * computed in code, because no upstream definition of it exists. That buys the
 * product its only genuinely differentiated read and costs it the protection
 * that rule was giving — so the arithmetic itself has to be pinned.
 *
 * The failure mode is not an outage. It is a number that looks like a venue
 * disagreement and is actually something else:
 *
 *   • TIME. If the two desks' snapshots are from different poll cycles, "the
 *     venues disagree by 0.6%" is indistinguishable from "the stock moved 0.6%
 *     in seven minutes". Group 2 is the whole reason this file exists.
 *   • A ZERO. A desk that could not be read must never render as a spread of 0,
 *     which reads as "measured, the venues agree". Group 5.
 *   • A ONE-LEGGED COMPARISON. 16 of the 24 Robinhood tickers are not listed on
 *     Base. A venue that does not carry the ticker must say so structurally, not
 *     contribute a `null` that arithmetic can silently treat as a price. Group 4.
 *
 * Every check runs against the REAL route handler with a fabricated KV. None
 * re-implements the route's logic: the expected values in group 3 are hand
 * computed from the fixtures and written as literals, because a test that
 * re-derives the answer with the same formula proves only that the test and the
 * code agree, which is not the question being asked.
 *
 * ⚠️ The fixtures in group 3 use integer prices over a denominator of 100 ON
 * PURPOSE — verified exact in IEEE754, so the assertions can stay strict
 * equalities. Do not "fix" a future failure here by adding an epsilon: a
 * tolerance would also admit a formula that is wrong in the last digit, and the
 * formula is the thing under test.
 *
 * MUTATION-TESTED 2026-09-28 against the real route source — all 13 defects
 * below were planted one at a time and the suite confirmed RED on each, and on
 * the assertion that NAMES that defect rather than on some unrelated one. A
 * guard that has not been shown to fail on the bug it names is decoration.
 *
 *    1. cycle skew computes the spread anyway (the headline defect)
 *    2. cycle skew compared with a ±2s tolerance instead of identity
 *    3. `chain` is ignored rather than refused
 *    4. an unwatched venue contributes `dex_price_usd: null` instead of omitting
 *    5. a desk read failure yields `spread_pct: 0`
 *    6. `spread_wider_than_either_oracle_drift` is `false` when a drift is absent
 *    7. staleness measured from the NEWER leg
 *    8. one desk unreadable still reports `stale: false`
 *    9. the meter records `base` instead of `both`
 *   10. the spread divides by the venue its own `spread_basis` does not name
 *   11. the zero-denominator guard is removed (see 3.8 — the result is NOT an
 *       obvious Infinity on the wire, which is why that check asserts the cause
 *       and not just the value)
 *   12. `not_on_both_venues` collapses into the generic unreadable reason
 *   13. `stale_reason` collapses `never_polled` into `kv_error`
 *
 * ⚠️ M9 initially reported RED for the WRONG REASON — a clock-boundary flake in
 * 7.5, not the metering defect it was planting. That is the failure mode of
 * mutation testing itself: a red run looks like proof regardless of which
 * assertion fired. Always read WHICH check failed, never just the exit code.
 * The flake is fixed (see `nearSeconds`) and the suite was confirmed
 * deterministic over 10 consecutive runs before this list was written.
 *
 * Run: npx tsx scripts/hood-spread-check.ts
 */
import fs from "node:fs";
import path from "node:path";
import { kv } from "../src/lib/kv";
import { KV_SNAPSHOT_LATEST, KV_BASE_ROWS_LATEST } from "../src/lib/blue-hood/kv-keys";
import { HEALTHY_MAX_AGE_S, POLL_INTERVAL_S } from "../src/lib/blue-hood/health";
// Imported rather than re-typed: group 8 asserts the meter's stored field, and a
// test carrying its own SHA-256 would keep passing after the real hash changed.
import { hashApiKey, ANON_KEY_HASH } from "../src/lib/blue-hood/dislocation-usage";
import type {
  BaseDeskLatest,
  BaseTickerSnapshot,
  HoodSnapshot,
  TickerSnapshot,
} from "../src/lib/blue-hood/types";

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail = ""): void {
  if (ok) {
    passed++;
  } else {
    failed++;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const WEB = path.resolve(__dirname, "..");
const read = (rel: string) => fs.readFileSync(path.join(WEB, rel), "utf8");
const ROUTE_REL = "src/app/api/hood/dislocation/spread/route.ts";
const routeSrc = read(ROUTE_REL);

/**
 * Source with comments removed. Same reason as the sibling check file: these
 * routes are heavily commented by design, and a raw grep for an absent feature
 * fires on the prose explaining why it is absent. A guard that punishes
 * documentation teaches people to delete documentation.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
const routeCode = stripComments(routeSrc);

/* ── KV harness ───────────────────────────────────────────────────────────────
 *
 * The route reads both desks through `kvGetProbe`, which is a thin wrapper over
 * `kv.get`, so stubbing `kv.get` covers both legs. `failKeys` fails a CHOSEN
 * key rather than all reads, because the interesting case for this endpoint is
 * ONE desk down and the other healthy — that is the asymmetry a single global
 * failure switch cannot express, and it is where `stale: false` leaked through.
 */
type KvMap = Record<string, unknown>;
interface KvOpts {
  failKeys?: string[];
}

function patchKv(map: KvMap, opts: KvOpts, sink?: string[]) {
  const real = {
    get: kv.get.bind(kv),
    hgetall: kv.hgetall.bind(kv),
    hincrby: kv.hincrby.bind(kv),
    expire: kv.expire.bind(kv),
  };
  /* eslint-disable @typescript-eslint/no-explicit-any */
  (kv as any).get = async (key: string) => {
    if (opts.failKeys?.includes(key)) {
      throw new Error("simulated Upstash throttle (max requests limit exceeded)");
    }
    return key in map ? map[key] : null;
  };
  (kv as any).hgetall = async () => ({});
  (kv as any).hincrby = async (_key: string, field: string) => {
    sink?.push(field);
    return 1;
  };
  (kv as any).expire = async () => 1;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    (kv as any).get = real.get;
    (kv as any).hgetall = real.hgetall;
    (kv as any).hincrby = real.hincrby;
    (kv as any).expire = real.expire;
    /* eslint-enable @typescript-eslint/no-explicit-any */
  };
}

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

function row(over: Partial<TickerSnapshot> = {}): TickerSnapshot {
  return {
    ticker: "AMZN",
    name: "Amazon",
    contract: "0x0000000000000000000000000000000000000001",
    verdict: "NEUTRAL" as TickerSnapshot["verdict"],
    oracle_usd: 100,
    dex_usd: 100,
    tvl_usd: 500_000,
    total_tvl_usd: 900_000,
    volume_24h_usd: 250_000,
    drift_pct: 0,
    pool_ref: "0xpool",
    is_v4_pool_id: false,
    market: { is_open: false, session: "afterhours", ny_time_iso: "2026-09-28T18:00:00-04:00" },
    warnings: [],
    polled_at_ms: 1_000,
    data_age_s: 5,
    sparkline: null,
    no_data_reason: null,
    ...over,
  };
}

function rhSnapshot(rows: TickerSnapshot[], startedAt: string): HoodSnapshot {
  return {
    cycle_id: 1,
    started_at: startedAt,
    finished_at: startedAt,
    duration_ms: 1000,
    tickers: rows,
    metrics: { registry_total: rows.length, tokens_watched: rows.length, tokens_errored: 0 },
  } as unknown as HoodSnapshot;
}

function baseLatest(rows: TickerSnapshot[], startedAt: string): BaseDeskLatest {
  return { started_at: startedAt, rows: rows as BaseTickerSnapshot[] };
}

const agoIso = (s: number) => new Date(Date.now() - s * 1000).toISOString();

/**
 * An age assertion with a small window — and the ONE place in this file where a
 * tolerance is correct.
 *
 * `oldest_snapshot_age_seconds` is `Date.now() - snapshot`, so no fixture can
 * make it exact: the clock moves between building the fixture and reading the
 * response, and the sub-second remainder rounds either way. MEASURED
 * 2026-09-28: written as `=== 30` it returned 31 on some runs — the same
 * coin-flip that shipped green in the sibling check file and had to be repaired
 * there.
 *
 * 🔴 The sibling's fix was to PIN THE FIXTURE and keep a strict equality, and
 * its comment says not to reach for a tolerance. That advice does not transfer,
 * and the difference is worth stating rather than glossing: there, the age was
 * derived from two fixture values, so exactness was achievable and a tolerance
 * would have admitted the very `Date.now()`-based defect the check existed to
 * catch. Here the value is genuinely a live clock reading, and the defect being
 * guarded — measuring the NEWER leg instead of the older — moves the answer by
 * **600 seconds**. A 3-second window cannot admit a 600-second error, so the
 * tolerance costs nothing the assertion was buying.
 *
 * Do not widen it past a few seconds without re-checking that gap.
 */
function nearSeconds(actual: unknown, expected: number, tolerance = 3): boolean {
  return typeof actual === "number" && Math.abs(actual - expected) <= tolerance;
}

/**
 * Both desks, sharing ONE `started_at` — the production invariant.
 *
 * Whole-second timestamps, for the same reason the sibling file pins its oracle
 * fixture: a millisecond tail puts derived ages on a rounding boundary and
 * turns an assertion into a coin flip that ships green half the time.
 */
function pair(
  baseOver: Partial<TickerSnapshot>,
  rhOver: Partial<TickerSnapshot>,
  opts: { ageS?: number; baseAgeS?: number; rhAgeS?: number } = {},
): KvMap {
  const whole = (s: number) => new Date(Math.floor((Date.now() - s * 1000) / 1000) * 1000).toISOString();
  const baseAt = whole(opts.baseAgeS ?? opts.ageS ?? 30);
  const rhAt = whole(opts.rhAgeS ?? opts.ageS ?? 30);
  return {
    [KV_BASE_ROWS_LATEST]: baseLatest([row({ chain: "base", ...baseOver })], baseAt),
    [KV_SNAPSHOT_LATEST]: rhSnapshot([row({ chain: "robinhood", ...rhOver })], rhAt),
  };
}

type Body = Record<string, unknown>;

async function call(
  qs: string,
  map: KvMap,
  opts: KvOpts & { key?: string } = {},
): Promise<{ status: number; body: Body; fields: string[] }> {
  const { GET } = await import("../src/app/api/hood/dislocation/spread/route");
  const fields: string[] = [];
  const restore = patchKv(map, opts, fields);
  try {
    const headers = opts.key ? { "x-api-key": opts.key } : undefined;
    const res = await GET(
      new Request(`https://blueagent.dev/api/hood/dislocation/spread${qs}`, { headers }),
    );
    const body = (await res.json()) as Body;
    // The route fires the meter with `void` so a metering stall can never delay
    // a market-data read — which means the write lands AFTER the response
    // resolves, and reading `fields` immediately would see an empty array and
    // call it a missing meter.
    await new Promise((r) => setTimeout(r, 20));
    return { status: res.status, body, fields };
  } finally {
    restore();
  }
}

/** The `venues.<name>` block, typed loosely because its shape is the assertion. */
const venue = (body: Body, name: "base" | "robinhood"): Body =>
  ((body.venues as Body | undefined)?.[name] ?? {}) as Body;

async function main(): Promise<void> {
  console.log("\nhood cross-venue spread endpoint — guards\n");

  // ── 1. Input contract: ticker required, chain REFUSED ───────────────────
  console.log("1. input contract");
  {
    const clean = pair({ dex_usd: 110 }, { dex_usd: 100 });

    const noTicker = await call("", clean);
    check("1.1 ticker omitted ⇒ 400", noTicker.status === 400, `status ${noTicker.status}`);
    check("1.2 …error code names the cause", noTicker.body.error === "missing_ticker", String(noTicker.body.error));
    check(
      "1.3 …and NO spread is reported at all",
      !("spread_pct" in noTicker.body),
      `body carried spread_pct=${JSON.stringify(noTicker.body.spread_pct)}`,
    );

    const blank = await call("?ticker=%20%20", clean);
    check("1.4 whitespace-only ticker ⇒ 400, not a lookup for \"  \"", blank.status === 400);

    // Refused, not ignored. A caller who sent `chain` believes they narrowed
    // something; this endpoint cannot narrow, and silently dropping the
    // parameter would let them keep believing it.
    for (const bad of ["base", "robinhood", "both", "8453", ""]) {
      const r = await call(`?ticker=AMZN&chain=${encodeURIComponent(bad)}`, clean);
      check(
        `1.5 chain=${JSON.stringify(bad)} ⇒ 400 chain_not_accepted (refused, not ignored)`,
        r.status === 400 && r.body.error === "chain_not_accepted",
        `status ${r.status}, error=${JSON.stringify(r.body.error)}`,
      );
      check(
        `1.6 chain=${JSON.stringify(bad)} ⇒ no spread smuggled into the refusal`,
        !("spread_pct" in r.body),
      );
    }
    // The refusal must point somewhere: a 400 that does not name the working
    // endpoint just moves the caller's confusion.
    check(
      "1.7 the refusal names the single-venue endpoint to use instead",
      /api\/hood\/dislocation\?ticker=/.test(String((await call("?ticker=AMZN&chain=base", clean)).body.message)),
    );

    const ok = await call("?ticker=AMZN", clean);
    check("1.8 a bare ticker is accepted", ok.status === 200, `status ${ok.status}`);
    const lower = await call("?ticker=amzn", clean);
    check("1.9 the ticker is case-normalised", lower.status === 200 && lower.body.ticker === "AMZN");
  }

  // ── 2. THE HEADLINE GUARD: same cycle, or no number ─────────────────────
  // A spread across two poll cycles is not a venue disagreement, it is a price
  // move wearing one. It must be refused, not computed-with-a-warning: a number
  // that is present is a number that gets used, and a caller sizing a trade
  // does not read the caveat.
  console.log("\n2. same-cycle honesty");
  {
    const same = await call("?ticker=AMZN", pair({ dex_usd: 110 }, { dex_usd: 100 }));
    check("2.1 one shared snapshot ⇒ same_cycle true", same.body.same_cycle === true);
    check("2.2 …and a spread IS computed", typeof same.body.spread_pct === "number", JSON.stringify(same.body.spread_pct));
    check("2.3 …with zero reported skew", same.body.cycle_skew_seconds === 0);
    check("2.4 …and no unavailable reason", same.body.spread_unavailable_reason === null);

    const skewed = await call("?ticker=AMZN", pair({ dex_usd: 110 }, { dex_usd: 100 }, { baseAgeS: 30, rhAgeS: 450 }));
    check("2.5 different cycles ⇒ same_cycle false", skewed.body.same_cycle === false);
    check(
      "2.6 different cycles ⇒ spread_pct is NULL, not a number",
      skewed.body.spread_pct === null,
      `got ${JSON.stringify(skewed.body.spread_pct)}`,
    );
    check(
      "2.7 …spread_abs_usd is null too (half a spread is not a spread)",
      skewed.body.spread_abs_usd === null,
      `got ${JSON.stringify(skewed.body.spread_abs_usd)}`,
    );
    check("2.8 …reason names the cause", skewed.body.spread_unavailable_reason === "cycle_skew");
    check(
      "2.9 …and the skew is quantified so the caller can see how bad it was",
      skewed.body.cycle_skew_seconds === 420,
      `got ${JSON.stringify(skewed.body.cycle_skew_seconds)}`,
    );

    // NO TOLERANCE. The desks share one `started_at` by construction, so any
    // difference at all is a different cycle. A tolerance would admit a
    // genuinely desynchronised pair exactly when the desync is small, which is
    // precisely when a price move and a venue disagreement are least
    // distinguishable. Sub-second skew therefore reports `cycle_skew_seconds: 0`
    // WITH `same_cycle: false` — not a contradiction, see the route.
    const ms = Date.now() - 30_000;
    const subSecond: KvMap = {
      [KV_BASE_ROWS_LATEST]: baseLatest([row({ chain: "base", dex_usd: 110 })], new Date(ms).toISOString()),
      [KV_SNAPSHOT_LATEST]: rhSnapshot([row({ chain: "robinhood", dex_usd: 100 })], new Date(ms + 40).toISOString()),
    };
    const sub = await call("?ticker=AMZN", subSecond);
    check(
      "2.10 a 40ms skew is STILL refused (identity, never a tolerance)",
      sub.body.spread_pct === null && sub.body.spread_unavailable_reason === "cycle_skew",
      `spread=${JSON.stringify(sub.body.spread_pct)} reason=${JSON.stringify(sub.body.spread_unavailable_reason)}`,
    );
    check(
      "2.11 …and it is honest about rounding to 0s while still saying same_cycle:false",
      sub.body.cycle_skew_seconds === 0 && sub.body.same_cycle === false,
      `skew=${JSON.stringify(sub.body.cycle_skew_seconds)} same=${JSON.stringify(sub.body.same_cycle)}`,
    );
    // Structural: the comparison is on the timestamps themselves, not on a
    // rounded delta. A tolerance would be written as a numeric comparison.
    check(
      "2.12 the route compares snapshot identity, not a skew threshold",
      /base\.snapshotAt === rh\.snapshotAt/.test(routeCode) &&
        !/cycleSkewSeconds\s*[<>]=?\s*\d/.test(routeCode),
    );

    // POSITIVE CONTROL — permanent, not a one-off manual mutation. 2.6 asserts
    // a value is null, and an assertion like that passes just as happily
    // against a route that stopped answering. Model the exact defect and prove
    // the assertion rejects it.
    const buggy = { spread_pct: 10, spread_abs_usd: 10, warning: "snapshots differ by 420s" };
    check("2.13 positive control: 2.6 REJECTS a computed-with-a-warning spread", !(buggy.spread_pct === null));
    const honest = { spread_pct: null, spread_abs_usd: null, spread_unavailable_reason: "cycle_skew" };
    check(
      "2.14 positive control: the same assertion ACCEPTS the honest shape",
      honest.spread_pct === null && honest.spread_unavailable_reason === "cycle_skew",
    );
  }

  // ── 3. The arithmetic — the one derived number in Blue Hood ─────────────
  // Expected values are hand computed from the fixtures and written as
  // literals. Re-deriving them with the route's own formula would only prove
  // the test and the code agree.
  console.log("\n3. the spread arithmetic");
  {
    const up = await call("?ticker=AMZN", pair({ dex_usd: 110, drift_pct: 1 }, { dex_usd: 100, drift_pct: 2 }));
    check("3.1 base above RH ⇒ +10% on a 110/100 pair", up.body.spread_pct === 10, JSON.stringify(up.body.spread_pct));
    check("3.2 …and the absolute gap is base minus RH", up.body.spread_abs_usd === 10, JSON.stringify(up.body.spread_abs_usd));

    const down = await call("?ticker=AMZN", pair({ dex_usd: 90, drift_pct: 0.5 }, { dex_usd: 100, drift_pct: 0.5 }));
    check("3.3 base BELOW RH ⇒ negative, sign preserved", down.body.spread_pct === -10, JSON.stringify(down.body.spread_pct));
    check("3.4 …and the absolute gap is negative too", down.body.spread_abs_usd === -10);

    // Two fixtures, two different answers: a hardcoded constant cannot satisfy
    // both, so this pins "derived" without re-deriving.
    const mid = await call("?ticker=AMZN", pair({ dex_usd: 105 }, { dex_usd: 100 }));
    check("3.5 a third fixture gives a third answer (the number is derived, not fixed)", mid.body.spread_pct === 5);

    check(
      "3.6 the sign convention is SHIPPED, never left to be inferred",
      up.body.spread_basis === "(base.dex_price_usd - robinhood.dex_price_usd) / robinhood.dex_price_usd * 100",
      String(up.body.spread_basis),
    );
    // The formula in the response must be the formula in the code. Published
    // as RH-denominated, so RH must be the divisor.
    check(
      "3.7 the code divides by the venue the basis string names",
      /\/\s*rhRow\.dex_usd\s*\)\s*\*\s*100/.test(routeCode),
    );

    // A zero denominator is the classic way a ratio becomes Infinity.
    //
    // 🔴 THE REASON FIELD IS WHAT CATCHES THIS, NOT THE NULL. Measured while
    // mutation-testing M11 (zero-guard removed): `JSON.stringify(Infinity)` is
    // `null`, so an Infinity that reaches the response serialiser arrives on the
    // wire looking EXACTLY like an honest "we could not measure it" — same type,
    // same value, no warning. The only thing that distinguishes a real refusal
    // from a laundered Infinity is that a refusal names its cause. Assert both
    // halves; the null alone is worth nothing here.
    const zero = await call("?ticker=AMZN", pair({ dex_usd: 110 }, { dex_usd: 0 }));
    check(
      "3.8 a zero RH price ⇒ refused by NAME, so a serialised Infinity cannot pass as an honest null",
      zero.body.spread_pct === null && zero.body.spread_unavailable_reason === "no_dex_price",
      `spread=${JSON.stringify(zero.body.spread_pct)} reason=${JSON.stringify(zero.body.spread_unavailable_reason)}`,
    );
    const noPrice = await call("?ticker=AMZN", pair({ dex_usd: null, no_data_reason: "no_pool" }, { dex_usd: 100 }));
    check(
      "3.9 a venue with no DEX price ⇒ no_dex_price, never a spread against null",
      noPrice.body.spread_pct === null && noPrice.body.spread_unavailable_reason === "no_dex_price",
      `reason=${JSON.stringify(noPrice.body.spread_unavailable_reason)}`,
    );
    // ⚠️ WEAKER THAN IT LOOKS, AND KEPT ANYWAY. `NextResponse.json` has already
    // turned any Infinity/NaN into `null` by the time this reads the body, so
    // this can never fail on a serialised response — 3.8 is the assertion that
    // actually defends the arithmetic. What this still buys is the case
    // serialisation does NOT launder: a number the route computed as finite
    // garbage. Left in place with the limitation stated, because a check whose
    // strength is misremembered is worse than one that is absent.
    check(
      "3.10 …and no non-finite number survives to the wire (see the caveat: 3.8 is the real guard)",
      !Object.values(up.body).some((v) => typeof v === "number" && !Number.isFinite(v)) &&
        !Object.values(zero.body).some((v) => typeof v === "number" && !Number.isFinite(v)),
    );

    // No LLM anywhere near a number. The repo rule is that verifiable facts come
    // from data sources and are computed in code.
    check("3.11 no LLM in the spread path", !/callLLM|callVirtualsLLM|callBankrLLM|callVeniceLLM/.test(routeSrc));
  }

  // ── 4. Three-state absence, at venue granularity ────────────────────────
  // 16 of 24 RH tickers are not listed on Base. "We do not watch it there" is a
  // third fact, distinct from "we looked and could not read it" (null) and from
  // "we measured it" (a number) — and it must be assertable from the wire.
  console.log("\n4. venue-level three-state");
  {
    const rhOnly: KvMap = {
      [KV_BASE_ROWS_LATEST]: baseLatest([row({ chain: "base", ticker: "NVDA" })], agoIso(30)),
      [KV_SNAPSHOT_LATEST]: rhSnapshot([row({ chain: "robinhood", ticker: "SGOV", dex_usd: 100 })], agoIso(30)),
    };
    const r = await call("?ticker=SGOV", rhOnly);
    const b = venue(r.body, "base");
    check("4.1 a venue not carrying the ticker ⇒ watched:false", b.watched === false, JSON.stringify(b.watched));
    check(
      "4.2 …and the price key is OMITTED, not null and certainly not 0",
      !("dex_price_usd" in b),
      `base block: ${JSON.stringify(b)}`,
    );
    check("4.3 …and no drift is invented for it either", !("drift_pct" in b));
    check(
      "4.4 …and the spread says which precondition failed",
      r.body.spread_unavailable_reason === "not_on_both_venues",
      String(r.body.spread_unavailable_reason),
    );
    check("4.5 …while the venue that DOES carry it still reports its numbers", venue(r.body, "robinhood").dex_price_usd === 100);

    const both = await call("?ticker=AMZN", pair({ dex_usd: 110 }, { dex_usd: 100 }));
    check("4.6 watched on both ⇒ watched:true on both sides", venue(both.body, "base").watched === true && venue(both.body, "robinhood").watched === true);

    const deskDown = await call("?ticker=AMZN", pair({ dex_usd: 110 }, { dex_usd: 100 }), {
      failKeys: [KV_BASE_ROWS_LATEST],
    });
    const dd = venue(deskDown.body, "base");
    check("4.7 an unreadable desk ⇒ watched:null (we do not know), not false", dd.watched === null, JSON.stringify(dd.watched));
    check("4.8 …flagged as unreadable, with the cause named", dd.unreadable === true && dd.reason === "kv_error");

    // The three states must be mutually distinguishable from the response alone.
    check(
      "4.9 the three venue states are distinguishable on the wire",
      b.watched === false &&
        !("dex_price_usd" in b) &&
        dd.watched === null &&
        venue(both.body, "base").watched === true,
    );
    // Structural: built by returning distinct objects, not by assigning nulls.
    check(
      "4.10 the route returns a bare { watched: false } rather than a nulled-out block",
      /return\s*\{\s*watched:\s*false\s*\}/.test(routeCode),
    );

    // #162 — a Base blob row with no chain marker must be DROPPED, not read as
    // Robinhood by `chainOf` and served on the Base side of a spread.
    const unattributed: KvMap = {
      [KV_BASE_ROWS_LATEST]: baseLatest([row({ ticker: "AMZN", dex_usd: 999 })], agoIso(30)),
      [KV_SNAPSHOT_LATEST]: rhSnapshot([row({ chain: "robinhood", ticker: "AMZN", dex_usd: 100 })], agoIso(30)),
    };
    const un = await call("?ticker=AMZN", unattributed);
    check(
      "4.11 an unattributed Base row is dropped, never served as the Base leg",
      venue(un.body, "base").watched === false && venue(un.body, "base").dex_price_usd === undefined,
      `base block: ${JSON.stringify(venue(un.body, "base"))}`,
    );
    check("4.12 …and it cannot leak into the spread", un.body.spread_pct === null);
    check("4.13 the route uses partitionBaseRows (#162), not chainOf, on the Base blob", /partitionBaseRows/.test(routeCode));
    check("4.14 and matchesChain on the RH rows, applied to the ROW not the query", /matchesChain\(r, "robinhood"\)/.test(routeCode));
  }

  // ── 5. A read failure is never a zero ───────────────────────────────────
  // `spread_pct: 0` reads as "measured, the venues agree" — the one sentence
  // this endpoint must never say when the truth is "we could not look".
  console.log("\n5. desk failure ⇒ null, never a fabricated zero");
  {
    for (const [label, failKeys] of [
      ["base down", [KV_BASE_ROWS_LATEST]],
      ["robinhood down", [KV_SNAPSHOT_LATEST]],
      ["both down", [KV_BASE_ROWS_LATEST, KV_SNAPSHOT_LATEST]],
    ] as const) {
      const r = await call("?ticker=AMZN", pair({ dex_usd: 110 }, { dex_usd: 100 }), { failKeys: [...failKeys] });
      check(`5.1 [${label}] spread_pct is null, NOT 0`, r.body.spread_pct === null, `got ${JSON.stringify(r.body.spread_pct)}`);
      check(`5.2 [${label}] spread_abs_usd is null, NOT 0`, r.body.spread_abs_usd === null, `got ${JSON.stringify(r.body.spread_abs_usd)}`);
      check(`5.3 [${label}] the reason is desk_unreadable`, r.body.spread_unavailable_reason === "desk_unreadable", String(r.body.spread_unavailable_reason));
      check(`5.4 [${label}] HTTP 200 with the truth, not a bare 5xx`, r.status === 200, `status ${r.status}`);
      // The leak this group was written for: one desk down, the other fresh,
      // and `stale` came back false because nothing was OLD.
      check(`5.5 [${label}] stale:true — an unreadable desk is not a fresh one`, r.body.stale === true, `stale=${JSON.stringify(r.body.stale)}`);
      check(`5.6 [${label}] …and the stale reason is kv_error`, r.body.stale_reason === "kv_error", String(r.body.stale_reason));
      check(
        `5.7 [${label}] no price is invented for the downed venue`,
        !Object.values(r.body.venues as Body).some(
          (v) => (v as Body).unreadable === true && typeof (v as Body).dex_price_usd === "number",
        ),
      );
      check(
        `5.8 [${label}] the wider-than-drift flag is null, NOT false`,
        r.body.spread_wider_than_either_oracle_drift === null,
        `got ${JSON.stringify(r.body.spread_wider_than_either_oracle_drift)}`,
      );
    }

    const never = await call("?ticker=AMZN", {});
    check("5.9 never-polled ⇒ null spread, reason desk_unreadable", never.body.spread_pct === null && never.body.spread_unavailable_reason === "desk_unreadable");
    check(
      "5.10 …and never_polled is kept DISTINCT from kv_error (coverage gap ≠ outage)",
      never.body.stale_reason === "never_polled",
      String(never.body.stale_reason),
    );

    // POSITIVE CONTROL, permanent. Same reasoning as 2.13.
    const buggy = { spread_pct: 0, spread_abs_usd: 0, spread_wider_than_either_oracle_drift: false, stale: false };
    check("5.11 positive control: 5.1 REJECTS a fabricated 0", !(buggy.spread_pct === null));
    check("5.12 positive control: 5.8 REJECTS a fabricated false", !(buggy.spread_wider_than_either_oracle_drift === null));
    check("5.13 positive control: 5.5 REJECTS stale:false on a failed read", !(buggy.stale === true));
  }

  // ── 6. The finding that motivated the endpoint ──────────────────────────
  // Do the two venues disagree with EACH OTHER more than either disagrees with
  // its own Chainlink feed? Measured true for 3 of 8 dual-listed tickers on
  // 2026-09-28. `null` whenever an input is missing — never `false`, which
  // reads as a measured "no".
  console.log("\n6. wider-than-either-oracle-drift");
  {
    const wider = await call("?ticker=AMZN", pair({ dex_usd: 110, drift_pct: 1 }, { dex_usd: 100, drift_pct: 2 }));
    check("6.1 spread 10% vs drifts 1%/2% ⇒ true", wider.body.spread_wider_than_either_oracle_drift === true);

    const narrower = await call("?ticker=AMZN", pair({ dex_usd: 105, drift_pct: 20 }, { dex_usd: 100, drift_pct: 30 }));
    check("6.2 spread 5% vs drifts 20%/30% ⇒ false (a measured no IS allowed)", narrower.body.spread_wider_than_either_oracle_drift === false);

    // Must beat BOTH, not the average and not just one.
    const straddle = await call("?ticker=AMZN", pair({ dex_usd: 105, drift_pct: 1 }, { dex_usd: 100, drift_pct: 30 }));
    check("6.3 wider than one drift but not the other ⇒ false", straddle.body.spread_wider_than_either_oracle_drift === false);

    // Magnitude, not sign: a −10% spread is just as wide as +10%.
    const neg = await call("?ticker=AMZN", pair({ dex_usd: 90, drift_pct: -1 }, { dex_usd: 100, drift_pct: 2 }));
    check("6.4 a NEGATIVE spread of the same magnitude still counts (abs on both sides)", neg.body.spread_wider_than_either_oracle_drift === true);

    const oneDriftMissing = await call("?ticker=AMZN", pair({ dex_usd: 110, drift_pct: null }, { dex_usd: 100, drift_pct: 2 }));
    check(
      "6.5 a missing drift ⇒ null, never false (\"unknown\" ≠ \"no\")",
      oneDriftMissing.body.spread_wider_than_either_oracle_drift === null,
      `got ${JSON.stringify(oneDriftMissing.body.spread_wider_than_either_oracle_drift)}`,
    );
    const skewNull = await call("?ticker=AMZN", pair({ dex_usd: 110, drift_pct: 1 }, { dex_usd: 100, drift_pct: 2 }, { baseAgeS: 30, rhAgeS: 400 }));
    check("6.6 no spread ⇒ the flag is null too, never inherited from a stale compute", skewNull.body.spread_wider_than_either_oracle_drift === null);
  }

  // ── 7. Staleness is measured from the STALER leg ────────────────────────
  // A spread is only as fresh as its older half. Reporting the newer one would
  // overstate freshness at exactly the moment the two desks desynchronise.
  console.log("\n7. staleness from the older leg");
  {
    check(
      "7.1 the window is at least one poll interval (so anything called stale IS overdue)",
      HEALTHY_MAX_AGE_S >= POLL_INTERVAL_S,
      `HEALTHY_MAX_AGE_S=${HEALTHY_MAX_AGE_S} POLL_INTERVAL_S=${POLL_INTERVAL_S}`,
    );
    check(
      "7.2 the route IMPORTS the window rather than hardcoding a second number",
      /HEALTHY_MAX_AGE_S/.test(routeCode) && /from "@\/lib\/blue-hood\/health"/.test(routeCode),
    );

    const fresh = await call("?ticker=AMZN", pair({ dex_usd: 110 }, { dex_usd: 100 }, { ageS: 30 }));
    check("7.3 both legs fresh ⇒ stale:false", fresh.body.stale === false, `stale=${JSON.stringify(fresh.body.stale)}`);
    check("7.4 …with no stale reason", fresh.body.stale_reason === null);
    check(
      "7.5 …and the age of the staler leg is stated",
      nearSeconds(fresh.body.oldest_snapshot_age_seconds, 30),
      `got ${JSON.stringify(fresh.body.oldest_snapshot_age_seconds)}, expected ~30`,
    );
    check("7.6 every response publishes the window it used", fresh.body.stale_after_seconds === HEALTHY_MAX_AGE_S);

    // The mutation this pins: measuring the NEWER leg. Base is fresh, RH is
    // well past the window — a route reading `Math.max` would say fresh.
    const oldRh = await call(
      "?ticker=AMZN",
      pair({ dex_usd: 110 }, { dex_usd: 100 }, { baseAgeS: 10, rhAgeS: HEALTHY_MAX_AGE_S + 600 }),
    );
    check(
      "7.7 one leg past the window ⇒ stale:true even though the other is fresh",
      oldRh.body.stale === true,
      `stale=${JSON.stringify(oldRh.body.stale)}`,
    );
    // The two legs are 600s+ apart on purpose: the window below is 3s, so this
    // cannot pass by accident if the route read the wrong one.
    check(
      "7.8 …and the reported age is the OLDER leg's, not the newer one's",
      nearSeconds(oldRh.body.oldest_snapshot_age_seconds, HEALTHY_MAX_AGE_S + 600),
      `got ${JSON.stringify(oldRh.body.oldest_snapshot_age_seconds)}, expected ~${HEALTHY_MAX_AGE_S + 600}`,
    );
    // Structural backstop: `Math.max` on the two timestamps is the defect.
    check("7.9 the route takes the MINIMUM timestamp (the oldest), not the maximum", /Math\.min\(baseMs, rhMs\)/.test(routeCode));

    // Both desks fresh but from different cycles is a real state, and it must
    // not be laundered into "stale" — the spread is refused for skew, and
    // staleness is a separate, independently true fact.
    check(
      "7.10 skew alone does not make a fresh pair 'stale' (the two facts stay separate)",
      skewIsNotStale(await call("?ticker=AMZN", pair({ dex_usd: 110 }, { dex_usd: 100 }, { baseAgeS: 20, rhAgeS: 60 }))),
    );
  }

  // ── 8. Metering, with its own chain dimension ───────────────────────────
  // This is the first Blue Hood surface meant to be SOLD, so an uncounted call
  // is an uninvoiceable one. `both` is a distinct product line from two
  // single-venue reads: filing it under `base` would bill a venue the caller
  // never asked about.
  console.log("\n8. the meter records 'both', and records it once");
  {
    const RAW_KEY = "pilot-secret-key-do-not-store";
    const h = hashApiKey(RAW_KEY);
    const clean = pair({ dex_usd: 110, drift_pct: 1 }, { dex_usd: 100, drift_pct: 2 });

    const ok = await call("?ticker=AMZN", clean, { key: RAW_KEY });
    check("8.1 a served answer is metered exactly once", ok.fields.length === 1, JSON.stringify(ok.fields));
    check(
      "8.2 …under the caller's hashed key, chain 'both', outcome ok",
      ok.fields[0] === `${h}|both|ok`,
      `got ${JSON.stringify(ok.fields[0])}`,
    );
    check("8.3 …and the RAW key is nowhere in what gets stored", !ok.fields.some((f) => f.includes(RAW_KEY)));
    check(
      "8.4 …and it is NOT filed under either single venue",
      !ok.fields.some((f) => f.includes("|base|") || f.includes("|robinhood|")),
      JSON.stringify(ok.fields),
    );

    const refused = await call("?ticker=AMZN&chain=base", clean, { key: RAW_KEY });
    check(
      "8.5 a 400 is metered too, so a customer hammering a refusal is not invisible",
      refused.status === 400 && refused.fields[0] === `${h}|both|rejected`,
      `status ${refused.status} fields ${JSON.stringify(refused.fields)}`,
    );

    const down = await call("?ticker=AMZN", clean, { key: RAW_KEY, failKeys: [KV_SNAPSHOT_LATEST] });
    check(
      "8.6 a desk failure is metered as 'stale', not dropped and not 'ok'",
      down.fields[0] === `${h}|both|stale`,
      JSON.stringify(down.fields),
    );
    const skew = await call("?ticker=AMZN", pair({ dex_usd: 110 }, { dex_usd: 100 }, { baseAgeS: 20, rhAgeS: 500 }), { key: RAW_KEY });
    check(
      "8.7 a refused-for-skew answer is metered 'stale' — served, but not a usable number",
      skew.fields[0] === `${h}|both|stale`,
      JSON.stringify(skew.fields),
    );

    const anon = await call("?ticker=AMZN", clean);
    check("8.8 a keyless caller is counted separately, not folded into a customer", anon.fields[0] === `${ANON_KEY_HASH}|both|ok`, JSON.stringify(anon.fields));

    // POSITIVE CONTROL. Every assertion above is "the recorder saw X" and would
    // pass vacuously against a recorder that saw nothing — which is exactly
    // what a route with the meter deleted produces.
    const silentFields: string[] = [];
    const restore = patchKv(clean, {}, silentFields);
    restore();
    check("8.9 positive control: the recorder reports an EMPTY list when nothing meters", silentFields.length === 0);
    check("8.10 positive control: an empty list fails the 8.1 assertion", !(silentFields.length === 1));
  }

  // ── 9. Scope: read-only, unpriced, unadvertised ─────────────────────────
  // The spec fixed the blast radius at zero. These are the properties a later
  // "just add…" quietly removes.
  console.log("\n9. scope stays where the spec put it");
  {
    check("9.1 no payment/x402 in the route", !/x402|settle|X-PAYMENT|payTo/i.test(routeSrc));
    check("9.2 no signing or wallet use", !/privateKey|signer|walletClient|sendTransaction/i.test(routeSrc));
    check("9.3 no CRON_SECRET or auth gate", !/CRON_SECRET|authorize|requireAuth/i.test(routeSrc));
    check("9.4 GET only — no mutation verb exported", !/export async function (POST|PUT|PATCH|DELETE)/.test(routeSrc));
    check(
      "9.5 never CDN-cached (a cached spread is a spread that is no longer true)",
      /no-store/.test(routeCode) && !/s-maxage/.test(routeCode),
    );
    check("9.6 metering is per-key from day one", /recordDislocationCall/.test(routeCode));
    check("9.7 no KV WRITE to the desks — this endpoint only reads them", !/kvSet|kv\.set|kvMutate/.test(routeCode));

    // It must stay a separate route. Teaching the per-ticker endpoint a third
    // `chain` value would weaken the #206 guard and give one URL two
    // incompatible response shapes.
    const siblingSrc = read("src/app/api/hood/dislocation/route.ts");
    check(
      "9.8 the sibling endpoint still refuses unknown chains (no 'both' was taught to it)",
      /parseHoodChain/.test(siblingSrc) && !/"both"/.test(stripComments(siblingSrc)),
    );
    check(
      "9.9 both endpoints share ONE staleness constant, so they cannot disagree",
      /HEALTHY_MAX_AGE_S/.test(stripComments(siblingSrc)) && /HEALTHY_MAX_AGE_S/.test(routeCode),
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

/**
 * 7.10's assertion, extracted only because it is a claim about two fields at
 * once and reads as a contradiction inline: a pair that is fresh but skewed
 * must report `stale: false` (nothing is old) AND refuse the spread (the legs
 * are not comparable). Collapsing either into the other would lose a fact.
 */
function skewIsNotStale(r: { body: Body }): boolean {
  return (
    r.body.stale === false &&
    r.body.stale_reason === null &&
    r.body.spread_pct === null &&
    r.body.spread_unavailable_reason === "cycle_skew"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
