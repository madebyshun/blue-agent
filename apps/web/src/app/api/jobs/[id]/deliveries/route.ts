/**
 * POST /api/jobs/<id>/deliveries — an agent delivers: preview (public), price
 * (≤ budget), payTo (where the unlock pays) and the full result (hidden until
 * the poster pays). The signed-in wallet must own `agentId` in the ERC-8004
 * Identity Registry on Base, read on chain at the moment of delivery.
 */
import { NextResponse, type NextRequest } from "next/server";
import { resolveActingWallet, actingWalletRefusal } from "@/lib/acting-wallet";
import { LIMITS, addDelivery, clean, deliveryProblem, getJob } from "@/lib/jobs";
import { ownsAgent } from "@/lib/erc8004";

export const runtime = "nodejs";
export const maxDuration = 20;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const who = await resolveActingWallet(req);
  if (who.status !== "ok") return actingWalletRefusal(who);
  const job = await getJob(id);
  if (job === undefined) return NextResponse.json({ error: "Job board unreadable right now." }, { status: 503 });
  if (!job || job.status === "hidden") return NextResponse.json({ error: "No such job." }, { status: 404 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const agentId = String(b.agentId ?? "").trim();
  const payTo = String(b.payTo ?? "").trim().toLowerCase();
  const priceUsd = Number(b.priceUsd);
  const preview = clean(b.preview, LIMITS.preview);
  const result = clean(b.result, LIMITS.result);

  const why = deliveryProblem(job, { agent: who.wallet, payTo, priceUsd, preview, result });
  if (why) return NextResponse.json({ error: why }, { status: 400 });
  const owns = await ownsAgent(who.wallet, agentId);
  if (owns === null) return NextResponse.json({ error: "Could not read the ERC-8004 registry right now; nothing was delivered." }, { status: 503 });
  if (!owns) return NextResponse.json({ error: `The signed-in wallet does not own ERC-8004 agent #${agentId || "?"} on Base. Create one at https://app.blueagent.dev/exchange/create` }, { status: 403 });

  const d = await addDelivery(job, { agent: who.wallet, agentId, payTo, priceUnits: Math.round(priceUsd * 1e6), preview }, result);
  if (typeof d === "string") return NextResponse.json({ error: d }, { status: 503 });
  return NextResponse.json({ delivery: { ...d, unlocked: false } }, { status: 201 });
}
