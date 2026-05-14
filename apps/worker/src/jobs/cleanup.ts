/**
 * cleanup — fixes inconsistent marketplace state.
 *
 * Checks:
 * 1. Tasks where slot counts don't match claims → recompute
 * 2. Tasks in 'open' but slots_remaining = 0 → set 'active'
 * 3. Orphaned claims (task_id not found) → mark expired
 * 4. Tasks in 'active' with no active claims → set back to 'open'
 */
import type { StorageAdapter } from "../lib/storage-adapter.js";
import type { Notifier, JobResult } from "../lib/types.js";

export async function runCleanup(
  storage: StorageAdapter,
  notify: Notifier
): Promise<JobResult> {
  const result: JobResult = {
    job: "cleanup.staleRecords",
    processed: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    mutations: [],
  };

  try {
    const tasks = storage.loadTasks();
    const claims = storage.loadClaims();
    const taskIds = new Set(tasks.map((t) => t.id));

    // 1) Orphaned claims
    for (const claim of claims) {
      if (!taskIds.has(claim.task_id) && claim.status !== "expired") {
        const fixed = { ...claim, status: "expired" as const };
        storage.upsertClaim(fixed);
        result.mutations.push(`claim:orphan:${claim.id}`);
        result.processed++;
      }
    }

    // 2) Fix slot counts and statuses
    for (const task of tasks) {
      if (task.status === "expired" || task.status === "completed" || task.status === "cancelled") {
        result.skipped++;
        continue;
      }

      const taskClaims = claims.filter((c) => c.task_id === task.id);
      const approved = taskClaims.filter((c) => c.status === "approved").length;
      const active = taskClaims.filter(
        (c) => c.status === "accepted" || c.status === "submitted"
      ).length;
      const remaining = Math.max(0, task.slots_total - approved - active);

      let dirty = false;
      // eslint-disable-next-line prefer-const
      let newStatus = task.status as string;
      let slots_filled = task.slots_filled;
      let slots_remaining = task.slots_remaining;

      // Fix slot counts
      if (slots_filled !== approved) {
        slots_filled = approved;
        dirty = true;
      }
      if (slots_remaining !== remaining) {
        slots_remaining = remaining;
        dirty = true;
      }

      // Fix status
      if (approved >= task.slots_total && newStatus !== "completed") {
        newStatus = "completed";
        dirty = true;
      } else if (remaining === 0 && newStatus === "open") {
        newStatus = "active";
        dirty = true;
      } else if (remaining > 0 && newStatus === "active" && active === 0) {
        newStatus = "open";
        dirty = true;
      }

      if (dirty) {
        const status = newStatus as typeof task.status;
        storage.upsertTask({ ...task, status, slots_filled, slots_remaining, updated_at: new Date().toISOString() });
        result.mutations.push(`task:fix:${task.id}`);
        result.processed++;
      } else {
        result.skipped++;
      }
    }

    if (result.mutations.length > 0) {
      notify({
        type: "cleanup.fixed",
        message: `Cleanup fixed ${result.mutations.length} record(s): ${result.mutations.slice(0, 5).join(", ")}${result.mutations.length > 5 ? "…" : ""}`,
      });
    }
  } catch (err) {
    result.failed++;
    result.errors.push(String(err));
  }

  return result;
}
