/**
 * Blue Feed — hourly intelligence cron.
 *
 * Runs every hour via GitHub Actions (.github/workflows/feed.yml) which POSTs
 * with the CRON_SECRET bearer, or on-demand (POST from the /app/feed "Run Now"
 * dev button). Snapshot-once: one cycle per run, deduped per (cycle, tool).
 * Shared logic lives in ./_shared.
 */
import { NextRequest, NextResponse } from "next/server";
import { runCycle, authError, type Job } from "./_shared";

export const runtime = "nodejs";
export const maxDuration = 60;

// Re-export the feed types so existing importers (the feed page) keep working.
export type { FeedItem, FeedAgent, CycleContext } from "./_shared";

const JOBS: Job[] = [
  { tool: "base-pulse",       agent: "blueagent", body: {}, title: "Base Pulse" },
  { tool: "base-alpha",       agent: "blueagent", body: {}, title: "Base Alpha" },
  { tool: "narrative-pulse",  agent: "blueagent", body: {}, title: "Narrative Pulse" },
  { tool: "whale-tracker",    agent: "blueagent", body: {} },
  { tool: "ecosystem-digest", agent: "blueagent", body: {}, title: "Base Ecosystem Digest" },
  { tool: "new-pools",        agent: "blueagent", body: {}, title: "New Pools on Base" },
  { tool: "blue-stream",      agent: "blueagent", body: {}, title: "Base Onchain Activity" },
  // token-alpha runs last in runCycle — its token is the cycle's top mover.
  { tool: "token-alpha",      agent: "blueagent", body: {} },
];

async function handle(req: NextRequest) {
  const err = authError(req);
  if (err) return NextResponse.json(err.body, { status: err.status });
  return NextResponse.json(await runCycle(JOBS));
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
