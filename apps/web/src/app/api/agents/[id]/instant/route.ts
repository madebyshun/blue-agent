/**
 * GET /api/agents/<id>/instant — what this agent sells instantly, for the job
 * form's direct hire. Only a verified BaseCity Blocky has an answer: its own
 * skills at its own price, and the payTo it is paid to (the Blocky's owner,
 * read on chain). Anyone else: { blocky: null }. Read-only, no session.
 */
import { NextResponse } from "next/server";
import { readAgentCard } from "@/lib/agent-ledger";
import { blockyOwner, blockyServices } from "@/lib/blocky-instant";

export const runtime = "nodejs";
export const maxDuration = 20;
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,12}$/.test(id)) return NextResponse.json({ error: "Not an agent id." }, { status: 400 });
  const card = await readAgentCard(id);
  const n = card?.blocky?.n;
  if (!n) return NextResponse.json({ agentId: id, blocky: null });
  const [payTo, services] = await Promise.all([blockyOwner(n), blockyServices(n)]);
  return NextResponse.json({ agentId: id, blocky: { n, guild: card!.blocky!.guild ?? null, level: card!.blocky!.level ?? null, skills: card!.blocky!.skills ?? [] }, payTo, services: payTo ? services : [] });
}
