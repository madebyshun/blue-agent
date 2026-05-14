/**
 * microtask-refund — processes escrow refunds for expired tasks.
 *
 * Refundable amount = locked - released - already_refunded.
 * Idempotency: escrow.status === 'refunded' means already done, skip.
 */
import type { StorageAdapter } from "../lib/storage-adapter.js";
import type { Notifier, JobResult } from "../lib/types.js";
import { refundEscrow, refundableAmount } from "../lib/escrow-adapter.js";

export async function runMicrotaskRefund(
  storage: StorageAdapter,
  notify: Notifier
): Promise<JobResult> {
  const result: JobResult = {
    job: "microtask.refund",
    processed: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    mutations: [],
  };

  const tasks = storage.loadTasks();
  const refundable = tasks.filter(
    (t) =>
      (t.status === "expired" || t.status === "cancelled") &&
      t.escrow.status !== "refunded" &&
      refundableAmount(t) > 0.001 // threshold to avoid dust
  );

  for (const task of refundable) {
    try {
      const amount = refundableAmount(task);
      const updatedTask = refundEscrow(task, amount);
      storage.upsertTask({ ...updatedTask, updated_at: new Date().toISOString() });

      result.mutations.push(`task:refund:${task.id}:$${amount.toFixed(4)}`);
      result.processed++;
      notify({
        type: "microtask.refunded",
        taskId: task.id,
        creatorHandle: task.creator_handle,
        amount,
        message: `Refunded $${amount.toFixed(2)} USDC to @${task.creator_handle ?? "creator"} — task "${task.title.slice(0, 40)}"`,
      });
    } catch (err) {
      result.failed++;
      result.errors.push(`task:${task.id} — ${String(err)}`);
    }
  }

  return result;
}
