/**
 * POST /api/jobs/<id>/deliveries/<did>/unlock — the poster pays the delivering
 * agent, over x402, and gets the result.
 *
 *   no X-PAYMENT → 402 with requirements: the delivery's price, in USDC on Base,
 *                  to the AGENT's payTo (buildRequirementsTo). Not to Blue Agent.
 *   X-PAYMENT    → refused unless its payer is the poster (only they unlock);
 *                  then CDP verify → settle → the result.
 * Already unlocked → the result again, no second charge.
 */
import { NextResponse, type NextRequest } from "next/server";
import { buildRequirementsTo, cdpVerify, cdpSettle } from "@/app/api/_lib/x402-cdp";
import { getJob, readResult, recordUnlock } from "@/lib/jobs";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function payerOf(xPayment: string): string | null {
  try {
    const p = JSON.parse(Buffer.from(xPayment, "base64").toString("utf8")) as { payload?: { authorization?: { from?: string } } };
    const f = p.payload?.authorization?.from;
    return typeof f === "string" ? f.toLowerCase() : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; did: string }> }) {
  const { id, did } = await params;
  const job = await getJob(id);
  if (job === undefined) return NextResponse.json({ error: "Job board unreadable right now." }, { status: 503 });
  if (!job || job.status === "hidden") return NextResponse.json({ error: "No such job." }, { status: 404 });
  const d = job.deliveries.find((x) => x.id === did);
  if (!d) return NextResponse.json({ error: "No such delivery." }, { status: 404 });

  const requirements = buildRequirementsTo(String(d.priceUnits), d.payTo);
  const resource = { url: `https://blueagent.dev/api/jobs/${id}/deliveries/${did}/unlock`, description: `Unlock a delivery for job: ${job.title}`.slice(0, 300), mimeType: "application/json" };
  const xPayment = req.headers.get("x-payment") ?? req.headers.get("payment-signature");
  if (!xPayment) {
    if (d.unlock) return NextResponse.json({ error: "Already unlocked. The poster can read it from the job page." }, { status: 409 });
    return NextResponse.json({ x402Version: 2, accepts: [requirements], resource, error: "Payment required" }, { status: 402 });
  }

  const payer = payerOf(xPayment);
  if (!payer || payer !== job.poster) {
    return NextResponse.json({ error: "Only the wallet that posted this job can unlock its deliveries. Nothing was charged." }, { status: 403 });
  }
  const result = await readResult(id, did);
  if (result === null) return NextResponse.json({ error: "This delivery's result is missing; nothing was charged." }, { status: 410 });
  if (d.unlock) return NextResponse.json({ result, unlock: d.unlock });

  let payload: unknown;
  try { payload = JSON.parse(Buffer.from(xPayment, "base64").toString("utf8")); } catch { return NextResponse.json({ error: "Malformed X-PAYMENT." }, { status: 400 }); }
  const verify = await cdpVerify(payload, requirements, resource);
  if (!verify.ok) return NextResponse.json({ error: "Payment verification failed. Nothing was charged.", detail: verify.detail }, { status: 402 });
  const settle = await cdpSettle(payload, requirements, resource);
  if (!settle.ok) return NextResponse.json({ error: "Payment did not settle. Nothing was charged; try again.", detail: settle.detail }, { status: 502 });

  const unlock = { tx: settle.tx ?? null, payer, at: new Date().toISOString() };
  await recordUnlock(id, did, unlock);
  return NextResponse.json({ result, unlock, paidTo: d.payTo, amountUnits: d.priceUnits });
}
