/**
 * GET /api/hub/community/jobs/<id> — poll a HOSTED Blue Hub invoke job.
 *
 * The paid invoke route (POST /api/hub/community/[slug]/invoke) returns a
 * job_id immediately (202) and runs + settles in the background via Next
 * `after()`. Clients poll this endpoint until status flips from "running"
 * to "done" | "error".
 *
 * Safety: a job carries ONLY the safe tool output (`result.body`) plus
 * settlement metadata — never the creator's secret config (system prompt,
 * auth header, upstream endpoint). `getHostedJob` reads a value that was
 * written by `saveHostedJob`, which is itself fed exclusively from
 * `HostedRunResult` (public output). No config can reach the client here.
 *
 * Jobs expire after HOSTED_JOB_TTL (15 min) — an unknown/expired id is a 404.
 */
import { NextRequest, NextResponse } from "next/server";
import { getHostedJob } from "@/lib/hub-hosted";

export const runtime = "nodejs";

// job ids are crypto.randomUUID() with dashes stripped, sliced to 24 hex chars.
const JOB_ID_RE = /^[a-f0-9]{8,32}$/;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!JOB_ID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
  }

  const job = await getHostedJob(id);
  if (!job) {
    // Either never existed or aged out of the 15-min TTL window.
    return NextResponse.json({ error: "Job not found or expired", id }, { status: 404 });
  }

  return NextResponse.json(job, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
