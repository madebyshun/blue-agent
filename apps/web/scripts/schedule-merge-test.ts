/**
 * schedule-merge-test — the Scheduled panel's list updates apply to the list
 * as it is NOW, in one pass (src/app/chat/schedule-merge.ts).
 *
 * Pinned to the 2026-10-01 pre-production review. ChatContext used to write
 * `setCrons(crons.map(…))` over the list its render had closed over, so:
 *   • "Turn off all background tasks" flipped only the last one, and the push
 *     effect re-uploaded the rest right after the DELETE (re-enrolled, billed);
 *   • a pull reporting two server pauses kept only one;
 *   • "Run now" (up to 100 s) wrote the click-time list back over a delete
 *     made meanwhile, resurrecting a background task that then fired again.
 *
 * `store` below is a stand-in for React's functional `setState`: each
 * mutation receives the latest value. Hermetic — no React, no network.
 */
import fs from "node:fs";
import path from "node:path";
import type { CronTask } from "../src/app/chat/types";
import { isBackground } from "../src/app/chat/storage";
import {
  applyServerPull, applyServerNextAt, patchById, switchAllToForeground,
  FOREGROUND_PATCH, type ServerTask,
} from "../src/app/chat/schedule-merge";

let passes = 0;
let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (pass) passes++; else failures++;
}

function cron(id: string, over: Partial<CronTask> = {}): CronTask {
  return { id, label: id, schedule: "daily", time: "09:00", tz: "UTC", prompt: `p-${id}`, active: true, ...over };
}

function store(initial: CronTask[]) {
  let state = initial;
  return {
    get: () => state,
    mutate: (fn: (prev: CronTask[]) => CronTask[]) => { state = fn(state); },
  };
}

/** What use-schedule-sync uploads: the background subset. */
const uploaded = (cs: CronTask[]) => cs.filter(isBackground).map((c) => c.id);

console.log("\n1. Turn off ALL background tasks");
{
  const s = store([
    cron("a", { background: true, nextAt: 1 }),
    cron("b", { background: true, nextAt: 2, pausedReason: "Paused — x" }),
    cron("fg"),
    cron("c", { background: true, nextAt: 3 }),
  ]);
  s.mutate(switchAllToForeground);
  check("1.1 every background task is switched off, not just the last", uploaded(s.get()).length === 0, uploaded(s.get()).join(","));
  check("1.2 so the push payload is [] and nothing is re-uploaded", JSON.stringify(uploaded(s.get())) === "[]");
  check("1.3 their server-owned fields are cleared", s.get().every((c) => c.nextAt === undefined && c.pausedReason === undefined));
  check("1.4 the tasks themselves are kept (switched to 'on open')", s.get().length === 4);
  const before = s.get();
  s.mutate(switchAllToForeground);
  check("1.5 nothing left to switch → the same list (no write)", s.get() === before);
}

console.log("\n2. A pull applies EVERY server patch");
{
  const s = store([cron("a", { background: true }), cron("b", { background: true }), cron("c", { background: true, pausedReason: "old" })]);
  const server: ServerTask[] = [
    { id: "a", active: false, pausedReason: "Paused — needed 400", lastRun: 10, lastError: "Paused — needed 400" },
    { id: "b", active: false, pausedReason: "Paused — needed 200", lastRun: 11 },
    { id: "c", active: true, lastRun: 12, lastResult: "ok" },
  ];
  s.mutate((prev) => applyServerPull(prev, server));
  const [a, b, c] = s.get();
  check("2.1 the FIRST paused task shows paused too", a.active === false && a.pausedReason === "Paused — needed 400");
  check("2.2 the second paused task shows paused", b.active === false && b.pausedReason === "Paused — needed 200");
  check("2.3 run history lands on every task", a.lastRun === 10 && b.lastRun === 11 && c.lastRun === 12 && c.lastResult === "ok");
  check("2.4 no pausedReason from the server clears the local one", c.pausedReason === undefined);
}
{
  const s = store([cron("a", { background: true, active: true })]);
  s.mutate((prev) => applyServerPull(prev, [{ id: "a", active: false }]));
  check("2.5 a bare active:false (no pause) does not override the local switch", s.get()[0].active === true);
}

console.log("\n3. Adoption and patches in the same pull");
{
  const s = store([cron("local", { background: true })]);
  const server: ServerTask[] = [
    { id: "serverOnly", prompt: "from another device", schedule: "weekly", time: "08:00", active: true, nextAt: 99 },
    { id: "local", lastRun: 5 },
    { id: "noPrompt" },
    { id: "serverOnly", prompt: "duplicate" },
  ];
  s.mutate((prev) => applyServerPull(prev, server));
  const ids = s.get().map((c) => c.id);
  check("3.1 a server-only task listed BEFORE a local one is kept", ids.includes("serverOnly"), ids.join(","));
  check("3.2 …and the local one is still patched", s.get().find((c) => c.id === "local")?.lastRun === 5);
  const adopted = s.get().find((c) => c.id === "serverOnly");
  check("3.3 adopted as background, with its own cadence and prompt",
    adopted?.background === true && adopted.schedule === "weekly" && adopted.prompt === "from another device");
  check("3.4 a server task with no prompt is not adopted", !ids.includes("noPrompt"));
  check("3.5 a duplicated server id is adopted once", ids.filter((i) => i === "serverOnly").length === 1);
}
{
  const s = store([]);
  s.mutate((prev) => applyServerPull(prev, [{ id: "p", prompt: "x", active: true, pausedReason: "Paused — y" }]));
  check("3.6 an adopted task the server paused arrives paused", s.get()[0]?.active === false);
}

console.log("\n4. A slow run's result cannot undo what happened during it");
{
  const s = store([cron("X"), cron("Z", { background: true })]);
  // Run now on X starts… the user deletes Z while it runs…
  s.mutate((prev) => prev.filter((c) => c.id !== "Z"));
  // …X finishes and records its result against the CURRENT list.
  s.mutate((prev) => patchById(prev, "X", { lastRun: 1, lastResult: "done" }));
  check("4.1 the deleted background task stays deleted", !s.get().some((c) => c.id === "Z"));
  check("4.2 nothing is left to re-upload", uploaded(s.get()).length === 0);
  check("4.3 the run's result is still recorded", s.get()[0].lastResult === "done");
}
{
  const s = store([cron("X"), cron("Y", { background: true })]);
  s.mutate((prev) => patchById(prev, "Y", FOREGROUND_PATCH));            // switched to "on open" mid-run
  s.mutate((prev) => patchById(prev, "X", { lastRun: 1 }));
  check("4.4 a task switched to 'on open' during a run stays switched", s.get().find((c) => c.id === "Y")?.background === false);
  const before = s.get();
  s.mutate((prev) => patchById(prev, "gone", { lastRun: 2 }));
  check("4.5 a patch for a task that no longer exists is a no-op (same list, no write)", s.get() === before);
}

console.log("\n5. A PUT's nextAt only lands on tasks still in the background");
{
  const s = store([cron("a", { background: true }), cron("b")]);
  s.mutate((prev) => applyServerNextAt(prev, [{ id: "a", nextAt: 111 }, { id: "b", nextAt: 222 }]));
  check("5.1 background task gets the server's nextAt", s.get()[0].nextAt === 111);
  check("5.2 a task switched off meanwhile gets no firing time back", s.get()[1].nextAt === undefined);
}

// The pure helpers only help if the React code routes through them. These
// source assertions pin the wiring the hermetic tests above cannot reach.
console.log("\n6. ChatContext / use-schedule-sync write through ONE functional update");
{
  const dir = path.join(__dirname, "..", "src", "app", "chat");
  const ctx  = fs.readFileSync(path.join(dir, "ChatContext.tsx"), "utf8");
  const hook = fs.readFileSync(path.join(dir, "use-schedule-sync.ts"), "utf8");
  check("6.1 no cron writer maps/filters the render's `crons` closure",
    !/crons\.(map|filter)\(\s*c\s*=>\s*c\.id\s*(===|!==)\s*id/.test(ctx) && !/\[\.\.\.crons,/.test(ctx));
  check("6.2 the hook takes mutateCrons, not a per-task patchCron/adoptCron",
    /mutateCrons:\s*\(fn:/.test(hook) && !/patchCron|adoptCron/.test(hook));
  check("6.3 the pull applies applyServerPull in one mutateCrons call", /mutateCrons\(prev => applyServerPull\(prev, tasks\)\)/.test(hook));
  check("6.4 disableAll flips everything in one call", /mutateCrons\(switchAllToForeground\)/.test(hook));
  check("6.5 every schedule request names the connected wallet", /\/api\/chat\/schedule\?address=/.test(hook) && !/fetch\("\/api\/chat\/schedule"/.test(hook));
  check("6.6 a run that never left the browser does not stamp lastRun",
    /dispatched \? \{ lastRun: Date\.now\(\) \}/.test(ctx) && !/lastRun: Date\.now\(\), lastError: \(e as Error\)/.test(ctx));
}

console.log(`\nschedule-merge-test: ${passes}/${passes + failures} passed`);
if (failures > 0) process.exit(1);
