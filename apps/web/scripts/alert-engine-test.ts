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

import type { Arrow } from "../src/lib/blue-hood/types";
import type { AlertHealthGate } from "../src/lib/blue-hood/alerts";

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

  console.log(failed === 0 ? "\n✅ alert-engine: ALL PASS" : `\n❌ alert-engine: ${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("alert-engine-test threw:", e);
  process.exit(1);
});
