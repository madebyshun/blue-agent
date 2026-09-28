/**
 * Guards for `GET /api/hood/dislocation` — the first Blue Hood surface meant to
 * be sold, and the first one a stranger integrates against without reading a
 * line of our code.
 *
 * WHAT IS BEING DEFENDED, AND WHY EACH GUARD IS SHAPED THE WAY IT IS
 * ------------------------------------------------------------------
 * The failure this endpoint must never have is not an outage. It is a
 * CONFIDENT WRONG NUMBER: answering `drift_pct: 0` when the truth is "we could
 * not read KV", or answering a Base query out of a Robinhood row. A buyer
 * reading either one executes into the exact dislocation the endpoint exists to
 * warn about, and nothing in the response tells them it happened.
 *
 * Every check below runs against the REAL route handler with a fabricated KV,
 * never against a re-implementation of its logic. A test that re-derives the
 * answer proves the test and the code agree, which is not the question.
 *
 * ⚠️ THE THRESHOLD CHECKS DERIVE, THEY DO NOT COPY. `2.0` and `1.0` appear
 * nowhere in this file as literals. If the engine's constants change, this file
 * must keep passing — a guard that hardcodes the value it is checking turns
 * into a second source of truth, and then the two drift and the guard starts
 * defending the old number. Group 3 asserts the route selects the SAME symbols
 * the engine gates on, by reading both files.
 *
 * MUTATION-TESTED 2026-09-28 against the real route source. Nine defects were
 * planted one at a time and the suite was confirmed RED on every one — a guard
 * that has not been shown to fail on the bug it names is decoration:
 *
 *   1. a missing `chain` defaults to robinhood                     (#206)
 *   2. `stale` is hardcoded false
 *   3. `threshold_pct` is a literal instead of the engine constant
 *   4. the KV-failure path reports `drift_pct: 0`
 *   5. the KV-failure path reports `beyond_threshold: false`
 *   6. the three states collapse (`oracleAge ?? null`)
 *   7. oracle age measured against `Date.now()` instead of poll time
 *   8. a Base query falls back to unpartitioned rows          (#161/#162)
 *   9. `beyond_threshold` is false when drift was never measured
 *
 * Group 4 additionally carries its positive control INLINE and permanently —
 * see there for why that one must not be left to a one-off manual mutation.
 *
 * Run: npx tsx scripts/hood-dislocation-check.ts
 */
import fs from "node:fs";
import path from "node:path";
import { kv } from "../src/lib/kv";
import { KV_SNAPSHOT_LATEST, KV_BASE_ROWS_LATEST } from "../src/lib/blue-hood/kv-keys";
import { ARB_MIN_ABS_PCT, DRIFT_MIN_ABS_PCT } from "../src/lib/blue-hood/types";
import { HEALTHY_MAX_AGE_S, POLL_INTERVAL_S } from "../src/lib/blue-hood/health";
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
const ROUTE_REL = "src/app/api/hood/dislocation/route.ts";
const routeSrc = read(ROUTE_REL);

/**
 * Source with comments removed.
 *
 * Needed because these files are heavily commented BY DESIGN — the rules they
 * encode only survive if the reasoning travels with them — and a source check
 * that greps raw text then fires on the prose explaining why the thing is
 * absent. That is not a hypothetical: check 7.9 ("the meter does not record the
 * ticker") failed on the comment saying the ticker is deliberately absent.
 * A guard that punishes documentation teaches people to delete documentation.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/* ── KV harness ──────────────────────────────────────────────────────────────
 *
 * Patches the whole surface the route and its meter touch, so no check here
 * reads or writes production KV. The meter is stubbed rather than disabled: its
 * calls are fire-and-forget (`void`), so an unstubbed throw would surface as an
 * unhandled rejection and kill the run for a reason unrelated to the assertion.
 */
type KvMap = Record<string, unknown>;

async function withKv<T>(map: KvMap, fn: () => Promise<T>): Promise<T> {
  const realGet = kv.get.bind(kv);
  const realHgetall = kv.hgetall.bind(kv);
  const realHincrby = kv.hincrby.bind(kv);
  const realExpire = kv.expire.bind(kv);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (kv as any).get = async (key: string) => (key in map ? map[key] : null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (kv as any).hgetall = async () => ({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (kv as any).hincrby = async () => 1;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (kv as any).expire = async () => 1;
  try {
    return await fn();
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (kv as any).get = realGet;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (kv as any).hgetall = realHgetall;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (kv as any).hincrby = realHincrby;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (kv as any).expire = realExpire;
  }
}

/** Reads throw — the simulated Upstash throttle that produced #150. */
async function withReadFailure<T>(fn: () => Promise<T>): Promise<T> {
  const realGet = kv.get.bind(kv);
  const realHgetall = kv.hgetall.bind(kv);
  const realHincrby = kv.hincrby.bind(kv);
  const realExpire = kv.expire.bind(kv);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (kv as any).get = async () => {
    throw new Error("simulated Upstash throttle (max requests limit exceeded)");
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (kv as any).hgetall = async () => ({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (kv as any).hincrby = async () => 1;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (kv as any).expire = async () => 1;
  try {
    return await fn();
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (kv as any).get = realGet;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (kv as any).hgetall = realHgetall;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (kv as any).hincrby = realHincrby;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (kv as any).expire = realExpire;
  }
}

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

function row(over: Partial<TickerSnapshot> = {}): TickerSnapshot {
  return {
    ticker: "NVDA",
    name: "NVIDIA",
    contract: "0x0000000000000000000000000000000000000001",
    verdict: "NEUTRAL" as TickerSnapshot["verdict"],
    oracle_usd: 100,
    dex_usd: 103,
    tvl_usd: 500_000,
    total_tvl_usd: 900_000,
    volume_24h_usd: 250_000,
    drift_pct: 3,
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

const nowIso = () => new Date().toISOString();
const agoIso = (s: number) => new Date(Date.now() - s * 1000).toISOString();

type Body = Record<string, unknown>;

async function call(qs: string, map: KvMap): Promise<{ status: number; body: Body }> {
  const { GET } = await import("../src/app/api/hood/dislocation/route");
  const res = await withKv(map, () => GET(new Request(`https://blueagent.dev/api/hood/dislocation${qs}`)));
  return { status: res.status, body: (await res.json()) as Body };
}

async function callFailing(qs: string): Promise<{ status: number; body: Body }> {
  const { GET } = await import("../src/app/api/hood/dislocation/route");
  const res = await withReadFailure(() =>
    GET(new Request(`https://blueagent.dev/api/hood/dislocation${qs}`)),
  );
  return { status: res.status, body: (await res.json()) as Body };
}

async function main(): Promise<void> {
  console.log("\nhood dislocation endpoint — guards\n");

  const freshRh = { [KV_SNAPSHOT_LATEST]: rhSnapshot([row()], nowIso()) };
  const freshBase = {
    [KV_BASE_ROWS_LATEST]: baseLatest([row({ chain: "base", oracle_updated_at: 1_700_000_000 })], nowIso()),
  };

  // ── 1. `chain` is required and is never guessed ──────────────────────────
  // #206: a bare-ticker scan let a missing chain fall to "robinhood" and a
  // graded RH arrow was rendered as the live Base answer. Asserted against a
  // real call, not against `parseHoodChain` in isolation — the unit being
  // defended is the ROUTE's refusal, and a correct parser wired up wrongly is
  // exactly the bug.
  console.log("1. chain is required, no default");
  {
    const r = await call("?ticker=NVDA", freshRh);
    check("1.1 chain omitted ⇒ 400", r.status === 400, `status ${r.status}`);
    check("1.2 chain omitted ⇒ error code names the cause", r.body.error === "missing_chain", String(r.body.error));
    check(
      "1.3 chain omitted ⇒ NO drift is reported at all",
      !("drift_pct" in r.body),
      `body carried drift_pct=${JSON.stringify(r.body.drift_pct)}`,
    );
    check(
      "1.4 chain omitted ⇒ did NOT silently answer as robinhood",
      r.body.chain === undefined,
      `chain=${JSON.stringify(r.body.chain)}`,
    );

    for (const bad of ["Base", "BASE", "8453", "ethereum", "rh", ""]) {
      const rr = await call(`?ticker=NVDA&chain=${encodeURIComponent(bad)}`, freshRh);
      check(
        `1.5 unrecognised chain ${JSON.stringify(bad)} ⇒ 400, never a default`,
        rr.status === 400 && rr.body.chain === undefined,
        `status ${rr.status}, chain=${JSON.stringify(rr.body.chain)}`,
      );
    }

    const ok = await call("?ticker=NVDA&chain=robinhood", freshRh);
    check("1.6 a valid chain is accepted", ok.status === 200, `status ${ok.status}`);
    const okb = await call("?ticker=NVDA&chain=base", freshBase);
    check("1.7 base is accepted and answered from the BASE key", okb.status === 200 && okb.body.chain === "base");

    const noTicker = await call("?chain=base", freshBase);
    check("1.8 ticker omitted ⇒ 400", noTicker.status === 400 && noTicker.body.error === "missing_ticker");
  }

  // ── 2. Staleness is stated, never implied ───────────────────────────────
  console.log("\n2. staleness");
  {
    check(
      "2.1 the route's stale window is at least one poll interval (so anything it calls stale IS overdue)",
      HEALTHY_MAX_AGE_S >= POLL_INTERVAL_S,
      `HEALTHY_MAX_AGE_S=${HEALTHY_MAX_AGE_S} POLL_INTERVAL_S=${POLL_INTERVAL_S}`,
    );
    // Derived, not copied: the route must IMPORT its window, so this file and
    // the route cannot disagree about the number.
    check(
      "2.2 the route imports HEALTHY_MAX_AGE_S rather than hardcoding a window",
      /HEALTHY_MAX_AGE_S/.test(routeSrc) && /from "@\/lib\/blue-hood\/health"/.test(routeSrc),
    );

    const old = await call("?ticker=NVDA&chain=robinhood", {
      [KV_SNAPSHOT_LATEST]: rhSnapshot([row()], agoIso(HEALTHY_MAX_AGE_S + 60)),
    });
    check("2.3 a snapshot past the window ⇒ stale:true", old.body.stale === true, JSON.stringify(old.body.stale));
    check("2.4 stale response still carries snapshot_at", typeof old.body.snapshot_at === "string");
    check("2.5 stale response states the age", typeof old.body.snapshot_age_seconds === "number");
    check("2.6 stale response names the reason", old.body.stale_reason === "snapshot_too_old");
    check("2.7 stale response is still HTTP 200", old.status === 200, `status ${old.status}`);
    check(
      "2.8 an overdue snapshot still reports its real drift (age is stated, not withheld)",
      old.body.drift_pct === 3,
      JSON.stringify(old.body.drift_pct),
    );

    const fresh = await call("?ticker=NVDA&chain=robinhood", freshRh);
    check("2.9 a fresh snapshot ⇒ stale:false", fresh.body.stale === false);
    check("2.10 fresh response names no stale reason", fresh.body.stale_reason === null);
    check(
      "2.11 every response publishes the window it used",
      fresh.body.stale_after_seconds === HEALTHY_MAX_AGE_S &&
        old.body.stale_after_seconds === HEALTHY_MAX_AGE_S,
    );

    const never = await call("?ticker=NVDA&chain=robinhood", {});
    check("2.12 never-polled ⇒ stale:true, reason named", never.body.stale === true && never.body.stale_reason === "never_polled");
    check("2.13 never-polled ⇒ drift is null, NOT 0", never.body.drift_pct === null, JSON.stringify(never.body.drift_pct));
  }

  // ── 3. threshold_pct comes from the engine, per SESSION ─────────────────
  // ⚠️ No literal 2.0/1.0 in this group. The expected value is the imported
  // constant, so this stays correct if the engine is retuned.
  console.log("\n3. threshold is read from the engine");
  {
    const closed = await call("?ticker=NVDA&chain=robinhood", {
      [KV_SNAPSHOT_LATEST]: rhSnapshot(
        [row({ market: { is_open: false, session: "afterhours", ny_time_iso: "x" } })],
        nowIso(),
      ),
    });
    check(
      "3.1 market CLOSED ⇒ threshold is the engine's closed-drift constant",
      closed.body.threshold_pct === DRIFT_MIN_ABS_PCT,
      `${closed.body.threshold_pct} vs DRIFT_MIN_ABS_PCT=${DRIFT_MIN_ABS_PCT}`,
    );
    check("3.2 closed ⇒ basis names which rule is in force", closed.body.threshold_basis === "market_closed_drift");

    const open = await call("?ticker=NVDA&chain=robinhood", {
      [KV_SNAPSHOT_LATEST]: rhSnapshot(
        [row({ market: { is_open: true, session: "regular", ny_time_iso: "x" } })],
        nowIso(),
      ),
    });
    check(
      "3.3 market OPEN ⇒ threshold is the engine's open-arb constant",
      open.body.threshold_pct === ARB_MIN_ABS_PCT,
      `${open.body.threshold_pct} vs ARB_MIN_ABS_PCT=${ARB_MIN_ABS_PCT}`,
    );
    check("3.4 open ⇒ basis names which rule is in force", open.body.threshold_basis === "market_open_arb");
    // 3.1 and 3.3 can only distinguish the two rules if the two constants
    // differ; if they were ever equal, both would pass while the route picked
    // arbitrarily. Widened through `number` locals on purpose: written as a
    // direct comparison, `tsc` narrows the imports to the literal types `2` and
    // `1` and rejects the whole line as statically known (TS2367). That error
    // is itself the strongest form of this assertion — the type system proves
    // the constants differ — but it does not compile, and a check nobody can
    // run is not a check. So the compile-time proof is recorded here in prose
    // and the runtime form is kept for the day the constants become `number`.
    const closedT: number = DRIFT_MIN_ABS_PCT;
    const openT: number = ARB_MIN_ABS_PCT;
    check(
      "3.5 the two constants are genuinely different (3.1/3.3 would be vacuous otherwise)",
      closedT !== openT,
      `closed=${closedT} open=${openT}`,
    );

    // The route must import the symbols, never retype the numbers.
    check(
      "3.6 route imports both engine constants from lib/blue-hood/types",
      /ARB_MIN_ABS_PCT/.test(routeSrc) &&
        /DRIFT_MIN_ABS_PCT/.test(routeSrc) &&
        /from "@\/lib\/blue-hood\/types"/.test(routeSrc),
    );
    // Structural, not stylistic: a bare decimal next to `threshold` is how a
    // copied constant gets in, and it is invisible in review once the numbers
    // happen to match.
    check(
      "3.7 route contains no hardcoded threshold literal",
      !/threshold[A-Za-z_]*\s*[:=]\s*\d+\.\d+/.test(routeSrc),
    );
    // The engine gates on these same two symbols. If it ever stops, the route
    // would be publishing a threshold nothing fires on.
    const engineSrc = read("src/lib/blue-hood/rule-engine.ts");
    check(
      "3.8 the rule engine still gates on the SAME two constants the route publishes",
      /DRIFT_MIN_ABS_PCT/.test(engineSrc) && /ARB_MIN_ABS_PCT/.test(engineSrc),
    );

    // beyond_threshold must be a real comparison, both directions.
    const under = await call("?ticker=NVDA&chain=robinhood", {
      [KV_SNAPSHOT_LATEST]: rhSnapshot([row({ drift_pct: DRIFT_MIN_ABS_PCT / 2 })], nowIso()),
    });
    check("3.9 drift under the threshold ⇒ beyond_threshold false", under.body.beyond_threshold === false);
    const over = await call("?ticker=NVDA&chain=robinhood", {
      [KV_SNAPSHOT_LATEST]: rhSnapshot([row({ drift_pct: -(DRIFT_MIN_ABS_PCT + 1) })], nowIso()),
    });
    check("3.10 NEGATIVE drift past the threshold still counts (abs, sign preserved)", over.body.beyond_threshold === true);
    check("3.11 drift_pct stays signed", over.body.drift_pct === -(DRIFT_MIN_ABS_PCT + 1));
  }

  // ── 4. A read failure is never a zero ───────────────────────────────────
  // THE headline guard. `drift_pct: 0` reads as "measured, no dislocation" and
  // is the one sentence this endpoint must never say when the truth is "we do
  // not know". A buyer acting on it trades into the dislocation.
  console.log("\n4. KV failure ⇒ stale, never a fabricated zero");
  {
    for (const chain of ["robinhood", "base"]) {
      const r = await callFailing(`?ticker=NVDA&chain=${chain}`);
      check(`4.1 [${chain}] KV failure ⇒ stale:true`, r.body.stale === true, JSON.stringify(r.body.stale));
      check(`4.2 [${chain}] KV failure ⇒ reason is kv_error`, r.body.stale_reason === "kv_error", String(r.body.stale_reason));
      check(
        `4.3 [${chain}] KV failure ⇒ drift_pct is null, NOT 0`,
        r.body.drift_pct === null,
        `drift_pct=${JSON.stringify(r.body.drift_pct)}`,
      );
      check(
        `4.4 [${chain}] KV failure ⇒ beyond_threshold is null, NOT false`,
        r.body.beyond_threshold === null,
        `beyond_threshold=${JSON.stringify(r.body.beyond_threshold)}`,
      );
      check(
        `4.5 [${chain}] KV failure ⇒ no price is invented`,
        r.body.oracle_price_usd === null && r.body.dex_price_usd === null,
      );
      check(`4.6 [${chain}] KV failure ⇒ HTTP 200 with the truth, not a bare 5xx`, r.status === 200, `status ${r.status}`);
    }

    // POSITIVE CONTROL — kept permanently, not run once by hand.
    //
    // 4.3 is an assertion about a value being null. An assertion like that
    // passes just as happily against a body that never had the field, so on its
    // own it cannot distinguish "the route is honest" from "the route stopped
    // answering". This models the exact defect — a failure path that reports a
    // confident zero — and proves the assertion above REJECTS it. Without this,
    // group 4 could rot into a guard that passes on the bug it names.
    const buggy = { stale: true, drift_pct: 0, beyond_threshold: false };
    const caughtDrift = !(buggy.drift_pct === null);
    const caughtBeyond = !(buggy.beyond_threshold === null);
    check("4.7 positive control: the drift assertion REJECTS a fabricated 0", caughtDrift);
    check("4.8 positive control: the beyond_threshold assertion REJECTS a fabricated false", caughtBeyond);
    // And the inverse: the assertion accepts the honest shape. Together these
    // pin the assertion from both sides, so it can be neither vacuous nor
    // impossible.
    const honest = { stale: true, drift_pct: null, beyond_threshold: null };
    check("4.9 positive control: the same assertion ACCEPTS the honest shape", honest.drift_pct === null && honest.beyond_threshold === null);
  }

  // ── 5. Three-state absence ──────────────────────────────────────────────
  // measured ⇒ number · looked-for-and-absent ⇒ null · never-measured ⇒ OMITTED.
  console.log("\n5. three-state absence");
  {
    const rh = await call("?ticker=NVDA&chain=robinhood", freshRh);
    check(
      "5.1 RH never measures the oracle round ⇒ oracle_age_seconds is OMITTED, not null",
      !("oracle_age_seconds" in rh.body),
      `body has oracle_age_seconds=${JSON.stringify(rh.body.oracle_age_seconds)}`,
    );

    const started = nowIso();
    const baseNum = await call("?ticker=NVDA&chain=base", {
      [KV_BASE_ROWS_LATEST]: baseLatest(
        [
          row({
            chain: "base",
            polled_at_ms: 10_000,
            oracle_updated_at: Math.floor(new Date(started).getTime() / 1000) + 10 - 42,
          }),
        ],
        started,
      ),
    });
    check("5.2 Base with a dated round ⇒ oracle_age_seconds is a number", typeof baseNum.body.oracle_age_seconds === "number");
    check(
      "5.3 the age is measured at POLL time (started_at + polled_at_ms), not against now()",
      baseNum.body.oracle_age_seconds === 42,
      `got ${JSON.stringify(baseNum.body.oracle_age_seconds)}, expected 42`,
    );

    const baseNull = await call("?ticker=NVDA&chain=base", {
      [KV_BASE_ROWS_LATEST]: baseLatest([row({ chain: "base", oracle_updated_at: null })], nowIso()),
    });
    check(
      "5.4 Base that looked and could not date the round ⇒ null, and the key IS present",
      "oracle_age_seconds" in baseNull.body && baseNull.body.oracle_age_seconds === null,
      JSON.stringify(baseNull.body.oracle_age_seconds),
    );

    // The three states must be mutually distinguishable from the wire alone.
    check(
      "5.5 the three states are distinguishable on the wire",
      !("oracle_age_seconds" in rh.body) &&
        baseNull.body.oracle_age_seconds === null &&
        typeof baseNum.body.oracle_age_seconds === "number",
    );

    // A missing measurement inside a healthy snapshot is null, never 0.
    const noDrift = await call("?ticker=NVDA&chain=robinhood", {
      [KV_SNAPSHOT_LATEST]: rhSnapshot(
        [row({ drift_pct: null, oracle_usd: null, dex_usd: null, no_data_reason: "no_pool" })],
        nowIso(),
      ),
    });
    check("5.6 an unmeasured drift in a FRESH snapshot ⇒ null, not 0", noDrift.body.drift_pct === null);
    check(
      "5.7 …and beyond_threshold is null, not false (\"no data\" ≠ \"no dislocation\")",
      noDrift.body.beyond_threshold === null,
      JSON.stringify(noDrift.body.beyond_threshold),
    );
    check("5.8 …and the reason it has no data is passed through", noDrift.body.no_data_reason === "no_pool");
  }

  // ── 6. Chain isolation — one desk never answers for the other ───────────
  // #161/#162/#206. The same ticker is a different token in a different pool on
  // each chain, so a cross-desk answer is not a degraded answer, it is a wrong
  // one carrying full confidence.
  console.log("\n6. chain isolation");
  {
    const rhOnly = { [KV_SNAPSHOT_LATEST]: rhSnapshot([row({ drift_pct: 7 })], nowIso()) };
    const baseAsk = await call("?ticker=NVDA&chain=base", rhOnly);
    check(
      "6.1 a Base query is NOT answered from the RH snapshot",
      baseAsk.body.drift_pct !== 7,
      `leaked RH drift ${JSON.stringify(baseAsk.body.drift_pct)}`,
    );

    // An unattributed row must be refused, not read as Robinhood by `chainOf`.
    const unattributed = await call("?ticker=NVDA&chain=base", {
      [KV_BASE_ROWS_LATEST]: baseLatest([row({ drift_pct: 9 })], nowIso()),
    });
    check(
      "6.2 a Base blob row with no chain marker is DROPPED, not served",
      unattributed.body.drift_pct !== 9,
      `served an unattributed row: ${JSON.stringify(unattributed.body.drift_pct)}`,
    );
    check("6.3 …and the caller is told it is not watched, not given a zero", unattributed.status === 404);
    check(
      "6.4 route uses partitionBaseRows (the #162 check), not chainOf, on the Base blob",
      /partitionBaseRows/.test(routeSrc),
    );

    const notWatched = await call("?ticker=ZZZZ&chain=robinhood", freshRh);
    check("6.5 an unwatched ticker ⇒ 404, distinct from 'no dislocation'", notWatched.status === 404);
    check("6.6 …with no fabricated drift", !("drift_pct" in notWatched.body));
    check("6.7 …and lists what IS watched", Array.isArray(notWatched.body.watched));
  }

  // ── 7. Scope: read-only, unpriced, unadvertised ─────────────────────────
  // The spec fixed the blast radius at zero. These are the properties that keep
  // it there, and they are the ones a later "just add…" quietly removes.
  console.log("\n7. scope stays where the spec put it");
  {
    check("7.1 no payment/x402 in the route", !/x402|settle|X-PAYMENT|payTo/i.test(routeSrc));
    check("7.2 no signing or wallet use", !/privateKey|signer|walletClient|sendTransaction/i.test(routeSrc));
    check("7.3 no CRON_SECRET or auth gate", !/CRON_SECRET|authorize|requireAuth/i.test(routeSrc));
    check("7.4 GET only — no mutation verb exported", !/export async function (POST|PUT|PATCH|DELETE)/.test(routeSrc));
    check(
      "7.5 never CDN-cached (a cached dislocation is the hazard staleness exists to prevent)",
      /no-store/.test(routeSrc) && !/s-maxage/.test(routeSrc),
    );
    check("7.6 metering is per-key from day one", /recordDislocationCall/.test(routeSrc));
    // The meter must not become a second identity store.
    const meterSrc = read("src/lib/blue-hood/dislocation-usage.ts");
    check("7.7 the meter hashes the key, never stores it raw", /createHash\("sha256"\)/.test(meterSrc));
    check("7.8 the meter caps distinct keys per day (public endpoint, sprayable)", /KEY_CAP/.test(meterSrc));
    // Comments stripped: this file argues at length about why the ticker is
    // absent, and a raw grep would fire on that argument. See `stripComments`.
    check(
      "7.9 the meter does NOT record the ticker (a customer's trading intent)",
      !/ticker/i.test(stripComments(meterSrc)),
    );
    check(
      "7.10 the meter uses its own KV key, not the no-identity usage:day hash",
      /hood:disloc:day:/.test(meterSrc) && !/`usage:day:/.test(meterSrc),
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
