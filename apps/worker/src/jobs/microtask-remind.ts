/**
 * microtask-remind — reminds creators when they have pending submissions
 * that haven't been reviewed for >12 hours.
 *
 * Uses worker-state.reminded_tasks to track last reminder time.
 */
import type { StorageAdapter } from "../lib/storage-adapter.js";
import type { Notifier, JobResult } from "../lib/types.js";

const REMIND_AFTER_MS = 12 * 60 * 60 * 1000; // 12 h
const REMIND_COOLDOWN_MS = 24 * 60 * 60 * 1000; // re-remind once/day max

export async function runMicrotaskRemind(
  storage: StorageAdapter,
  notify: Notifier
): Promise<JobResult> {
  const result: JobResult = {
    job: "microtask.remindCreator",
    processed: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    mutations: [],
  };

  const tasks = storage.loadTasks();
  const claims = storage.loadClaims();
  const state = storage.loadWorkerState();
  const now = Date.now();

  for (const task of tasks) {
    if (task.status === "expired" || task.status === "completed" || task.status === "cancelled") {
      result.skipped++;
      continue;
    }
    if (task.approval_mode === "auto") {
      result.skipped++;
      continue; // auto tasks don't need creator reminders
    }

    const pendingClaims = claims.filter(
      (c) => c.task_id === task.id && c.status === "submitted"
    );
    if (pendingClaims.length === 0) { result.skipped++; continue; }

    // Check if any submission is old enough to warrant a reminder
    const oldestSubmission = pendingClaims
      .map((c) => new Date(c.submitted_at ?? c.accepted_at).getTime())
      .sort()[0];
    const submissionAge = now - oldestSubmission;
    if (submissionAge < REMIND_AFTER_MS) { result.skipped++; continue; }

    // Cooldown: don't spam
    const lastReminded = state.reminded_tasks[task.id];
    if (lastReminded && now - new Date(lastReminded).getTime() < REMIND_COOLDOWN_MS) {
      result.skipped++;
      continue;
    }

    try {
      state.reminded_tasks[task.id] = new Date().toISOString();
      storage.saveWorkerState(state);

      result.mutations.push(`reminder:${task.id}`);
      result.processed++;
      notify({
        type: "microtask.reminded",
        taskId: task.id,
        creatorHandle: task.creator_handle,
        message: `Reminder: @${task.creator_handle ?? "creator"} has ${pendingClaims.length} pending submission(s) on "${task.title.slice(0, 40)}"`,
      });
    } catch (err) {
      result.failed++;
      result.errors.push(`task:${task.id} — ${String(err)}`);
    }
  }

  return result;
}
