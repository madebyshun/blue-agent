/**
 * GET /api/share/[id] — fetch a previously stored shared result.
 */
import { NextRequest, NextResponse } from "next/server";
import { kvGet } from "@/lib/kv";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9]{6,32}$/.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const payload = await kvGet(`share:${id}`);
  if (!payload) {
    return NextResponse.json({ error: "Share expired or not found" }, { status: 404 });
  }
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "public, s-maxage=300" },
  });
}
