import { readDraftSnapshot, validSnapshotId } from "@/lib/xdrafts/snapshots";

export const dynamic = "force-dynamic";

/** Public price evidence only. No chat ids, credentials or delivery metadata. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!validSnapshotId(id)) return Response.json({ error: "Invalid snapshot id" }, { status: 400 });
  const p = await readDraftSnapshot(id);
  if (p.status === "error") return Response.json({ error: "Evidence storage unavailable" }, { status: 503 });
  if (p.status === "miss") return Response.json({ error: "Snapshot not found" }, { status: 404 });
  return Response.json({ id, ...p.value });
}
