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

// ─── Health helpers ───────────────────────────────────────────────────────────

type HealthStatus = "healthy" | "degraded" | "down";

function getHealth(opts: {
  enabled:    boolean;
  lastScan:   string | null;
  isLocked:   boolean;
}): { status: HealthStatus; reason: string } {
  if (!opts.enabled) return { status: "down",    reason: "scheduler stopped" };
  if (opts.isLocked) return { status: "degraded", reason: "scan currently running" };
  if (!opts.lastScan) return { status: "degraded", reason: "no scan completed yet" };

  const ageMs = Date.now() - new Date(opts.lastScan).getTime();
  const ageMin = Math.floor(ageMs / 60_000);

  if (ageMin > 60)  return { status: "down",    reason: `last scan ${ageMin}m ago — may be stuck` };
  if (ageMin > 20)  return { status: "degraded", reason: `last scan ${ageMin}m ago — slightly delayed` };
  return { status: "healthy", reason: `last scan ${ageMin}m ago` };
}

// ─── GET — status + health ────────────────────────────────────────────────────

export async function GET() {
  const [status, lastScan, lockVal, stats] = await Promise.all([
    getStatus(),
    kvGet<string>(SENTINEL_KV.scanLast),
    kvGet<string>("sentinel:scan:running"),
    kvGet<{ totalScans: number; totalFindings: number; totalDiscovered: number }>(SENTINEL_KV.scanStats),
  ]);

  const isLocked = !!lockVal;
  const health   = getHealth({
    enabled:  status.config.enabled,
    lastScan: lastScan ?? null,
    isLocked,
  });

  return NextResponse.json({
    ok:       true,
    ...status,
    lastScan: lastScan ?? null,
    isLocked,
    health,
    stats:    stats ?? { totalScans: 0, totalFindings: 0, totalDiscovered: 0 },
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
