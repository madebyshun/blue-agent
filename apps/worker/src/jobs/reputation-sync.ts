/**
 * reputation-sync — recomputes reputation scores for all handles
 * from scratch based on approved/rejected claims.
 *
 * Idempotent: rewrites the full reputation file each run.
 */
import type { StorageAdapter } from "../lib/storage-adapter.js";
import type { Notifier, JobResult, MicroReputation } from "../lib/types.js";

function computeScore(completed: number, rejected: number, approvalRate: number): number {
  const raw = 50 + completed * 2 - rejected * 5 + Math.round(approvalRate * 30);
  return Math.min(100, Math.max(0, raw));
}

function avgTurnaround(turnarounds: number[]): number {
  if (turnarounds.length === 0) return 0;
  return Math.round(turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length);
}

export async function runReputationSync(
  storage: StorageAdapter,
  notify: Notifier
): Promise<JobResult> {
  const result: JobResult = {
    job: "reputation.sync",
    processed: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    mutations: [],
  };

  try {
    const claims = storage.loadClaims();
    const handles = new Set(claims.map((c) => c.claimant_handle));

    const updatedReps: MicroReputation[] = [];

    for (const handle of handles) {
      const handleClaims = claims.filter((c) => c.claimant_handle === handle);
      const approved = handleClaims.filter((c) => c.status === "approved");
      const rejected = handleClaims.filter((c) => c.status === "rejected");

      const completed = approved.length;
      const rejectedCount = rejected.length;
      const total = completed + rejectedCount;
      const approvalRate = total > 0 ? completed / total : 1;

      // Net payout: 95% of reward_per_slot per approved claim
      // We can't easily get reward here without loading tasks, so we track
      // total_earned_usdc from the existing rep record and only update score/counts
      const existing = storage.getReputation(handle);
      const totalEarned = existing?.total_earned_usdc ?? 0;

      const turnarounds = approved
        .filter((c) => c.submitted_at && c.accepted_at)
        .map((c) =>
          Math.round(
            (new Date(c.submitted_at!).getTime() - new Date(c.accepted_at).getTime()) / 60_000
          )
        )
        .filter((t) => t > 0);

      const lastActivity =
        handleClaims
          .map((c) => c.submitted_at ?? c.accepted_at)
          .sort()
          .reverse()[0] ?? new Date().toISOString();

      const rep: MicroReputation = {
        address: existing?.address ?? "",
        handle,
        score: computeScore(completed, rejectedCount, approvalRate),
        completed,
        rejected: rejectedCount,
        approved_rate: approvalRate,
        total_earned_usdc: totalEarned,
        avg_turnaround_minutes: avgTurnaround(turnarounds),
        last_activity: lastActivity,
      };

      updatedReps.push(rep);
      result.mutations.push(`rep:sync:${handle}`);
    }

    storage.saveReputation(updatedReps);
    result.processed = updatedReps.length;

    if (updatedReps.length > 0) {
      notify({
        type: "reputation.synced",
        message: `Synced reputation for ${updatedReps.length} handle(s)`,
      });
    }
  } catch (err) {
    result.failed++;
    result.errors.push(String(err));
  }

  return result;
}
