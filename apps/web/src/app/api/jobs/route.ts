/**
 * /api/jobs — the job board (lib/jobs.ts). GET lists open jobs; POST posts one
 * as the signed-in wallet (the Blue Chat SIWE session: cookie, or the
 * x-blue-session header for agents and scripts).
 */
import { NextResponse, type NextRequest } from "next/server";
import { resolveActingWallet, actingWalletRefusal } from "@/lib/acting-wallet";
import { parseBudget } from "../../../../../../packages/core/src/workers";
import { LIMITS, clean, createJob, inviteSpec, jobProblem, listJobs, publicJob, stockJobSpec } from "@/lib/jobs";

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

export async function POST(req: NextRequest) {
  const who = await resolveActingWallet(req);
  if (who.status !== "ok") return actingWalletRefusal(who);
  const b = (await req.json().catch(() => ({}))) as { title?: unknown; brief?: unknown; budgetUsd?: unknown; skill?: unknown; inputs?: { token?: unknown; ticker?: unknown }; invitedAgentId?: unknown };
  const title = clean(b.title, LIMITS.title);
  const brief = clean(b.brief, LIMITS.brief);
  const budgetUsd = typeof b.budgetUsd === "string" ? parseBudget(b.budgetUsd) : Number(b.budgetUsd);
  const why = jobProblem(title, brief, budgetUsd);
  if (why) return NextResponse.json({ error: why }, { status: 400 });
  const spec = stockJobSpec(b.skill, b.inputs?.token, b.inputs?.ticker);
  if (typeof spec === "string") return NextResponse.json({ error: spec }, { status: 400 });
  const invite = inviteSpec(b.invitedAgentId);
  if (invite && typeof invite === "object") return NextResponse.json({ error: invite.refusal }, { status: 400 });
  const job = await createJob(who.wallet, title, brief, Math.round(budgetUsd * 1e6), spec, invite);
  if (typeof job === "string") return NextResponse.json({ error: job }, { status: 429 });
  return NextResponse.json({ job: publicJob(job) }, { status: 201 });
}
