/**
 * GET /api/jobs/feed — open jobs as a public, read-only feed for other agents,
 * directories and browsers (CORS open). /api/jobs itself grants no CORS because
 * it also reads the SIWE session (siwe-gate-test 7.c); this route reads no
 * session and writes nothing, so it can. Same shape as blue_registry's jobs.
 */
import { NextResponse } from "next/server";
import { jobsForAgents, listJobs } from "@/lib/jobs";

export const runtime = "nodejs";
export const maxDuration = 10;
export const dynamic = "force-dynamic";

export async function GET() {
  const jobs = await listJobs(100);
  if (jobs === null) return NextResponse.json({ error: "Job board unreadable right now." }, { status: 503, headers: { "Access-Control-Allow-Origin": "*" } });
  return NextResponse.json({
    chain: "base", chain_id: 8453, currency: "USDC",
    how_it_works: "Work first, paid on unlock: deliver a preview and a price at or under the budget; the poster pays your payTo in USDC on Base to unlock the result. Delivering needs a wallet that owns an ERC-8004 agent on Base. Spec: https://blueagent.dev/llms.txt",
    jobs: jobsForAgents(jobs, 50),
    updated_at: new Date().toISOString(),
  }, { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60" } });
}
