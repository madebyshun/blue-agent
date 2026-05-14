import { NextRequest, NextResponse } from "next/server";
import {
  getTask, upsertTask, createClaim, getClaimForTaskByHandle,
} from "@/lib/micro-storage";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const handle: string = (body.handle ?? "").replace(/^@/, "").trim();

  if (!handle) {
    return NextResponse.json({ error: "handle required" }, { status: 400 });
  }

  const task = getTask(id);
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  if (["completed", "expired", "cancelled"].includes(task.status)) {
    return NextResponse.json({ error: `Task is ${task.status}` }, { status: 409 });
  }

  if (task.slots_remaining <= 0) {
    return NextResponse.json({ error: "No slots remaining" }, { status: 409 });
  }

  if (new Date(task.deadline) < new Date()) {
    task.status = "expired";
    task.updated_at = new Date().toISOString();
    upsertTask(task);
    return NextResponse.json({ error: "Task has expired" }, { status: 410 });
  }

  const existing = getClaimForTaskByHandle(id, handle);
  if (existing) {
    return NextResponse.json({ error: `@${handle} already accepted this task` }, { status: 409 });
  }

  const claim = createClaim(id, handle);

  const updated = { ...task };
  updated.slots_filled += 1;
  updated.slots_remaining -= 1;
  if (updated.status === "open") updated.status = "active";
  updated.updated_at = new Date().toISOString();
  upsertTask(updated);

  return NextResponse.json({ task: updated, claim }, { status: 201 });
}
