/**
 * Blue Sentinel — Threat Timeline API (#11)
 *
 * GET /api/sentinel/history?days=7
 *   Returns aggregated threat stats + daily snapshots for the last N days.
 *   Default: 7 days. Max: 30 days.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTimeline, getTimelineStats } from "@/lib/sentinel/timeline";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const daysParam = req.nextUrl.searchParams.get("days");
  const days      = Math.min(Math.max(parseInt(daysParam ?? "7", 10) || 7, 1), 30);

  const [stats, full] = await Promise.all([
    getTimelineStats(days),
    getTimeline(),
  ]);

  return NextResponse.json({
    ok:   true,
    days,
    stats,
    full, // full 30-day history
  });
}
