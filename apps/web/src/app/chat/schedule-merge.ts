/**
 * Blue Chat — the list arithmetic behind the Scheduled panel's state.
 *
 * Every function here takes the task list AS IT IS NOW and returns the next
 * one, so ChatContext can apply it inside ONE functional state update
 * (`mutateCrons(prev => …)`). That shape is the whole fix, not a style choice.
 *
 * Until 2026-10-01 the writers were `setCrons(crons.map(…))` over the `crons`
 * their render had closed over. Two things went wrong with that, and both
 * moved money:
 *   • A loop of patches — the pull applying the server's state task by task,
 *     "turn off all background tasks" flipping each one — started every call
 *     from the same stale array, so only the LAST patch survived. Turning off
 *     three tasks turned off one; the push effect then re-uploaded the other
 *     two right after the DELETE, and the server re-enrolled them. A pull that
 *     reported two paused tasks showed one, and the next edit re-activated the
 *     other on the server.
 *   • "Run now" waits up to 100 s, then wrote its result over the list as it
 *     was at the click. A task deleted or switched off during the run came
 *     back — and was uploaded again, and fired again, and billed again.
 *
 * Pure and dependency-light so `scripts/schedule-merge-test.ts` can pin it
 * without React.
 */
import type { CronTask, CronSchedule } from "./types";
import { isBackground } from "./storage";

/** A task as GET /api/chat/schedule returns it: client-owned fields plus the server-owned ones. */
export interface ServerTask {
  id:            string;
  label?:        string;
  schedule?:     string;
  time?:         string;
  tz?:           string;
  prompt?:       string;
  tier?:         string;
  active?:       boolean;
  nextAt?:       number;
  lastRun?:      number;
  lastResult?:   string;
  lastError?:    string;
  pausedReason?: string;
}

/**
 * Patch one task by id. Returns `prev` itself when the id is gone, so a patch
 * that arrives late (a run finishing after its task was deleted, or after the
 * wallet switched) is a no-op — it neither resurrects the task nor rewrites
 * another wallet's list.
 */
export function patchById(prev: CronTask[], id: string, patch: Partial<CronTask>): CronTask[] {
  if (!prev.some(c => c.id === id)) return prev;
  return prev.map(c => (c.id === id ? { ...c, ...patch } : c));
}

/**
 * Apply a whole pull in one pass: every server patch AND every adoption.
 *
 * Ownership is the one documented in use-schedule-sync.ts: the server owns
 * nextAt · lastRun · lastResult · lastError · pausedReason, and `active` only
 * when it carries a `pausedReason` — a pause is a fact about a run that already
 * happened, while a bare `active:false` may be an older copy of a task the user
 * re-enabled here.
 *
 * A task the server runs but this list has never seen (another device, cleared
 * storage — Scheduled research L4) is appended, marked background, so it can be
 * seen and switched off from here.
 */
export function applyServerPull(prev: CronTask[], tasks: ServerTask[]): CronTask[] {
  const byId = new Map<string, ServerTask>();
  for (const t of tasks) if (t?.id && !byId.has(t.id)) byId.set(t.id, t);

  const next = prev.map(c => {
    const t = byId.get(c.id);
    if (!t) return c;
    const patch: Partial<CronTask> = {
      nextAt:     t.nextAt,
      lastRun:    t.lastRun,
      lastResult: t.lastResult,
      lastError:  t.lastError,
    };
    if (t.pausedReason) {
      patch.pausedReason = t.pausedReason;
      patch.active = false;
    } else {
      patch.pausedReason = undefined;
    }
    return { ...c, ...patch };
  });

  const known = new Set(prev.map(c => c.id));
  for (const t of byId.values()) {
    if (known.has(t.id) || typeof t.prompt !== "string") continue;
    next.push({
      id: t.id,
      label: t.label ?? "Scheduled task",
      schedule: (t.schedule === "weekly" ? "weekly" : "daily") as CronSchedule,
      time: t.time ?? "09:00",
      tz: t.tz,
      prompt: t.prompt,
      tier: t.tier,
      active: t.pausedReason ? false : t.active !== false,
      background: true,
      nextAt: t.nextAt,
      lastRun: t.lastRun,
      lastResult: t.lastResult,
      lastError: t.lastError,
      pausedReason: t.pausedReason,
    });
  }
  return next;
}

/**
 * Adopt the `nextAt` a successful PUT computed, so the panel shows the instant
 * the cron will use. Only for tasks that are STILL background: one switched to
 * "on open" while the PUT was in flight must not get a firing time back.
 */
export function applyServerNextAt(prev: CronTask[], tasks: ServerTask[]): CronTask[] {
  const at = new Map<string, number>();
  for (const t of tasks) if (t?.id && typeof t.nextAt === "number") at.set(t.id, t.nextAt);
  if (at.size === 0) return prev;
  return prev.map(c => (isBackground(c) && at.has(c.id) ? { ...c, nextAt: at.get(c.id) } : c));
}

/**
 * The server-owned fields a task sheds when it stops running in the background:
 * a stale `nextAt` would make the card claim a firing time nothing will honour.
 */
export const FOREGROUND_PATCH: Partial<CronTask> = {
  background: false, nextAt: undefined, pausedReason: undefined,
};

/** "Turn off all background tasks", locally: every one of them, in one pass. */
export function switchAllToForeground(prev: CronTask[]): CronTask[] {
  if (!prev.some(isBackground)) return prev;
  return prev.map(c => (isBackground(c) ? { ...c, ...FOREGROUND_PATCH } : c));
}
