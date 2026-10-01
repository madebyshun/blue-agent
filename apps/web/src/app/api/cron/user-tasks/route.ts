/**
 * Blue Chat — the tick that makes "daily at 09:00" mean 09:00.
 *
 * Runs every 5 minutes from `vercel.json`. Everything below is shaped by two
 * facts that make this different from the other crons in this repo: it spends
 * REAL USER CREDITS, and it runs against a KV budget that has been exceeded
 * three times (#148).
 *
 * ── Cost per idle tick: ONE read, ONE heartbeat write ────────────────────────
 * The first thing this route does is read `crons:next`, a single integer: the
 * earliest moment any owner has a task due. If that is in the future, it returns
 * immediately — it does not read the owners set, and it does not touch a single
 * wallet record. 288 ticks/day × 1 read ≈ 8.6k reads/month, flat, no matter how
 * many users enrol. The naive shape (scan every owner every 5 minutes) costs
 * 288 × N reads/day and would put the project back in suspension at a few
 * hundred users. `unset` means nobody has ever enrolled, and is also a return.
 * Every invocation also writes the `crons:tick:last` heartbeat — another flat
 * ~8.6k commands/month, the price §7.8 of the Scheduled research accepted so
 * "is the tick alive?" has an answer. Still flat in the number of users.
 *
 * ── Missed windows are SKIPPED, never replayed ───────────────────────────────
 * `nextFireAt` always returns a future instant, so a task whose window passed
 * while the app was down runs ONCE, at the next window. This is the single most
 * important behaviour here: each run debits credits and can call paid tools, so
 * "catch up on the seven runs you missed" is a way to empty a wallet overnight.
 * Losing a run is recoverable; charging for six the user never asked for is not.
 *
 * ── Out of credits pauses the task, it does not retry it ─────────────────────
 * `/api/cron/run` reports insufficient credits as a structured field rather than
 * an error string. When we see it, the task is switched off with a
 * `pausedReason` the panel renders. The alternative — leave it active — means
 * re-attempting a run that cannot succeed every 5 minutes forever, which burns
 * the tool budget and the KV budget to produce nothing. The user re-enables it
 * after topping up, which also clears the reason.
 *
 * ── One tick at a time, and only a few runs per tick ─────────────────────────
 * A `kvTryLock` guard stops two overlapping invocations from double-charging the
 * same task, and `MAX_RUNS_PER_TICK` bounds how much money one tick can spend if
 * something goes wrong upstream. Anything not reached this tick is still due
 * next tick — the watermark is left where it belongs.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET` (or `?secret=`) — the house pattern.
 */
import { NextRequest, NextResponse } from "next/server";
import { kvTryLock, kvDel, kvSet } from "@/lib/kv";
import {
  listOwners,
  readOwnerTasks,
  writeOwnerTasks,
  readWatermark,
  writeWatermark,
  earliestNextAt,
  unenroll,
  MAX_RESULT_CHARS,
  type ScheduledTask,
} from "@/lib/scheduled-tasks";
import { nextFireAt } from "@/lib/cron-schedule";

export const runtime = "nodejs";
/**
 * A single chat run with tools can take most of a minute; the fetch below caps
 * itself at 90s and we allow a handful per tick. 300 is the ceiling this plan
 * supports and is already used by one other route in the repo.
 */
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET ?? "";
const BASE_URL    = process.env.NEXT_PUBLIC_APP_URL ?? "https://blueagent.dev";
// Proof this job acts for a task owner (lib/acting-wallet.ts). Without it —
// local dev — cron/run refuses the run as unauthenticated, which is correct.
const INTERNAL_KEY = process.env.INTERNAL_SERVICE_KEY ?? "";

const LOCK_KEY = "crons:tick:lock";
/** Comfortably longer than a full tick, short enough that a crash self-heals. */
const LOCK_TTL_S = 6 * 60;

/**
 * Bounded unattended spend. Ten daily tasks across all users landing in one
 * 5-minute window is plausible; a hundred is a bug, and this is where that bug
 * stops costing money. The remainder stays due and is picked up next tick.
 *
 * 3, not 8 (2026-09-30, Scheduled research L3): each run may take its full 95 s,
 * and 8 × 95 s = 760 s against a 300 s `maxDuration` — a tick killed mid-pass
 * after it had already debited runs whose `nextAt` it never saved, so the next
 * tick charged them again. 3 × 95 s = 285 s fits.
 */
const MAX_RUNS_PER_TICK = 3;

/**
 * One run per (task, window), even if saving the result fails: claimed with
 * SET NX before the run, keyed by the window's own `nextAt`. A tick that dies
 * between charging and saving leaves `nextAt` in the past, and without this the
 * next tick would run — and bill — the same window again. 8 days covers weekly.
 */
const RAN_TTL_S = 8 * 24 * 3600;
const ranKey = (wallet: string, id: string, at: number) => `crons:ran:${wallet}:${id}:${at}`;

/**
 * Last-tick heartbeat (Scheduled research §7.8): the only way to answer "has
 * the tick run at all?" without Vercel logs. Written on EVERY authorised
 * invocation — idle, skipped, ok and error alike — because §7.8's acceptance
 * test is that `at` advances every 5 minutes. It used to be written only after
 * a full pass, which is almost never (the watermark is usually in the future),
 * so a healthy scheduler read as dead and a failing one left no trace at all.
 * Counts and reasons only, never a wallet address.
 */
const HEARTBEAT_KEY   = "crons:tick:last";
const HEARTBEAT_TTL_S = 7 * 24 * 3600;

type BeatStatus = "idle" | "skipped" | "ok" | "error";

/** `kvSet`, which swallows: a heartbeat that cannot be written must never be
 *  the reason a tick fails. */
async function heartbeat(status: BeatStatus, detail: Record<string, unknown> = {}): Promise<void> {
  await kvSet(HEARTBEAT_KEY, { at: Date.now(), status, ...detail }, HEARTBEAT_TTL_S);
}

/** Error text can quote a KV key, and those keys carry the owner's wallet. */
function redactWallets(s: string): string {
  return s.replace(/0x[a-fA-F0-9]{40}/g, "0x…").slice(0, 300);
}

function isAuthorized(req: NextRequest): boolean {
  if (!CRON_SECRET) return process.env.NODE_ENV !== "production";
  const authHeader  = req.headers.get("authorization") ?? "";
  const secretParam = new URL(req.url).searchParams.get("secret") ?? "";
  return authHeader === `Bearer ${CRON_SECRET}` || secretParam === CRON_SECRET;
}

// ─── Running one task ────────────────────────────────────────────────────────

type RunOutcome =
  | { kind: "ok"; text: string }
  | { kind: "insufficient"; needed?: number; balance?: number; text?: string }
  | { kind: "error"; message: string };

/**
 * Execute one task through `/api/cron/run`, which proxies `/api/chat` with the
 * full real-data Hub tool set.
 *
 * We call it rather than `/api/chat` directly so there is ONE owner of "turn a
 * stored prompt into an answer" — the slash-command expansion and the SSE
 * collection live there, and the browser's "Run now" button goes through the
 * same path. Two copies of that would drift the way the chat price tables did.
 *
 * The owner's wallet is forwarded — since 2026-09-30 as a PROOF (internal key
 * + x-blue-user), no longer as a bare `address` cron/run would take on faith —
 * so the run is billed to the person who scheduled it and paid Hub tools are
 * authorised as them. cron/run passes the same pair on to /api/chat, which
 * bills that wallet: the internal key only ever travels WITH a wallet, never
 * as the free bypass PR #386 removed, so a scheduled run still costs exactly
 * what typing the same prompt would cost.
 */
async function runTask(task: ScheduledTask, wallet: string): Promise<RunOutcome> {
  try {
    const res = await fetch(`${BASE_URL}/api/cron/run`, {
      method:  "POST",
      // cron/run takes the wallet from a proof, not the body (2026-09-30).
      // This job's proof is the internal key: it read `wallet` from the owner's
      // own task list, written only through the SIWE-gated /api/chat/schedule.
      headers: {
        "Content-Type": "application/json",
        ...(INTERNAL_KEY ? { "x-blue-internal": INTERNAL_KEY, "x-blue-user": wallet } : {}),
      },
      body:    JSON.stringify({ prompt: task.prompt, tier: task.tier, address: wallet }),
      signal:  AbortSignal.timeout(95_000),
    });

    const data = (await res.json().catch(() => ({}))) as {
      result?: string;
      error?: string;
      insufficientCredits?: { needed?: number; balance?: number };
    };

    if (data.insufficientCredits) {
      // Keep the text the run already produced — it was paid for.
      const partial = (data.result ?? "").trim();
      return { kind: "insufficient", ...data.insufficientCredits, ...(partial ? { text: partial.slice(0, MAX_RESULT_CHARS) } : {}) };
    }
    if (!res.ok) {
      return { kind: "error", message: data.error ?? `HTTP ${res.status}` };
    }
    const text = (data.result ?? "").trim();
    // An empty answer is a failure, not a result. Storing "" would render as a
    // successful run that says nothing, which is worse than saying it failed.
    if (!text) return { kind: "error", message: "The model returned nothing." };
    return { kind: "ok", text: text.slice(0, MAX_RESULT_CHARS) };
  } catch (e) {
    return { kind: "error", message: (e as Error).message };
  }
}

// ─── Tick ────────────────────────────────────────────────────────────────────

interface TickSummary {
  ran:     number;
  failed:  number;
  paused:  number;
  owners:  number;
  skipped: number;   // owners whose record could not be read this cycle
  deferred: number;  // due runs left due because their window could not be claimed
}

/**
 * Re-read the owner's record and change ONE task, by id. Never writes back a
 * task list read before a run: see the note at the top of the owner loop.
 */
async function patchTask(
  wallet: string,
  id: string,
  apply: (t: ScheduledTask) => void,
): Promise<"ok" | "gone" | "unavailable" | "failed"> {
  const read = await readOwnerTasks(wallet);
  if (read.status === "unavailable") return "unavailable";
  if (read.status === "empty") return "gone";
  const tasks = read.record.tasks;
  const t = tasks.find((x) => x.id === id);
  if (!t) return "gone"; // deleted meanwhile — do not resurrect it
  apply(t);
  try {
    await writeOwnerTasks(wallet, tasks);
    return "ok";
  } catch {
    return "failed";
  }
}

async function tick(now: number): Promise<TickSummary & { nextAt: number | null }> {
  const summary: TickSummary = { ran: 0, failed: 0, paused: 0, owners: 0, skipped: 0, deferred: 0 };

  const owners = await listOwners();
  summary.owners = owners.length;

  // The earliest future `nextAt` seen anywhere this pass. Recomputed from
  // scratch rather than adjusted, so a stale watermark self-corrects every time
  // a full pass happens.
  let soonest: number | null = null;
  let budget  = MAX_RUNS_PER_TICK;

  for (const wallet of owners) {
    const read = await readOwnerTasks(wallet);

    if (read.status === "unavailable") {
      // Could not read — skip, do NOT write. Writing here would replace a real
      // schedule with an empty one on a throttle. Pull the wake-up in so the
      // next tick retries them promptly.
      summary.skipped++;
      soonest = soonest === null ? now + 60_000 : Math.min(soonest, now + 60_000);
      continue;
    }
    if (read.status === "empty") {
      // In the owners set with no record: a half-finished un-enrol, or a wiped
      // key. Drop the membership so it stops costing a read every pass.
      // Best effort: `unenroll` throws on a KV failure (so the user-facing
      // DELETE can report it), but here a failure only means the same cleanup
      // is tried next pass — it must not abort every other owner's runs.
      try {
        await unenroll(wallet);
      } catch (e) {
        console.error(`[cron:user-tasks] stale owner not removed: ${(e as Error).message}`);
      }
      continue;
    }

    // Used only to FIND due tasks. Each run re-reads the live record first and
    // saves by patching that one task (Scheduled research L13): the user may
    // delete, pause or re-time a task while an earlier run in this pass is in
    // flight, and writing back the whole array read here would undo that —
    // resurrecting a deleted task that then keeps charging.
    const tasks = read.record.tasks;
    let lostSave = false;

    for (const snapshot of tasks) {
      if (!snapshot.active) continue;
      if (!Number.isFinite(snapshot.nextAt) || snapshot.nextAt > now) continue;

      if (budget <= 0) {
        // Out of runs for this tick. Leave `nextAt` in the past so the task is
        // still due, and make sure we come back promptly.
        soonest = soonest === null ? now : Math.min(soonest, now);
        continue;
      }

      const fresh = await readOwnerTasks(wallet);
      if (fresh.status !== "found") {
        if (fresh.status === "unavailable") soonest = soonest === null ? now + 60_000 : Math.min(soonest, now + 60_000);
        break; // record gone or unreadable: nothing of this owner's runs now
      }
      const live = fresh.record.tasks.find((t) => t.id === snapshot.id);
      if (!live || !live.active || !Number.isFinite(live.nextAt) || live.nextAt > now) continue;

      // One run per window, even across a crash between charging and saving.
      // `kvTryLock`, not `kvSetNX`: the boolean folds "the marker exists" and
      // "the KV command failed" into one `false`, and treating a blip as "already
      // ran" advanced `nextAt` past a window that never ran, with no lastError —
      // the run vanished without a trace. Only `held` is evidence of a run.
      const claim = await kvTryLock(ranKey(wallet, live.id, live.nextAt), Date.now(), RAN_TTL_S);
      if (claim === "error") {
        // We learned nothing. Do NOT run (no marker would stop a second charge)
        // and do NOT advance (it may never have run). Leave it due and come
        // back next tick to claim again.
        summary.deferred++;
        soonest = soonest === null ? now + 60_000 : Math.min(soonest, now + 60_000);
        continue;
      }
      if (claim === "held") {
        // Already ran (or is running) for this window — only advance it.
        const windowAt = live.nextAt;
        await patchTask(wallet, live.id, (t) => {
          if (t.nextAt === windowAt) t.nextAt = nextFireAt(t, Date.now());
        });
        continue;
      }
      budget--;

      const outcome = await runTask(live, wallet);
      const ranAt = Date.now();
      if (outcome.kind === "ok") summary.ran++;
      else if (outcome.kind === "insufficient") summary.paused++;
      else summary.failed++;

      const saved = await patchTask(wallet, live.id, (t) => {
        t.lastRun = ranAt;
        if (outcome.kind === "ok") {
          t.lastResult = outcome.text;
          t.lastError  = undefined;
        } else if (outcome.kind === "insufficient") {
          // Switch it off rather than retrying every 5 minutes forever. The
          // user re-enables after topping up, and re-enabling clears this.
          t.active = false;
          t.pausedReason =
            typeof outcome.needed === "number" && typeof outcome.balance === "number"
              ? `Paused — needed ${outcome.needed} credits, balance was ${outcome.balance}. Top up and switch it back on.`
              : typeof outcome.needed === "number"
              ? `Paused — needed ${outcome.needed} credits (balance unknown). Top up and switch it back on.`
              : "Paused — not enough credits. Top up and switch it back on.";
          t.lastError = t.pausedReason;
          if (outcome.text) t.lastResult = outcome.text;
        } else {
          // A transient failure does not pause the task: it records the error
          // and moves to the next window. Pausing on one bad upstream response
          // would silently disable everyone's tasks during an outage.
          t.lastError = outcome.message.slice(0, 300);
        }
        // Advance from now, not from the missed slot — a task does not owe runs
        // for windows it slept through. From the LIVE definition, so a time the
        // user changed mid-run is the one the next window uses.
        t.nextAt = nextFireAt(t, ranAt);
      });
      if (saved !== "ok") {
        // The run happened and was paid for. The window marker above already
        // stops a second charge; losing the result is the smaller harm.
        console.error(`[cron:user-tasks] result not saved for ${wallet}/${live.id}: ${saved}`);
        lostSave = true;
      }
    }

    if (lostSave) soonest = soonest === null ? now + 60_000 : Math.min(soonest, now + 60_000);

    const after = await readOwnerTasks(wallet);
    const mine = earliestNextAt(after.status === "found" ? after.record.tasks : tasks);
    if (mine !== null) soonest = soonest === null ? mine : Math.min(soonest, mine);
  }

  return { ...summary, nextAt: soonest };
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();

  // 1. The one-read fast path. See the header — this is what keeps the whole
  //    feature inside the KV budget.
  const mark = await readWatermark();
  if (mark.status === "unavailable") {
    // Cannot tell whether anything is due. Do nothing: a skipped cycle costs a
    // task at most 5 minutes of lateness, and guessing "probably due" would run
    // a full owner scan on every throttled tick — exactly the load that caused
    // the throttle.
    await heartbeat("skipped", { reason: "watermark unavailable" });
    return NextResponse.json({ status: "skipped", reason: "watermark unavailable" }, { status: 200 });
  }
  if (mark.status === "unset") {
    await heartbeat("idle", { reason: "no schedules" });
    return NextResponse.json({ status: "idle", reason: "no schedules" });
  }
  if (mark.at > now) {
    await heartbeat("idle", { nextAt: mark.at });
    return NextResponse.json({ status: "idle", nextAt: mark.at });
  }

  // 2. One tick at a time. `held` means another invocation is mid-pass; `error`
  //    means we learned nothing about the lock, and running anyway risks
  //    double-charging a task, so both decline.
  const lock = await kvTryLock(LOCK_KEY, { at: now }, LOCK_TTL_S);
  if (lock !== "acquired") {
    await heartbeat("skipped", { reason: `lock ${lock}` });
    return NextResponse.json({ status: "skipped", reason: `lock ${lock}` }, { status: 200 });
  }

  try {
    const result = await tick(now);
    await heartbeat("ok", { ...result });

    // 3. Move the wake-up to the next real deadline. `writeWatermark` clamps it
    //    to at most an hour out, so even a wrong answer here self-corrects.
    await writeWatermark(result.nextAt ?? now + 60 * 60 * 1000, Date.now());

    return NextResponse.json({ status: "ok", ...result });
  } catch (e) {
    // Leave the watermark in the past so the next tick retries rather than
    // sleeping on a half-finished pass.
    await heartbeat("error", { reason: redactWallets((e as Error).message) });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  } finally {
    await kvDel(LOCK_KEY);
  }
}

/** Vercel Cron issues GETs; POST is here so the same URL can be triggered by hand. */
export const POST = GET;
