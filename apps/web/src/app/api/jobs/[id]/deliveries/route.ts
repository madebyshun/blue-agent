/**
 * POST /api/jobs/<id>/deliveries — an agent delivers: preview (public), price
 * (≤ budget), payTo (where the unlock pays) and the full result (hidden until
 * the poster pays). The signed-in wallet must own `agentId` in the ERC-8004
 * Identity Registry on Base, read on chain at the moment of delivery.
 *
 * Two ways to say who is delivering:
 *   - the Blue Chat SIWE session (cookie, or x-blue-session) — the web form;
 *   - {signer, signature, issuedAt}: the owner wallet signs deliveryMessage()
 *     (lib/jobs.ts) over every field — for agents with no browser. Verified
 *     with viem's verifyMessage, which also accepts smart-wallet (ERC-1271)
 *     signatures.
 */
import { NextResponse, type NextRequest } from "next/server";
import { resolveActingWallet, actingWalletRefusal } from "@/lib/acting-wallet";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { DELIVERY_SIG_WINDOW_MS, LIMITS, addDelivery, clean, deliveryMessage, deliveryProblem, getJob } from "@/lib/jobs";
import { ownsAgent } from "@/lib/erc8004";

export const runtime = "nodejs";
export const maxDuration = 20;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  let wallet: string;
  if (typeof b.signature === "string" && typeof b.signer === "string") {
    const issuedAt = String(b.issuedAt ?? "");
    const t = Date.parse(issuedAt);
    if (!Number.isFinite(t) || Math.abs(Date.now() - t) > DELIVERY_SIG_WINDOW_MS) {
      return NextResponse.json({ error: "issuedAt must be an ISO time within 10 minutes of now." }, { status: 400 });
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(b.signer)) return NextResponse.json({ error: "signer must be a 0x address." }, { status: 400 });
    const message = await deliveryMessage({
      jobId: id, agentId: String(b.agentId ?? "").trim(), payTo: String(b.payTo ?? "").trim(),
      priceUnits: Math.round(Number(b.priceUsd) * 1e6), preview: clean(b.preview, LIMITS.preview), result: clean(b.result, LIMITS.result), issuedAt,
    });
    const c = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org") });
    const ok = await c.verifyMessage({ address: b.signer as `0x${string}`, message, signature: b.signature as `0x${string}` }).catch(() => false);
    if (!ok) return NextResponse.json({ error: "Signature does not match the delivery. Sign deliveryMessage() exactly (see /jobs)." }, { status: 401 });
    wallet = b.signer.toLowerCase();
  } else {
    const who = await resolveActingWallet(req);
    if (who.status !== "ok") return actingWalletRefusal(who);
    wallet = who.wallet;
  }
  const job = await getJob(id);
  if (job === undefined) return NextResponse.json({ error: "Job board unreadable right now." }, { status: 503 });
  if (!job || job.status === "hidden") return NextResponse.json({ error: "No such job." }, { status: 404 });

  const agentId = String(b.agentId ?? "").trim();
  const payTo = String(b.payTo ?? "").trim().toLowerCase();
  const priceUsd = Number(b.priceUsd);
  const preview = clean(b.preview, LIMITS.preview);
  const result = clean(b.result, LIMITS.result);

  const why = deliveryProblem(job, { agent: wallet, payTo, priceUsd, preview, result });
  if (why) return NextResponse.json({ error: why }, { status: 400 });
  const owns = await ownsAgent(wallet, agentId);
  if (owns === null) return NextResponse.json({ error: "Could not read the ERC-8004 registry right now; nothing was delivered." }, { status: 503 });
  if (!owns) return NextResponse.json({ error: `The signed-in wallet does not own ERC-8004 agent #${agentId || "?"} on Base. Create one at https://app.blueagent.dev/exchange/create` }, { status: 403 });

  const d = await addDelivery(job, { agent: wallet, agentId, payTo, priceUnits: Math.round(priceUsd * 1e6), preview }, result);
  if (typeof d === "string") return NextResponse.json({ error: d }, { status: 503 });
  return NextResponse.json({ delivery: { ...d, unlocked: false } }, { status: 201 });
}
