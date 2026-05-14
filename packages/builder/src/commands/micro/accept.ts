/**
 * blue micro accept — Accept one slot on a microtask.
 *
 * blue micro accept micro_abc123 @yourhandle
 */

import { printError } from "../../print";
import {
  getTask,
  upsertTask,
  createClaim,
  getClaimForTaskByHandle,
} from "./storage";

const LINE = "─".repeat(50);

export async function runMicroAccept(
  taskId: string | undefined,
  handle: string | undefined
): Promise<void> {
  if (!taskId) {
    printError("Usage: blue micro accept <taskId> @handle");
    return;
  }
  if (!handle) {
    printError("Usage: blue micro accept <taskId> @handle\n  Provide your @handle");
    return;
  }

  const cleanHandle = handle.replace(/^@/, "");

  const task = getTask(taskId);
  if (!task) {
    printError(`Microtask not found: ${taskId}`);
    return;
  }

  if (task.status === "completed" || task.status === "expired" || task.status === "cancelled") {
    printError(`Task ${taskId} is ${task.status} and cannot be accepted`);
    return;
  }

  if (task.slots_remaining <= 0) {
    printError(`No slots remaining for task ${taskId}. All ${task.slots_total} slots are filled.`);
    return;
  }

  // Check deadline
  if (new Date(task.deadline) < new Date()) {
    // Mark expired and reject
    task.status = "expired";
    task.updated_at = new Date().toISOString();
    upsertTask(task);
    printError(`Task ${taskId} has expired (deadline: ${task.deadline})`);
    return;
  }

  // Check if this handle already has a claim
  const existing = getClaimForTaskByHandle(taskId, cleanHandle);
  if (existing) {
    printError(`@${cleanHandle} has already accepted task ${taskId} (claim: ${existing.id})`);
    return;
  }

  // Create claim
  const claim = createClaim(taskId, cleanHandle);

  // Update task
  task.slots_filled += 1;
  task.slots_remaining -= 1;
  if (task.status === "open") task.status = "active";
  task.updated_at = new Date().toISOString();
  upsertTask(task);

  process.stdout.write(`\n${LINE}\n  🔵 blue micro accept\n${LINE}\n\n`);
  process.stdout.write(`  ✅ Slot accepted\n\n`);
  process.stdout.write(`  Task:     ${taskId}\n`);
  process.stdout.write(`  Claim:    ${claim.id}\n`);
  process.stdout.write(`  Claimed:  @${cleanHandle}\n`);
  process.stdout.write(`  Reward:   $${task.reward_per_slot.toFixed(2)}\n`);
  process.stdout.write(`  Slots remaining: ${task.slots_remaining}/${task.slots_total}\n`);
  process.stdout.write(`\n  Next: submit proof with\n`);
  process.stdout.write(`    blue micro submit ${taskId} <proof-url>\n`);
  process.stdout.write(`${LINE}\n\n`);
}
