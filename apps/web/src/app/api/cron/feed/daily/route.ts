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

// Blue Feed v2 — daily heavier scan (once/day at 9am via vercel.json).
const JOBS: Job[] = [
  // Base Pulse: TVL + market sentiment snapshot (real DefiLlama data).
  { tool: "base-pulse",      agent: "blueagent", body: {}, title: "Base Pulse" },
  // DeFi Yield Scan: deduped protocol yields, APY ≥ 4%, no LLM.
  { tool: "defi-yield-scan", agent: "blueagent", body: {}, title: "DeFi Yield Scan" },
  // Picks Check: evaluates base-token-scan signals 22h later.
  { tool: "picks-check",     agent: "blueagent", body: {}, title: "Signal Track Record" },
  // B20 Tracker: Beryl 20 on Base index.
  { tool: "b20-tracker",     agent: "blueagent", body: {}, title: "B20 on Base" },
];

async function handle(req: NextRequest) {
  const err = authError(req);
  if (err) return NextResponse.json(err.body, { status: err.status });
  return NextResponse.json(await runCycle(JOBS));
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
