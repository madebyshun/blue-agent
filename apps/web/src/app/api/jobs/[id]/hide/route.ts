/** POST /api/jobs/<id>/hide — moderation, ShunTr only (Bearer CRON_SECRET). {"hidden": false} restores. */
import { NextResponse, type NextRequest } from "next/server";
import { setStatus } from "@/lib/jobs";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { hidden?: boolean };
  const ok = await setStatus(id, b.hidden === false ? "open" : "hidden");
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "No such job or KV unavailable." }, { status: 404 });
}
