/**
 * microtask-auto-approve — finds submitted claims on auto-approval tasks
 * that were not already approved (e.g., submit route failed mid-flight).
 *
 * This is a safety net; the submit API route already handles auto-approval
 * in the happy path. This job catches any stragglers.
 */
import type { StorageAdapter } from "../lib/storage-adapter.js";
import type { Notifier, JobResult } from "../lib/types.js";
import { releaseEscrow, netPayout, PLATFORM_FEE } from "../lib/escrow-adapter.js";

export async function runMicrotaskAutoApprove(
  storage: StorageAdapter,
  notify: Notifier
): Promise<JobResult> {
  const result: JobResult = {
    job: "microtask.autoApprove",
    processed: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    mutations: [],
  };

  const claims = storage.loadClaims();
  const submittedClaims = claims.filter((c) => c.status === "submitted");

  for (const claim of submittedClaims) {
    const task = storage.getTask(claim.task_id);
    if (!task) { result.skipped++; continue; }

    // Only auto-approve if task is set to auto and still active (not expired)
    if (task.approval_mode !== "auto") { result.skipped++; continue; }
    if (task.status === "expired" || task.status === "cancelled") { result.skipped++; continue; }

    try {
      // Approve the claim
      const approvedClaim = {
        ...claim,
        status: "approved" as const,
        submitted_at: claim.submitted_at ?? new Date().toISOString(),
      };
      storage.upsertClaim(approvedClaim);
      result.mutations.push(`claim:autoApprove:${claim.id}`);

      // Release escrow
      const gross = task.reward_per_slot;
      const net = netPayout(gross);
      const updatedTask = releaseEscrow(task, gross);

      // Update slot counts
      const taskClaims = storage.loadClaims().filter((c) => c.task_id === task.id);
      const approvedCount = taskClaims.filter((c) => c.status === "approved").length;
      const activeCount = taskClaims.filter(
        (c) => c.status === "accepted" || c.status === "submitted"
      ).length;
      const newStatus =
        approvedCount >= task.slots_total ? "completed" :
        activeCount > 0 ? "active" : "open";

      storage.upsertTask({
        ...updatedTask,
        slots_filled: approvedCount,
        slots_remaining: Math.max(0, task.slots_total - approvedCount - activeCount),
        status: newStatus,
        updated_at: new Date().toISOString(),
      });
      result.mutations.push(`task:escrow:${task.id}`);

      // Reputation
      const turnaround = claim.submitted_at
        ? Math.round((Date.now() - new Date(claim.accepted_at).getTime()) / 60_000)
        : 0;
      const rep = storage.getReputation(claim.claimant_handle);
      const completed = (rep?.completed ?? 0) + 1;
      const rejected = rep?.rejected ?? 0;
      const totalEarned = (rep?.total_earned_usdc ?? 0) + net;
      const approvalRate = completed / (completed + rejected);
      storage.upsertReputation({
        address: claim.claimant_address,
        handle: claim.claimant_handle,
        score: computeScore(completed, rejected, approvalRate),
        completed,
        rejected,
        approved_rate: approvalRate,
        total_earned_usdc: totalEarned,
        avg_turnaround_minutes: turnaround,
        last_activity: new Date().toISOString(),
      });

      result.processed++;
      notify({
        type: "microtask.autoApproved",
        taskId: task.id,
        claimId: claim.id,
        handle: claim.claimant_handle,
        amount: net,
        message: `Auto-approved @${claim.claimant_handle} for $${net.toFixed(2)} USDC — "${task.title.slice(0, 40)}"`,
      });
    } catch (err) {
      result.failed++;
      result.errors.push(`claim:${claim.id} — ${String(err)}`);
    }
  }

  return result;
}

function computeScore(completed: number, rejected: number, approvalRate: number): number {
  const raw = 50 + completed * 2 - rejected * 5 + Math.round(approvalRate * 30);
  return Math.min(100, Math.max(0, raw));
}
