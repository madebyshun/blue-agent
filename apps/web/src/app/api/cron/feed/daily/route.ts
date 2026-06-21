/**
 * Blue Feed — daily intelligence cron (heavier, once/day).
 *
 * Fires daily via vercel.json + GitHub Actions (CRON_SECRET bearer). Same
 * snapshot-once pattern + storage as the hourly cron — shared via ../_shared.
 */
import { NextRequest, NextResponse } from "next/server";
import { runCycle, authError, type Job } from "../_shared";

export const runtime = "nodejs";
export const maxDuration = 60;

const JOBS: Job[] = [
  { tool: "token-momentum-scanner", agent: "miroshark", body: {}, title: "Base Momentum Scan" },
  { tool: "narrative-position",     agent: "consensus", body: {}, title: "Narrative Positions" },
  { tool: "defi-opportunity",       agent: "miroshark", body: {}, title: "DeFi Opportunities on Base" },
  { tool: "bankr-pulse",            agent: "consensus", body: {}, title: "Bankr Trending" },
];

async function handle(req: NextRequest) {
  const err = authError(req);
  if (err) return NextResponse.json(err.body, { status: err.status });
  return NextResponse.json(await runCycle(JOBS));
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
