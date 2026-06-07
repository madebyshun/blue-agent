/**
 * /api/hub/builders/[address]/tools — tools owned by a wallet, with live stats.
 */
import { NextRequest, NextResponse } from "next/server";
import { getBuilderTools } from "@/lib/hub-registry";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  const tools = await getBuilderTools(address);
  return NextResponse.json({ tools, count: tools.length }, {
    headers: { "Cache-Control": "private, no-cache" },
  });
}
