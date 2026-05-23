/**
 * Blue Sentinel — Scheduler Control API
 * GET  /api/sentinel/control  → status
 * POST /api/sentinel/control  → { action: "start"|"stop", intervalMinutes? }
 *
 * Used by:
 *   - Web UI (start/stop button)
 *   - Telegram bot commands (/blue sentinel start|stop|status)
 *   - Direct API calls
 */

import { NextRequest, NextResponse } from "next/server";
import { getStatus, startScheduler, stopScheduler } from "@/lib/sentinel/scheduler";
import { kvGet } from "@/lib/kv";
import { SENTINEL_KV } from "@/lib/sentinel/catalog";

export const runtime = "nodejs";

// ─── GET — status ─────────────────────────────────────────────────────────────

export async function GET() {
  const [status, lastScan] = await Promise.all([
    getStatus(),
    kvGet<string>(SENTINEL_KV.scanLast),
  ]);

  return NextResponse.json({
    ok: true,
    ...status,
    lastScan: lastScan ?? null,
  });
}

// ─── POST — start / stop ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    action:           "start" | "stop";
    intervalMinutes?: number;
    startedBy?:       string;
  };

  const { action, intervalMinutes, startedBy } = body;

  if (action === "start") {
    // Validate interval
    const VALID_INTERVALS = [5, 15, 30, 60, 240];
    const interval = intervalMinutes
      ? VALID_INTERVALS.find(v => v === intervalMinutes) ?? 15
      : 15;

    const result = await startScheduler({ intervalMinutes: interval, startedBy });
    return NextResponse.json(result);
  }

  if (action === "stop") {
    const result = await stopScheduler();
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "action must be 'start' or 'stop'" }, { status: 400 });
}
