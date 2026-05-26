import { NextResponse } from "next/server";
import { kvGet } from "@/lib/kv";
import type { AgentProfile } from "../submit/route";

const KEY_INDEX = "registry:index";
const KEY_AGENT = (h: string) => `registry:agent:${h}`;

export async function GET() {
  try {
    const index = (await kvGet<string[]>(KEY_INDEX)) ?? [];

    const profiles = await Promise.all(
      index.map(h => kvGet<AgentProfile>(KEY_AGENT(h)))
    );

    const agents = profiles
      .filter((p): p is AgentProfile => p !== null)
      .sort((a, b) => b.health_score - a.health_score);

    return NextResponse.json({ agents, total: agents.length });
  } catch (err) {
    console.error("[agent-registry/list]", err);
    return NextResponse.json({ agents: [], total: 0 });
  }
}
