import { NextRequest, NextResponse } from "next/server";
import {
  getTask, upsertTask, loadClaims, upsertClaim,
  updateReputation, escrowRelease, escrowRefundSlot,
} from "@/lib/micro-storage";
import { PLATFORM_FEE } from "@/lib/micro-types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { action, claim_id } = body;  // action: "approve" | "reject"

  if (!["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
  }

  const task = getTask(id);
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const allClaims = loadClaims();
  let pending = allClaims.filter((c) => c.task_id === id && c.status === "submitted");
  if (claim_id) pending = pending.filter((c) => c.id === claim_id);

  if (pending.length === 0) {
    return NextResponse.json({ error: "No pending submissions" }, { status: 404 });
  }

  const results = [];
  let updatedTask = { ...task };

  for (const claim of pending) {
    if (action === "approve") {
      const gross = task.reward_per_slot;
      const fee = gross * PLATFORM_FEE;
      const net = gross - fee;

      claim.status = "approved";
      claim.payout_tx = "0x" + Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join("");
      upsertClaim(claim);

      updatedTask = escrowRelease(updatedTask, net) as typeof updatedTask;

      const approvedCount = loadClaims().filter(
        (c) => c.task_id === id && c.status === "approved"
      ).length;
      updatedTask.status = approvedCount >= task.slots_total ? "completed" : "active";

      const turnaround = claim.submitted_at
        ? Math.round((Date.now() - new Date(claim.accepted_at).getTime()) / 60_000)
        : 0;
      updateReputation(claim.claimant_handle, {
        completed: 1, total_earned_usdc: net, avg_turnaround_minutes: turnaround,
      });

      results.push({ claim, action: "approved", payout: { gross, fee, net } });
    } else {
      claim.status = "rejected";
      upsertClaim(claim);

      updatedTask = escrowRefundSlot(updatedTask) as typeof updatedTask;
      updatedTask.slots_filled = Math.max(0, updatedTask.slots_filled - 1);
      updatedTask.slots_remaining = Math.min(
        updatedTask.slots_total,
        updatedTask.slots_remaining + 1
      );
      if (updatedTask.slots_remaining > 0 && updatedTask.status !== "completed") {
        updatedTask.status = "active";
      }

      updateReputation(claim.claimant_handle, { rejected: 1 });

      results.push({ claim, action: "rejected" });
    }
  }

  updatedTask.updated_at = new Date().toISOString();
  upsertTask(updatedTask as typeof task);

  return NextResponse.json({ task: updatedTask, results });
}
