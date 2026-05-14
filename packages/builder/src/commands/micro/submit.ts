/**
 * blue micro submit — Submit proof for an accepted microtask slot.
 *
 * blue micro submit micro_abc123 https://x.com/yourhandle/status/123456789
 * blue micro submit micro_abc123 "here is my written response" --note "context"
 */

import { printError } from "../../print";
import {
  getTask,
  upsertTask,
  loadClaims,
  saveClaims,
  upsertClaim,
  MicroProof,
  PLATFORM_FEE,
} from "./storage";
import { runMicroApprove } from "./approve";

const LINE = "─".repeat(50);

function isUrl(s: string): boolean {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

function validateProof(proof: string, proofType: MicroProof): string | null {
  switch (proofType) {
    case "url":
    case "reply":
    case "quote":
    case "screenshot":
    case "video":
      if (!isUrl(proof)) {
        return `Proof type "${proofType}" requires a valid URL. Got: "${proof}"`;
      }
      return null;
    case "text":
      if (proof.trim().length < 3) {
        return `Text proof must be at least 3 characters`;
      }
      return null;
    default:
      return null;
  }
}

interface SubmitOptions {
  note?: string;
  handle?: string;
}

export async function runMicroSubmit(
  taskId: string | undefined,
  proof: string | undefined,
  opts: SubmitOptions = {}
): Promise<void> {
  if (!taskId) {
    printError("Usage: blue micro submit <taskId> <proof-url-or-text> [--handle @handle]");
    return;
  }
  if (!proof) {
    printError("Usage: blue micro submit <taskId> <proof-url-or-text>\n  Provide proof URL or text");
    return;
  }

  const task = getTask(taskId);
  if (!task) {
    printError(`Microtask not found: ${taskId}`);
    return;
  }

  if (task.status === "completed" || task.status === "expired" || task.status === "cancelled") {
    printError(`Task ${taskId} is ${task.status}`);
    return;
  }

  // Validate proof format
  const validationError = validateProof(proof, task.proof_required);
  if (validationError) {
    printError(validationError);
    return;
  }

  // Find the claim for this handle (or the most recent accepted claim if no handle given)
  const allClaims = loadClaims();
  let claim = opts.handle
    ? allClaims.find(
        (c) =>
          c.task_id === taskId &&
          c.claimant_handle.toLowerCase() === opts.handle!.replace(/^@/, "").toLowerCase() &&
          c.status === "accepted"
      )
    : allClaims.find((c) => c.task_id === taskId && c.status === "accepted");

  if (!claim) {
    printError(
      `No accepted claim found for task ${taskId}${opts.handle ? ` by @${opts.handle.replace(/^@/, "")}` : ""}.\n` +
      `  Accept first: blue micro accept ${taskId} @yourhandle`
    );
    return;
  }

  // Update claim
  claim.proof = proof;
  claim.proof_note = opts.note;
  claim.submitted_at = new Date().toISOString();
  claim.status = "submitted";

  // Update task status
  task.status = "submitted";
  task.updated_at = new Date().toISOString();

  upsertClaim(claim);
  upsertTask(task);

  process.stdout.write(`\n${LINE}\n  🔵 blue micro submit\n${LINE}\n\n`);
  process.stdout.write(`  ✅ Proof submitted\n\n`);
  process.stdout.write(`  Task:    ${taskId}\n`);
  process.stdout.write(`  Claim:   ${claim.id}\n`);
  process.stdout.write(`  Proof:   ${proof.length > 60 ? proof.slice(0, 57) + "…" : proof}\n`);
  if (opts.note) {
    process.stdout.write(`  Note:    ${opts.note}\n`);
  }
  process.stdout.write(`  Status:  submitted\n`);

  // Auto-approval check
  if (task.approval_mode === "auto") {
    process.stdout.write(`\n  Auto-approval mode — processing...\n`);
    // Small delay for UX clarity
    await new Promise((r) => setTimeout(r, 400));
    await runMicroApprove(taskId, { claimId: claim.id, silent: true });
  } else {
    process.stdout.write(`\n  Waiting for creator approval.\n`);
    process.stdout.write(`  Creator approves with: blue micro approve ${taskId}\n`);
    process.stdout.write(`${LINE}\n\n`);
  }
}
