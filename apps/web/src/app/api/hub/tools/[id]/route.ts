/**
 * /api/hub/tools/[id] — get a single registered tool with live call/revenue stats.
 */
import { NextRequest, NextResponse } from "next/server";
import { getRegisteredTool } from "@/lib/hub-registry";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const tool = await getRegisteredTool(id);
  if (!tool) return NextResponse.json({ error: "Tool not found" }, { status: 404 });
  return NextResponse.json(tool, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
  });
}
