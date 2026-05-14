import { NextRequest, NextResponse } from "next/server";
import {
  getTask, upsertTask, loadClaims, saveClaims, upsertClaim,
  updateReputation, escrowRelease,
} from "@/lib/micro-storage";
import { PLATFORM_FEE } from "@/lib/micro-types";
import type { MicroClaim } from "@/lib/micro-types";

function isUrl(s: string): boolean {
  try { new URL(s); return true; } catch { return false; }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { proof, proof_note, handle } = body;

  if (!proof?.trim()) {
    return NextResponse.json({ error: "proof required" }, { status: 400 });
  }

  const task = getTask(id);
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  if (["completed", "expired", "cancelled"].includes(task.status)) {
    return NextResponse.json({ error: `Task is ${task.status}` }, { status: 409 });
  }

  // Validate proof format
  const urlProofs = ["url", "reply", "quote", "screenshot", "video"];
  if (urlProofs.includes(task.proof_required) && !isUrl(proof)) {
    return NextResponse.json(
      { error: `Proof type "${task.proof_required}" requires a valid URL` },
      { status: 400 }
    );
  }

  // Find claim
  const allClaims = loadClaims();
  let claim: MicroClaim | undefined;
  if (handle) {
    const h = handle.replace(/^@/, "").toLowerCase();
    claim = allClaims.find(
      (c) => c.task_id === id && c.claimant_handle.toLowerCase() === h && c.status === "accepted"
    );
  } else {
    claim = allClaims.find((c) => c.task_id === id && c.status === "accepted");
  }

  if (!claim) {
    return NextResponse.json(
      { error: "No accepted claim found. Accept the task first." },
      { status: 409 }
    );
  }

  claim.proof = proof;
  claim.proof_note = proof_note;
  claim.submitted_at = new Date().toISOString();
  claim.status = "submitted";
  upsertClaim(claim);

  let updatedTask = { ...task, status: "submitted" as const, updated_at: new Date().toISOString() };

  // Auto-approval
  if (task.approval_mode === "auto") {
    claim.status = "approved";
    claim.payout_tx = "0x" + Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join("");
    upsertClaim(claim);

    const gross = task.reward_per_slot;
    const net = gross * (1 - PLATFORM_FEE);
    updatedTask = escrowRelease(updatedTask as typeof task, net) as typeof updatedTask;

    // Check if all slots done
    const approvedCount = loadClaims().filter(
      (c) => c.task_id === id && c.status === "approved"
    ).length;
    if (approvedCount >= task.slots_total) updatedTask.status = "completed" as typeof updatedTask.status;
    else updatedTask.status = "active" as typeof updatedTask.status;

    // Reputation
    const turnaround = Math.round(
      (Date.now() - new Date(claim.accepted_at).getTime()) / 60_000
    );
    updateReputation(claim.claimant_handle, {
      completed: 1,
      total_earned_usdc: net,
      avg_turnaround_minutes: turnaround,
    });

    upsertTask(updatedTask as typeof task);
    return NextResponse.json({
      task: updatedTask, claim,
      auto_approved: true,
      payout: { gross, fee: gross * PLATFORM_FEE, net },
    });
  }

  upsertTask(updatedTask as typeof task);
  return NextResponse.json({ task: updatedTask, claim, auto_approved: false });
}
