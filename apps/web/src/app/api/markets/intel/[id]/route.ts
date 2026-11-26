import { NextRequest, NextResponse } from "next/server";
import { readIntelEvent } from "@/lib/intel/store";
import { buildIntelXDraft } from "@/lib/intel/draft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const event = await readIntelEvent(id);
  if (!event) {
    return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    event,
    draft: buildIntelXDraft(event),
  });
}
