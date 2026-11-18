/**
 * /api/jobs — the job board (lib/jobs.ts). GET lists open jobs; POST posts one
 * as the signed-in wallet (the Blue Chat SIWE session: cookie, or the
 * x-blue-session header for agents and scripts).
 */
import { NextResponse, after, type NextRequest } from "next/server";
import { notifyNewJob } from "@/lib/job-webhooks";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { resolveActingWallet, actingWalletRefusal } from "@/lib/acting-wallet";
import { buildRequirements, cdpVerify, cdpSettle } from "@/app/api/_lib/x402-cdp";
import { parseBudget } from "../../../../../../packages/core/src/workers";
import { DELIVERY_SIG_WINDOW_MS, LIMITS, POST_FEE_UNITS, clean, createJob, setStatus, inviteSpec, jobPostMessage, jobProblem, takeApiPost, listJobs, publicJob, stockJobSpec } from "@/lib/jobs";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

export async function GET() {
  const jobs = await listJobs(100);
  if (jobs === null) return NextResponse.json({ error: "Job board unreadable right now." }, { status: 503 });
  // No CORS: this route also reads the SIWE session (POST), and a session route
  // grants none (siwe-gate-test 7.c). Agents call it server-side.
  return NextResponse.json({ jobs: jobs.map(publicJob), chain: "base", chain_id: 8453 });
}

/**
 * POST — as the signed-in wallet (SIWE), OR as an agent with no session:
 * {signer, signature, issuedAt} over jobPostMessage() (lib/jobs.ts). Same
 * validation either way; the signed path is also limited per wallet per day.
 *
 * OR pay instead of signing (item 6b, ShunTr 2026-11-18): X-PAYMENT for a
 * $0.02 anti-spam fee to Blue's x402 payTo, CDP facilitator, the payer is the
 * poster. Order: validate → verify → store → settle. A post that fails any
 * check charges nothing; if settlement fails after the store, the job is
 * hidden and the caller is told it was neither charged nor posted. The fee is
 * not refundable once settled and is not escrow: budgets stay pay-on-unlock.
 */
const FEE_RESOURCE = { url: "https://blueagent.dev/api/jobs", description: "Post a job on the Blue Agent job board (anti-spam fee)", mimeType: "application/json" };

function payerOf(xPayment: string): { payload: unknown; payer: string | null } | null {
  try {
    const payload = JSON.parse(Buffer.from(xPayment, "base64").toString("utf8")) as { payload?: { authorization?: { from?: string } } };
    const f = payload.payload?.authorization?.from;
    return { payload, payer: typeof f === "string" && /^0x[0-9a-fA-F]{40}$/.test(f) ? f.toLowerCase() : null };
  } catch { return null; }
}

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { title?: unknown; brief?: unknown; budgetUsd?: unknown; skill?: unknown; inputs?: { token?: unknown; ticker?: unknown }; invitedAgentId?: unknown; signer?: unknown; signature?: unknown; issuedAt?: unknown };
  const signed = typeof b.signature === "string" && typeof b.signer === "string";
  const xPayment = signed ? null : req.headers.get("x-payment") ?? req.headers.get("payment-signature");
  const requirements = buildRequirements(String(POST_FEE_UNITS));
  let poster = "";
  let paid: { payload: unknown } | null = null;
  if (xPayment) {
    const p = payerOf(xPayment);
    if (!p || !p.payer) return NextResponse.json({ error: "Malformed X-PAYMENT (EIP-3009 authorization expected). Nothing was charged." }, { status: 400 });
    poster = p.payer;
    paid = { payload: p.payload };
  } else if (!signed) {
    const who = await resolveActingWallet(req);
    if (who.status !== "ok") {
      // No session, no signature, no payment: say every way in, priced.
      if (!req.headers.get("cookie") && !req.headers.get("x-blue-session")) {
        return NextResponse.json({ x402Version: 2, accepts: [requirements], resource: FEE_RESOURCE, error: "Payment required", alternatives: "Or sign in (SIWE), or sign jobPostMessage() for free: https://blueagent.dev/api/jobs/openapi.json" }, { status: 402 });
      }
      return actingWalletRefusal(who);
    }
    poster = who.wallet;
  }
  const title = clean(b.title, LIMITS.title);
  const brief = clean(b.brief, LIMITS.brief);
  const budgetUsd = typeof b.budgetUsd === "string" ? parseBudget(b.budgetUsd) : Number(b.budgetUsd);
  const why = jobProblem(title, brief, budgetUsd);
  if (why) return NextResponse.json({ error: why }, { status: 400 });
  const spec = stockJobSpec(b.skill, b.inputs?.token, b.inputs?.ticker);
  if (typeof spec === "string") return NextResponse.json({ error: spec }, { status: 400 });
  const invite = inviteSpec(b.invitedAgentId);
  if (invite && typeof invite === "object") return NextResponse.json({ error: invite.refusal }, { status: 400 });
  if (signed) {
    const signer = String(b.signer), issuedAt = String(b.issuedAt ?? "");
    if (!/^0x[0-9a-fA-F]{40}$/.test(signer)) return NextResponse.json({ error: "signer must be a 0x address." }, { status: 400 });
    const t = Date.parse(issuedAt);
    if (!Number.isFinite(t) || Math.abs(Date.now() - t) > DELIVERY_SIG_WINDOW_MS) return NextResponse.json({ error: "issuedAt must be an ISO time within 10 minutes of now." }, { status: 400 });
    const message = await jobPostMessage({ title, brief, budgetUnits: Math.round(budgetUsd * 1e6), skill: spec?.skill ?? null, token: spec?.inputs.token ?? null, invitedAgentId: invite, issuedAt });
    const c = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org") });
    const ok = await c.verifyMessage({ address: signer as `0x${string}`, message, signature: String(b.signature) as `0x${string}` }).catch(() => false);
    if (!ok) return NextResponse.json({ error: "Signature does not match the job. Sign jobPostMessage() exactly (see /llms.txt).", message }, { status: 401 });
    poster = signer.toLowerCase();
    const take = await takeApiPost(poster, String(b.signature));
    if (take === "replay") return NextResponse.json({ error: "This signature already posted a job." }, { status: 409 });
    if (take === "limit") return NextResponse.json({ error: "Signed posts are limited to 10 per wallet per UTC day." }, { status: 429 });
    if (take === "error") return NextResponse.json({ error: "Could not check the posting limit right now; nothing was posted." }, { status: 503 });
  }
  if (paid) {
    const take = await takeApiPost(poster, xPayment!);
    if (take === "replay") return NextResponse.json({ error: "This payment was already used. Nothing was charged." }, { status: 409 });
    if (take === "limit") return NextResponse.json({ error: "Paid posts are limited to 10 per wallet per UTC day. Nothing was charged." }, { status: 429 });
    if (take === "error") return NextResponse.json({ error: "Could not check the posting limit right now. Nothing was charged." }, { status: 503 });
    const v = await cdpVerify(paid.payload, requirements, FEE_RESOURCE);
    if (!v.ok) return NextResponse.json({ error: "Payment verification failed. Nothing was charged or posted.", detail: v.detail }, { status: 402 });
  }
  const job = await createJob(poster, title, brief, Math.round(budgetUsd * 1e6), spec, invite);
  if (typeof job === "string") return NextResponse.json({ error: `${job}${paid ? " Nothing was charged." : ""}` }, { status: 429 });
  let receipt: { tx: string | null; amountUnits: number } | null = null;
  if (paid) {
    const s = await cdpSettle(paid.payload, requirements, FEE_RESOURCE);
    if (!s.ok) {
      await setStatus(job.id, "hidden");
      return NextResponse.json({ error: "Payment did not settle, so the job was not posted. Nothing was charged; try again.", detail: s.detail }, { status: 502 });
    }
    receipt = { tx: s.tx ?? null, amountUnits: POST_FEE_UNITS };
  }
  const pj = publicJob(job);
  after(() => notifyNewJob(pj).catch(() => undefined));
  return NextResponse.json({ job: pj, ...(receipt ? { fee: receipt } : {}) }, { status: 201 });
}
