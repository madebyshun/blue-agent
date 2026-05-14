/**
 * microtask-expire — marks overdue tasks and claims as expired.
 *
 * Grace period: claims in `submitted` status get 24h past the task deadline
 * before being force-expired, giving the creator time to review.
 */
import type { StorageAdapter } from "../lib/storage-adapter.js";
import type { Notifier, JobResult, MicroTask, MicroClaim } from "../lib/types.js";

const SUBMITTED_GRACE_MS = 24 * 60 * 60 * 1000; // 24 h

function shouldExpireTask(task: MicroTask): boolean {
  if (task.status === "expired" || task.status === "completed" || task.status === "cancelled") {
    return false;
  }
  return new Date(task.deadline) < new Date();
}

function shouldExpireClaim(claim: MicroClaim, task: MicroTask): boolean {
  if (claim.status === "approved" || claim.status === "rejected" || claim.status === "expired") {
    return false;
  }
  const deadlinePast = new Date(task.deadline) < new Date();
  if (!deadlinePast) return false;

  if (claim.status === "submitted") {
    // Grace period: keep submitted claims alive for 24h past deadline
    const graceCutoff = new Date(task.deadline).getTime() + SUBMITTED_GRACE_MS;
    return Date.now() > graceCutoff;
  }

  // accepted-but-not-submitted: expire immediately after deadline
  return true;
}

export async function runMicrotaskExpiry(
  storage: StorageAdapter,
  notify: Notifier
): Promise<JobResult> {
  const result: JobResult = { job: "microtask.expire", processed: 0, skipped: 0, failed: 0, errors: [], mutations: [] };

  const tasks = storage.loadTasks();
  const claims = storage.loadClaims();

  for (const task of tasks) {
    if (!shouldExpireTask(task)) { result.skipped++; continue; }

    try {
      const taskClaims = claims.filter((c) => c.task_id === task.id);
      let claimsModified = false;

      for (const claim of taskClaims) {
        if (!shouldExpireClaim(claim, task)) continue;
        claim.status = "expired";
        storage.upsertClaim(claim);
        claimsModified = true;
        result.mutations.push(`claim:expire:${claim.id}`);
        notify({
          type: "claim.expired",
          taskId: task.id,
          claimId: claim.id,
          handle: claim.claimant_handle,
          message: `Claim by @${claim.claimant_handle} expired (task: ${task.title.slice(0, 40)})`,
        });
      }

      // Recalculate slots after expiring claims
      const updatedClaims = storage.loadClaims().filter((c) => c.task_id === task.id);
      const filled = updatedClaims.filter((c) => c.status === "approved").length;
      const active = updatedClaims.filter((c) =>
        c.status === "accepted" || c.status === "submitted"
      ).length;

      const updatedTask: MicroTask = {
        ...task,
        status: "expired",
        slots_filled: filled,
        slots_remaining: Math.max(0, task.slots_total - filled - active),
        updated_at: new Date().toISOString(),
      };
      storage.upsertTask(updatedTask);

      result.mutations.push(`task:expire:${task.id}`);
      result.processed++;
      notify({
        type: "microtask.expired",
        taskId: task.id,
        creatorHandle: task.creator_handle,
        message: `Task expired: "${task.title.slice(0, 50)}" — creator @${task.creator_handle ?? "unknown"}`,
      });
    } catch (err) {
      result.failed++;
      result.errors.push(`task:${task.id} — ${String(err)}`);
    }
  }

  return result;
}
