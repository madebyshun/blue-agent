import { NextRequest, NextResponse } from "next/server";
import { kvGet } from "@/lib/kv";
import type { AgentProfile } from "../submit/route";

const KEY_AGENT = (h: string) => `registry:agent:${h}`;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  try {
    const { handle } = await params;
    const profile = await kvGet<AgentProfile>(KEY_AGENT(handle));
    if (!profile) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }
    return NextResponse.json(profile);
  } catch (err) {
    console.error("[agent-registry/handle]", err);
    return NextResponse.json({ error: "Failed to fetch agent" }, { status: 500 });
  }
}
