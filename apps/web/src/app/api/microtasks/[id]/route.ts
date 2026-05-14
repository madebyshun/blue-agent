import { NextRequest, NextResponse } from "next/server";
import { getTask, getClaimsForTask } from "@/lib/micro-storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const task = getTask(id);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const claims = getClaimsForTask(id);
  return NextResponse.json({ task, claims });
}
