/**
 * Blue Hood — 2.1 Alert Engine suite (in-memory).
 *
 * PURE in-memory: we DELETE any KV creds before importing the lib so `kv.ts`
 * falls back to its Map. This never touches real Upstash — no prod writes, no
 * network — so it's safe to run anywhere and proves the ENGINE LOGIC, not KV.
 *
 * Run: `npm test` (auto-discovered), or `npx tsx scripts/alert-engine-test.ts`.
 * Exit: 0 all pass, 1 any assertion fails.
 *
 * ⚠️ RENAMED 2026-09-28, from `alert-smoke.ts`, where it sat UNTRACKED for 20 days
 * and `npm test` never loaded it once. Not because anyone excluded it: `run-tests.ts`
 * discovers `scripts/*-{test,check}.ts` and `-smoke` matches neither. That runner's
 * header presents opt-out discovery as making "forgetting to wire a suite impossible",
 * and opt-out is the right design — but it still cannot see a file whose name falls
 * outside the pattern, so the hole it closes is narrower than it reads. A 199-line
 * hand-written suite for the alert engine was what fell through. **The filename IS
 * the wiring.**
 *
 * Covers the 2.1 DoD (4 cases) + the two approved refinements:
 *   1. arrow for ticker WITH a watcher → record for the right person + right
 *      KIND (drift-only watcher excluded from an arb arrow).
 *   2. ticker with NO watcher → 0 alerts, 0 errors.
 *   3. engine BLIND (observable:false) → skip, log `recipients_skipped=unknown
 *      reason=engine_blind` (count unknown — KV dead, can't count).
 *   4. engine STALE (observable:true, ok:false) → skip, log carries `arrow_id`
 *      + EXACT `recipients_skipped=N reason=engine_stale`. (Refinement 1.)
 *   + no-replay (double emit → 0 new), whale → no_alert_kind, seeded/test →
 *     not_engine_origin, and the Telegram pending-queue drain flow
 *     (peek → markDelivered → removeFromPending). (Refinement 2 channel model.)
 */

// ── Force the in-memory KV BEFORE any lib import loads kv.ts ──────────────────
/**
 * Every env name `src/lib/kv.ts` can read to reach a REAL Upstash. Clearing all
 * of them is what makes this suite hermetic; missing one would make it write to
 * production KV on a developer's machine, silently and with no error to read.
 *
 * Named rather than inlined so `assertKvEnvCovered()` below can check this list
 * against kv.ts itself. Being wired into `npm test` is exactly what makes that
 * check necessary: while the file was untracked it ran only when someone typed
 * its name and could see the output, so a 5th env name was a visible local
 * mistake. Now it runs unattended on every gate, so the same mistake would be an
 * unattended prod write.
 */
const KV_ENV_KEYS = [
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
] as const;

for (const k of KV_ENV_KEYS) {
  delete process.env[k];
}

/**
 * Telegram: a token plus a stubbed `fetch`, so the drain's SEND path is
 * reachable while staying hermetic.
 *
 * `sendMessage` short-circuits on an empty `BOT_TOKEN`, and `bot.ts` captures
 * that at module scope — so without a token set here the drain could only ever
 * be tested on its send-failure branch, and `markAlertDelivered` would never be
 * reached at all. With a token set, the only thing between this suite and
 * api.telegram.org is the stub below, which is why it throws on any other host
 * rather than falling through: an unexpected URL is a hermeticity bug and should
 * fail the suite, not silently hit the network.
 */
process.env.TELEGRAM_BOT_TOKEN = "test-token-not-a-real-bot";

const sentDMs: Array<{ chat_id: string; text: string }> = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.includes("api.telegram.org")) {
    throw new Error(`hermetic suite: unexpected network call to ${url}`);
  }
  sentDMs.push(JSON.parse(String(init?.body ?? "{}")) as { chat_id: string; text: string });
  return new Response(JSON.stringify({ ok: true, result: {} }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

import type { Arrow } from "../src/lib/blue-hood/types";
import type { AlertHealthGate, HoodAlert } from "../src/lib/blue-hood/alerts";

/** The drain route's JSON body — only the fields these cases assert on. */
type DrainBody = {
  ok: boolean;
  skipped?: string;
  processed?: number;
  delivered?: number;
  skipped_no_tg?: number;
  retry_kept?: number;
  error_kept?: number;
  stamp_kept?: number;
};

let failed = 0;
function ok(cond: boolean, label: string, detail?: string) {
  if (cond) console.log(`  ✅ ${label}`);
  else {
    failed++;
    console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// Two watchers on COIN with DIFFERENT kind opt-ins, to prove kind filtering.
const A = "0x" + "a".repeat(40); // all kinds
const B = "0x" + "b".repeat(40); // drift only

const HEALTHY: AlertHealthGate = { ok: true, observable: true, status: "healthy" };
const BLIND: AlertHealthGate = { ok: false, observable: false, status: "kv_error" };
const STALE: AlertHealthGate = { ok: false, observable: true, status: "poll_failing" };

function fakeArrow(over: Partial<Arrow> & Pick<Arrow, "id">): Arrow {
  return {
    serial: "#9001",
    ticker: "COIN",
    type: "arb",
    expected_direction: "up",
    grading_window_h: 4,
    reference_price: 100,
    snapshot_refs: [],
    fired_at: new Date().toISOString(),
    status: "open",
    outcome: null,
    graded_at: null,
    outcome_detail: null,
    origin: "engine",
    ...over,
  };
}

/** Capture console.warn output while `fn` runs (to assert the skip logs). */
async function captureWarn<T>(fn: () => Promise<T>): Promise<{ result: T; logs: string[] }> {
  const logs: string[] = [];
  const orig = console.warn;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  console.warn = (...args: any[]) => { logs.push(args.map(String).join(" ")); };
  try {
    const result = await fn();
    return { result, logs };
  } finally {
    console.warn = orig;
  }
}

/**
 * Assert `KV_ENV_KEYS` still covers every env name kv.ts reads.
 *
 * Derived from the source, not duplicated from it: a hand-kept list is exactly
 * how this suite would go on passing while writing to prod. If kv.ts learns a
 * 5th credential env, this fails with the name to add rather than leaking.
 *
 * LIMIT, so nobody reads more into a green line than it says: it matches the
 * literal `process.env.NAME` form only. A bracket read (`process.env["…"]`) or a
 * destructure off `process.env` would slip past it. Those are worth knowing about
 * and not worth parsing TypeScript for here — the realistic failure is someone
 * adding a 5th `?? process.env.UPSTASH_…` fallback beside the existing two, which
 * is precisely the form this does catch.
 *
 * Note the imports are DYNAMIC on purpose, like the lib imports below. A
 * top-level `import` is hoisted by ESM above the `delete process.env[k]` loop,
 * and the whole file depends on nothing loading before that loop — keeping every
 * import inside a function means no later edit can break that ordering by
 * accident. `node:fs` reads no env, so this is about the invariant, not this
 * import.
 */
async function assertKvEnvCovered() {
  const { readFileSync } = await import("node:fs");
  const { default: path } = await import("node:path");

  // `process.argv[1]`, not `__dirname`/`import.meta.dirname`: tsx's module format
  // for this file depends on its (type-only, erasable) imports, and exactly one of
  // those two globals exists per format. argv[1] is defined in both — the same
  // reason `run-tests.ts` resolves its own directory this way.
  const kvPath = path.resolve(path.dirname(path.resolve(process.argv[1])), "../src/lib/kv.ts");
  const src = readFileSync(kvPath, "utf8");

  // Only the REST credential envs matter. kv.ts also reads unrelated names (e.g.
  // NODE_ENV) and clearing those would change behaviour rather than isolate it,
  // so the pattern is deliberately narrow to the two credential families.
  const found = new Set(
    [...src.matchAll(/process\.env\.((?:KV|UPSTASH)_[A-Z0-9_]+)/g)].map((m) => m[1]),
  );
  const missing = [...found].filter((k) => !(KV_ENV_KEYS as readonly string[]).includes(k));

  ok(found.size > 0, "kv.ts credential envs are readable from source", `matched ${found.size}`);
  ok(
    missing.length === 0,
    "KV_ENV_KEYS covers every credential env kv.ts reads",
    missing.length ? `NOT CLEARED → would hit real Upstash: ${missing.join(", ")}` : undefined,
  );
}

async function main() {
  // The hermetic precondition, checked before anything is imported or written.
  console.log("\n── hermetic guard: env clear list vs kv.ts ──");
  await assertKvEnvCovered();

  // Dynamic import AFTER env is cleared → guarantees in-memory KV.
  const { addTicker, recipientsForArrow } = await import("../src/lib/blue-hood/watchlist");
  const {
    emitAlertsForArrow,
    getAlertsForAddress,
    peekPendingAlerts,
    markAlertDelivered,
    removeFromPending,
  } = await import("../src/lib/blue-hood/alerts");

  console.log("\n── seed watchlists ──");
  const addA = await addTicker(A, "COIN", { kinds: ["drift", "arb", "flow"] });
  const addB = await addTicker(B, "COIN", { kinds: ["drift"] });
  ok(addA.ok && addA.added, "A watches COIN (all kinds)");
  ok(addB.ok && addB.added, "B watches COIN (drift only)");

  // ── recipientsForArrow kind filter (both directions) ───────────────────────
  console.log("\n── kind filter (reverse index → forward kinds) ──");
  // Takes the ROW now, not a bare ticker: a ticker alone does not identify a
  // token (NVDA is a different contract on Base than on Robinhood Chain). COIN
  // is RH-only, and an absent `chain` still resolves to robinhood via `chainOf`,
  // so these three assertions mean exactly what they did before.
  const coin = { ticker: "COIN" };
  const arb = await recipientsForArrow(coin, "arb");
  const drift = await recipientsForArrow(coin, "drift");
  const flow = await recipientsForArrow(coin, "flow");
  ok(arb.length === 1 && arb[0] === A, "arb → [A] only (B is drift-only)", JSON.stringify(arb));
  ok(drift.length === 2, "drift → [A, B] (both opted in)", JSON.stringify(drift));
  ok(flow.length === 1 && flow[0] === A, "flow → [A] only", JSON.stringify(flow));

  // ── DoD 1 — arrow WITH watcher → right person, right kind ──────────────────
  console.log("\n── DoD 1: arb arrow + healthy → A gets record, B excluded ──");
  const arrowArb = fakeArrow({ id: "a-arb-1", type: "arb" });
  const r1 = await emitAlertsForArrow(arrowArb, HEALTHY);
  ok(!r1.skipped && r1.recipients === 1 && r1.emitted === 1, "emitted 1 to A", JSON.stringify(r1));
  const aAlerts = await getAlertsForAddress(A);
  const bAlerts = await getAlertsForAddress(B);
  ok(aAlerts.length === 1 && aAlerts[0].kind === "arb" && aAlerts[0].arrow_id === "a-arb-1", "A has 1 arb alert");
  ok(bAlerts.length === 0, "B (drift-only) has 0 alerts");

  // ── no-replay — same arrow again → 0 new ───────────────────────────────────
  console.log("\n── no-replay: re-emit same arrow → 0 new ──");
  const r1b = await emitAlertsForArrow(arrowArb, HEALTHY);
  ok(r1b.emitted === 0 && r1b.recipients === 1, "second emit writes 0 (idempotent)", JSON.stringify(r1b));
  ok((await getAlertsForAddress(A)).length === 1, "A still has exactly 1 alert");

  // ── DoD 2 — ticker with NO watcher → 0 alerts, 0 errors ────────────────────
  console.log("\n── DoD 2: no-watcher ticker (AAPL) → 0 alerts, 0 errors ──");
  const arrowNoWatch = fakeArrow({ id: "a-nowatch-1", ticker: "AAPL", type: "arb" });
  const r2 = await emitAlertsForArrow(arrowNoWatch, HEALTHY);
  ok(!r2.skipped && r2.recipients === 0 && r2.emitted === 0, "0 recipients / 0 emitted / no skip", JSON.stringify(r2));

  // ── DoD 3 — engine BLIND (observable:false) → skip, count UNKNOWN ──────────
  console.log("\n── DoD 3: health observable:false → skip engine_blind ──");
  const arrowBlind = fakeArrow({ id: "a-blind-1", type: "arb" });
  const aBefore = (await getAlertsForAddress(A)).length;
  const { result: r3, logs: blindLogs } = await captureWarn(() => emitAlertsForArrow(arrowBlind, BLIND));
  ok(r3.skipped && r3.skip_reason === "engine_blind" && r3.recipients === 0, "skipped engine_blind, recipients=0", JSON.stringify(r3));
  const blindLine = blindLogs.join("\n");
  ok(blindLine.includes("arrow_id=a-blind-1"), "blind log carries arrow_id", blindLine);
  ok(blindLine.includes("recipients_skipped=unknown") && blindLine.includes("reason=engine_blind"), "blind log: recipients_skipped=unknown reason=engine_blind", blindLine);
  ok((await getAlertsForAddress(A)).length === aBefore, "no record written on blind skip");

  // ── DoD 4 (Refinement 1) — engine STALE → skip, EXACT recipient count ──────
  console.log("\n── DoD 4: health observable:true & ok:false → skip engine_stale w/ exact count ──");
  const arrowStale = fakeArrow({ id: "a-stale-1", type: "arb" });
  const aBefore2 = (await getAlertsForAddress(A)).length;
  const { result: r4, logs: staleLogs } = await captureWarn(() => emitAlertsForArrow(arrowStale, STALE));
  ok(r4.skipped && r4.skip_reason === "engine_stale" && r4.recipients === 1, "skipped engine_stale, recipients=1 (exact)", JSON.stringify(r4));
  const staleLine = staleLogs.join("\n");
  ok(staleLine.includes("arrow_id=a-stale-1"), "stale log carries arrow_id", staleLine);
  ok(staleLine.includes("recipients_skipped=1") && staleLine.includes("reason=engine_stale"), "stale log: recipients_skipped=1 reason=engine_stale", staleLine);
  ok((await getAlertsForAddress(A)).length === aBefore2, "no record written on stale skip");

  // ── whale → no_alert_kind (informational, unwatchable) ──────────────────────
  console.log("\n── whale arrow → no_alert_kind (never alerts) ──");
  const arrowWhale = fakeArrow({ id: "a-whale-1", type: "whale" });
  const r5 = await emitAlertsForArrow(arrowWhale, HEALTHY);
  ok(!r5.skipped && r5.emitted === 0 && r5.skip_reason === "no_alert_kind", "whale → no_alert_kind, 0 emitted", JSON.stringify(r5));

  // ── seeded / test → not_engine_origin (never alerts real wallets) ──────────
  console.log("\n── seeded + test arrows → not_engine_origin ──");
  const arrowSeed = fakeArrow({ id: "a-seed-1", type: "arb", origin: "seeded" });
  const r6 = await emitAlertsForArrow(arrowSeed, HEALTHY);
  ok(r6.emitted === 0 && r6.skip_reason === "not_engine_origin", "origin=seeded → not_engine_origin", JSON.stringify(r6));
  const arrowTest = fakeArrow({ id: "a-test-1", type: "arb", test: true });
  const r7 = await emitAlertsForArrow(arrowTest, HEALTHY);
  ok(r7.emitted === 0 && r7.skip_reason === "not_engine_origin", "test=true → not_engine_origin", JSON.stringify(r7));

  // ── Refinement 2 — Telegram pending queue drain flow ───────────────────────
  console.log("\n── channel model: peek → markDelivered(telegram) → removeFromPending ──");
  const pend = await peekPendingAlerts(10);
  const mine = pend.find((p) => p.id === `a-arb-1:${A}`);
  ok(!!mine, "A's alert is in the Telegram pending queue");
  if (mine) {
    await markAlertDelivered(mine.id, "telegram");
    const afterDeliver = await getAlertsForAddress(A);
    ok(!!afterDeliver[0].delivered.telegram, "delivered.telegram cursor stamped on the shared record");
    await removeFromPending(mine.id);
    const pend2 = await peekPendingAlerts(10);
    ok(!pend2.some((p) => p.id === mine.id), "id removed from pending queue after send");
    ok((await getAlertsForAddress(A)).length === 1, "record itself survives (web-push can still read it)");
  }

  await drainOrderingCases();

  console.log(failed === 0 ? "\n✅ alert-engine: ALL PASS" : `\n❌ alert-engine: ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

/**
 * D — the DRAIN's durable-write ordering, as control PAIRS.
 *
 * The hazard: both cursor stamps are read-modify-write, and `kvGet` reports a
 * THROTTLED read as an empty key. So a stamp could silently no-op while
 * `removeFromPending` cleared the id anyway — leaving a record that says the
 * alert was never sent, with the queue that would have retried it already gone.
 * Same family as #123/#148, same family as the `kvMutate` wipe.
 *
 * This is the coverage that replaces section I of `kv-mutate-part2-test.ts`,
 * deleted 2026-09-28 with its subject (`persistPickCheck` / `picks-check`). Its
 * comment names this drain as the remaining uncovered instance and notes the
 * drain is guarded WORSE than picks-check was, because picks-check wrapped the
 * ordering in one function that RETURNED whether the append landed, while the
 * drain left the ordering to the caller and threw the outcome away.
 *
 * Every case needs a SELECTIVE, TEMPORAL fault. A blanket read failure cannot
 * reach the bug twice over: it trips the route's health gate, which refuses to
 * drain at all when KV is blind, and it would also fail the peek so no row is
 * ever handed to `drainOne`. The only shape that reaches it is "this one record
 * key read fine for the peek, then stopped reading".
 *
 * Legs, and why each is load-bearing:
 *   D-A  the OLD shape, reimplemented inline, asserted to LOSE the record.
 *   D-B  the SHIPPED route under the identical fault, asserted not to.
 *   D-C  healthy KV — without it, "never remove anything" would pass D-B.
 *   D-D/E  the no-tg branch, which sends no DM, so its cursor is the row's only
 *          artifact — fault leg + healthy leg.
 *   D-F  `peekPendingAlerts`' prune, the same collapse one layer up and strictly
 *        worse: it DELETES the queue entry, losing the message, not the record.
 *        Paired with a genuine-expiry leg so "never prune" cannot pass.
 */
async function drainOrderingCases() {
  const { kv, kvGet, kvSet, kvDel } = await import("../src/lib/kv");
  const { kvAlert, KV_ALERT_PENDING } = await import("../src/lib/blue-hood/kv-keys");
  const { addToBroadcast, removeFromBroadcast } = await import("../src/lib/blue-hood/watchlist");
  const { emitAlertsForArrow, peekPendingAlerts, removeFromPending } = await import(
    "../src/lib/blue-hood/alerts"
  );

  /**
   * Fail `kv.get` for ONE key, and only after `allow` reads of it have gone
   * through. `allow: 1` is the drain's exact production window: the peek read
   * the record, then a Telegram round-trip happened, then the stamp re-read the
   * same key and got throttled.
   */
  async function withKeyReadFailureAfter<T>(key: string, allow: number, fn: () => Promise<T>): Promise<T> {
    const realGet = kv.get.bind(kv);
    let seen = 0;
    kv.get = (async <V,>(k: string): Promise<V | null> => {
      if (k === key && seen++ >= allow) {
        throw new Error("simulated Upstash throttle (max requests limit exceeded)");
      }
      return realGet<V>(k);
    }) as typeof kv.get;
    try {
      return await fn();
    } finally {
      kv.get = realGet;
    }
  }

  // Empty ⇒ `isAuthorized` falls through to the non-production allowance. Read
  // at module scope, so it must be set before the dynamic import below.
  process.env.CRON_SECRET = "";
  const { POST: drain } = await import("../src/app/api/cron/blue-hood/alert-drain/route");
  const { NextRequest } = await import("next/server");
  const callDrain = async (): Promise<{ status: number; body: DrainBody }> => {
    const res = await drain(new NextRequest("http://localhost/api/cron/blue-hood/alert-drain"));
    return { status: res.status, body: (await res.json()) as DrainBody };
  };

  const pendingIds = async () => (await kvGet<string[]>(KV_ALERT_PENDING)) ?? [];
  const cursorOf = async (id: string) =>
    (await kvGet<HoodAlert>(kvAlert(id)))?.delivered?.telegram ?? null;

  // A BROADCAST copy carries `tg_user_id` on the record, so the drain reaches
  // its send path without the 1.7 link plumbing. Cleared before each emit so
  // the queue holds exactly one id — with two, the `allow: 1` fault would hit
  // the second row's PEEK read instead of the first row's stamp.
  const TG = "77001";
  await addToBroadcast(TG);
  const seedBroadcast = async (arrowId: string): Promise<string> => {
    await kvDel(KV_ALERT_PENDING);
    await emitAlertsForArrow(fakeArrow({ id: arrowId, ticker: "AAPL", type: "arb" }), HEALTHY);
    return `${arrowId}:tg:${TG}`;
  };

  console.log("\n── D-A. CONTROL: old `void` stamp + unconditional remove, throttled record read ──");
  const idA = await seedBroadcast("a-drain-A");
  ok((await pendingIds()).length === 1, "fixture: exactly one id queued", JSON.stringify(await pendingIds()));
  await withKeyReadFailureAfter(kvAlert(idA), 1, async () => {
    const peeked = await peekPendingAlerts(10);
    ok(peeked.some((p) => p.id === idA), "peek still sees the row — its FIRST read succeeds");
    // Verbatim the shape this change removes. Do NOT "fix" this — it is the
    // control and it is supposed to lose the record.
    const rec = await kvGet<HoodAlert>(kvAlert(idA));
    if (rec) {
      rec.delivered = { ...rec.delivered, telegram: new Date().toISOString() };
      await kvSet(kvAlert(idA), rec, 60 * 60 * 24 * 7);
    }
    await removeFromPending(idA); // ← unconditional. This is the bug.
  });
  ok((await cursorOf(idA)) === null, "old shape: cursor never landed", `cursor=${await cursorOf(idA)}`);
  ok(
    !(await pendingIds()).includes(idA),
    "old shape: id cleared from pending ANYWAY — nothing will ever retry it",
    JSON.stringify(await pendingIds()),
  );

  console.log("\n── D-B. FIX: shipped drain route, identical fault ──");
  const idB = await seedBroadcast("a-drain-B");
  const dmsBeforeB = sentDMs.length;
  const rb = await withKeyReadFailureAfter(kvAlert(idB), 1, callDrain);
  ok(rb.status === 200 && rb.body.ok === true, "route still answers 200 (fire-and-forget)", `status=${rb.status}`);
  ok(
    sentDMs.length === dmsBeforeB + 1,
    "the DM WAS sent — so what is at stake here is the RECORD, not the message",
    `${sentDMs.length - dmsBeforeB} sent`,
  );
  ok((await cursorOf(idB)) === null, "cursor did not land (the fault is real)", `cursor=${await cursorOf(idB)}`);
  ok(
    rb.body.stamp_kept === 1 && rb.body.delivered === 0,
    "reports stamp_kept=1 / delivered=0 — does NOT count an unstamped row as delivered",
    JSON.stringify(rb.body),
  );
  ok(
    (await pendingIds()).includes(idB),
    "id KEPT in pending — the row is retried and the record survives",
    JSON.stringify(await pendingIds()),
  );

  console.log("\n── D-C. CONTROL: healthy KV, same fixture (else 'never remove' passes D-B) ──");
  const idC = await seedBroadcast("a-drain-C");
  const dmsBeforeC = sentDMs.length;
  const rc = await callDrain();
  ok(rc.body.delivered === 1 && rc.body.stamp_kept === 0, "reports delivered=1 / stamp_kept=0", JSON.stringify(rc.body));
  ok(sentDMs.length === dmsBeforeC + 1, "exactly one DM sent", `${sentDMs.length - dmsBeforeC} sent`);
  ok(!!(await cursorOf(idC)), "cursor landed", `cursor=${await cursorOf(idC)}`);
  ok(!(await pendingIds()).includes(idC), "id removed on a genuine success");

  // ── the no-tg branch. No DM is sent at all, so the sentinel cursor is the
  // only thing the row produces — an unreported no-op loses the whole outcome.
  // TG leaves the broadcast list so a COIN arrow yields ONE id (A's unlinked
  // watcher copy) and the `allow: 1` fault lands on the stamp, not a peek.
  await removeFromBroadcast(TG);
  const seedWatcher = async (arrowId: string): Promise<string> => {
    await kvDel(KV_ALERT_PENDING);
    await emitAlertsForArrow(fakeArrow({ id: arrowId, ticker: "COIN", type: "arb" }), HEALTHY);
    return `${arrowId}:${A}`;
  };

  console.log("\n── D-D. no-tg branch, throttled record read ──");
  const idD = await seedWatcher("a-drain-D");
  ok((await pendingIds()).length === 1, "fixture: one unlinked watcher copy queued", JSON.stringify(await pendingIds()));
  const dmsBeforeD = sentDMs.length;
  const rd = await withKeyReadFailureAfter(kvAlert(idD), 1, callDrain);
  ok(sentDMs.length === dmsBeforeD, "no DM sent (wallet has no Telegram link)", `${sentDMs.length - dmsBeforeD} sent`);
  ok(rd.body.stamp_kept === 1 && rd.body.skipped_no_tg === 0, "reports stamp_kept=1 / skipped_no_tg=0", JSON.stringify(rd.body));
  ok(
    (await pendingIds()).includes(idD),
    "id KEPT — a skip cursor that never landed is not a DEFINITE outcome",
    JSON.stringify(await pendingIds()),
  );

  console.log("\n── D-E. CONTROL: no-tg branch on healthy KV still drops the row ──");
  const idE = await seedWatcher("a-drain-E");
  const re = await callDrain();
  ok(re.body.skipped_no_tg === 1 && re.body.stamp_kept === 0, "reports skipped_no_tg=1 / stamp_kept=0", JSON.stringify(re.body));
  ok((await cursorOf(idE)) === "skipped_no_tg", "sentinel cursor stamped", `cursor=${await cursorOf(idE)}`);
  ok(!(await pendingIds()).includes(idE), "id removed — an unlinked wallet cannot wedge the queue");

  console.log("\n── D-F. CONTROL: old prune (`kvGet` + `if (rec)`) DELETES a throttled id ──");
  const idF = await seedWatcher("a-drain-F");
  await withKeyReadFailureAfter(kvAlert(idF), 0, async () => {
    // Verbatim the prune this change removes. Do NOT "fix" this — it is the
    // control. `kvGet` reports the throttle as null, `if (rec)` reads that as
    // "expired", and the id is written out of the queue.
    const ids = (await kvGet<string[]>(KV_ALERT_PENDING)) ?? [];
    const alive: string[] = [];
    let pruned = false;
    for (const id of ids) {
      const rec = await kvGet<HoodAlert>(kvAlert(id));
      if (rec) alive.push(id);
      else pruned = true;
    }
    if (pruned) await kvSet(KV_ALERT_PENDING, alive);
  });
  ok(
    !(await pendingIds()).includes(idF),
    "old prune: id DELETED from the queue — this loses the MESSAGE, not just the cursor",
    JSON.stringify(await pendingIds()),
  );
  ok(!!(await kvGet<HoodAlert>(kvAlert(idF))), "…while the record was readable the whole time (the fault was transient)");

  console.log("\n── D-G. FIX: shipped peek, identical fault ──");
  const idG = await seedWatcher("a-drain-G");
  const peekedG = await withKeyReadFailureAfter(kvAlert(idG), 0, () => peekPendingAlerts(10));
  ok(peekedG.length === 0, "row skipped this tick — its record is unreadable", `${peekedG.length} peeked`);
  ok(
    (await pendingIds()).includes(idG),
    "id KEPT in pending — a throttle is not an expiry",
    JSON.stringify(await pendingIds()),
  );
  // Without this the fix could be "never prune", which would let a genuinely
  // dead id wedge the head of the queue forever — the reason the prune exists.
  await kvDel(kvAlert(idG));
  const peekedG2 = await peekPendingAlerts(10);
  ok(peekedG2.length === 0, "expired row yields no alert", `${peekedG2.length} peeked`);
  ok(!(await pendingIds()).includes(idG), "genuinely-gone id IS still pruned", JSON.stringify(await pendingIds()));
}

main().catch((e) => {
  console.error("alert-engine-test threw:", e);
  process.exit(1);
});
