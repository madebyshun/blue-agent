/**
 * scheduled-tasks-test — the first tests the scheduler has had (Scheduled
 * research P0(10), 2026-09-30), pinned to the bugs P0 fixed:
 *
 *   L3   a tick ran up to 8 × 95 s under a 300 s ceiling, and a killed tick
 *        re-ran (and re-billed) windows whose `nextAt` it never saved
 *        → ≤ 3 runs per tick, and a per-window SET NX marker.
 *   L13  the tick wrote back the whole task array it read BEFORE its runs, so a
 *        task deleted mid-tick came back and kept charging
 *        → re-read before each run, patch ONE task by id after it.
 *   L9   the pause note said "balance was 0" whatever the wallet held, and the
 *        text a run had already produced was thrown away.
 *   L5   the eleventh task was dropped silently → 422, nothing saved.
 *   §7.8 no heartbeat — "has the tick ever run?" had no answer.
 *
 * Hermetic: KV env cleared (in-memory store), and the tick's call to
 * /api/cron/run is answered by a stub that records every run it is asked for.
 */
for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) {
  delete process.env[k];
}
process.env.CRON_SECRET = "test-cron-secret";
process.env.INTERNAL_SERVICE_KEY = "test-internal-key";
process.env.NEXT_PUBLIC_APP_URL = "https://app.invalid";

import { NextRequest } from "next/server";
import { kvGet, kvSet } from "../src/lib/kv";
import { nextFireAt } from "../src/lib/cron-schedule";
import {
  sanitizeTasks,
  putSchedule,
  readOwnerTasks,
  writeOwnerTasks,
  writeWatermark,
  MAX_TASKS_PER_WALLET,
  type ScheduledTask,
} from "../src/lib/scheduled-tasks";
import { createSession, SESSION_COOKIE } from "../src/lib/session";

let passes = 0;
let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (pass) passes++; else failures++;
}

const W = "0x1111111111111111111111111111111111111111";
const DAY = 24 * 3600 * 1000;

// ── /api/cron/run stub ──────────────────────────────────────────────────────
type Reply = { result?: string; insufficientCredits?: { needed?: number; balance?: number } };
let onRun: (prompt: string) => Promise<Reply> | Reply = () => ({ result: "done" });
const runs: { prompt: string; user?: string }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input) === "https://app.invalid/api/cron/run") {
    const body = JSON.parse(String(init?.body ?? "{}")) as { prompt: string };
    const user = new Headers(init?.headers).get("x-blue-user") ?? undefined;
    runs.push({ prompt: body.prompt, user });
    const reply = await onRun(body.prompt);
    return new Response(JSON.stringify(reply), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  return realFetch(input, init);
}) as typeof fetch;

function task(id: string, over: Partial<ScheduledTask> = {}): ScheduledTask {
  return {
    id, label: id, schedule: "daily", time: "09:00", tz: "UTC", prompt: `prompt-${id}`,
    tier: "balanced", active: true, nextAt: Date.now() - 60_000, ...over,
  };
}

async function seed(tasks: ScheduledTask[]) {
  await putSchedule(W, tasks);                // enrols the owner
  await writeOwnerTasks(W, tasks);            // …with these exact nextAt values
  await writeWatermark(Date.now() - 1000);    // and wakes the tick
}

async function tick() {
  const { GET } = await import("../src/app/api/cron/user-tasks/route");
  const res = await GET(new NextRequest("http://localhost/api/cron/user-tasks", {
    headers: { authorization: "Bearer test-cron-secret" },
  }));
  return (await res.json()) as { status?: string; ran?: number; paused?: number };
}

async function live(): Promise<ScheduledTask[]> {
  const r = await readOwnerTasks(W);
  return r.status === "found" ? r.record.tasks : [];
}

(async () => {
  console.log("\n1. nextFireAt / sanitizeTasks");
  const now = Date.now();
  const n = nextFireAt({ schedule: "daily", time: "09:00", tz: "UTC" }, now);
  check("1.1 a daily task's next run is in the future, within a day", n > now && n - now <= DAY, new Date(n).toISOString());
  const w = nextFireAt({ schedule: "weekly", time: "09:00", tz: "UTC" }, now);
  check("1.2 a weekly task's next run is within a week", w > now && w - now <= 7 * DAY);
  const prev = [task("a", { lastRun: 123, lastResult: "old answer" })];
  const clean = sanitizeTasks([{ id: "a", prompt: "p", nextAt: 0, lastResult: "forged" }], prev);
  check("1.3 a client cannot set nextAt (it is recomputed)", clean[0].nextAt > now);
  check("1.4 run history is the server's, never the body's", clean[0].lastResult === "old answer" && clean[0].lastRun === 123);
  check("1.5 a task with no prompt is dropped", sanitizeTasks([{ id: "x" }]).length === 0);
  const many = Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, prompt: "p" }));
  check("1.6 sanitize never keeps more than the cap", sanitizeTasks(many).length === MAX_TASKS_PER_WALLET);

  console.log("\n2. A tick runs at most 3, and saves each one");
  runs.length = 0;
  onRun = (p) => ({ result: `answer to ${p}` });
  await seed([task("a"), task("b"), task("c"), task("d")]);
  let t = await tick();
  check("2.1 four due tasks → three runs this tick", runs.length === 3 && t.ran === 3, `runs=${runs.length} ran=${t.ran}`);
  check("2.2 each run is made AS the owner (internal key + x-blue-user)", runs.every((r) => r.user === W));
  let tasks = await live();
  const done = tasks.filter((x) => x.lastResult?.startsWith("answer to"));
  check("2.3 all three results were saved", done.length === 3);
  check("2.4 their nextAt moved to the future", done.every((x) => x.nextAt > Date.now()));
  const left = tasks.find((x) => !x.lastResult);
  check("2.5 the fourth is still due, not lost", !!left && left.nextAt <= Date.now());
  await writeWatermark(Date.now() - 1000);
  t = await tick();
  check("2.6 …and runs on the next tick", runs.length === 4, `runs=${runs.length}`);

  console.log("\n3. A task deleted mid-tick neither runs nor comes back");
  runs.length = 0;
  await seed([task("keep"), task("gone")]);
  onRun = async (p) => {
    if (p === "prompt-keep") {
      // The user deletes "gone" while "keep" is running.
      await writeOwnerTasks(W, (await live()).filter((x) => x.id !== "gone"));
    }
    return { result: `answer to ${p}` };
  };
  await tick();
  tasks = await live();
  check("3.1 the deleted task was not run", !runs.some((r) => r.prompt === "prompt-gone"), runs.map((r) => r.prompt).join(","));
  check("3.2 …and was not written back", !tasks.some((x) => x.id === "gone"), tasks.map((x) => x.id).join(","));
  check("3.3 the other task's result was still saved", tasks.find((x) => x.id === "keep")?.lastResult === "answer to prompt-keep");

  console.log("\n4. One run per window, even if a crash lost the save");
  runs.length = 0;
  onRun = (p) => ({ result: `answer to ${p}` });
  const windowAt = Date.now() - 60_000;
  await seed([task("crashed", { nextAt: windowAt })]);
  await kvSet(`crons:ran:${W}:crashed:${windowAt}`, Date.now(), 3600); // the earlier tick ran it, then died
  await tick();
  tasks = await live();
  check("4.1 not run a second time", runs.length === 0);
  check("4.2 its window is advanced instead", (tasks.find((x) => x.id === "crashed")?.nextAt ?? 0) > Date.now());

  console.log("\n5. Out of credits: paused with the REAL balance, and the text kept");
  runs.length = 0;
  onRun = () => ({ result: "half an answer", insufficientCredits: { needed: 400, balance: 42 } });
  await seed([task("broke")]);
  t = await tick();
  const broke = (await live()).find((x) => x.id === "broke");
  check("5.1 paused", broke?.active === false && t.paused === 1);
  check("5.2 the note states the balance the wallet actually had", !!broke?.pausedReason?.includes("balance was 42"), broke?.pausedReason);
  check("5.3 the paid-for partial text is kept", broke?.lastResult === "half an answer");

  console.log("\n6. Heartbeat");
  const hb = await kvGet<{ at?: number; status?: string }>("crons:tick:last");
  check("6.1 the last tick left a heartbeat", hb?.status === "ok" && typeof hb.at === "number" && Date.now() - hb.at < 60_000);

  console.log("\n7. The eleventh task is refused, not dropped");
  const { PUT } = await import("../src/app/api/chat/schedule/route");
  const session = await createSession(W);
  const eleven = Array.from({ length: MAX_TASKS_PER_WALLET + 1 }, (_, i) => ({ id: `t${i}`, prompt: "p", time: "09:00" }));
  const res = await PUT(new NextRequest("http://localhost/api/chat/schedule", {
    method: "PUT",
    headers: { "Content-Type": "application/json", cookie: `${SESSION_COOKIE}=${session}` },
    body: JSON.stringify({ tasks: eleven }),
  }));
  const body = (await res.json()) as { code?: string };
  check("7.1 422 TOO_MANY_TASKS", res.status === 422 && body.code === "TOO_MANY_TASKS", `${res.status} ${JSON.stringify(body)}`);
  check("7.2 …and nothing was saved over the existing record", (await live()).every((x) => !x.id.startsWith("t")));

  console.log(`\nscheduled-tasks-test: ${passes}/${passes + failures} passed`);
  if (failures > 0) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
