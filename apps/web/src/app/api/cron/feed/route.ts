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

// Blue Feed v2 — fewer, higher-signal tools.
// Runs every 4h via GitHub Actions (feed.yml cron: '0 */4 * * *').
const JOBS: Job[] = [
  // Hard-filter token scan: 5 quality gates, ≤3 signals, silent if nothing passes.
  { tool: "base-token-scan", agent: "blueagent", body: {}, title: "Base Token Signals" },
  // Narrative lifecycle tracker: Emerging → Rising → Peak → Fading.
  { tool: "narrative-scan",  agent: "blueagent", body: {}, title: "Narrative Scan" },
];

async function handle(req: NextRequest) {
  const err = authError(req);
  if (err) return NextResponse.json(err.body, { status: err.status });
  return NextResponse.json(await runCycle(JOBS));
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
