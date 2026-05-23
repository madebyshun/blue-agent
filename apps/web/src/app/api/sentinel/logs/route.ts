/**
 * Blue Sentinel — Scan Logs API
 *
 * GET /api/sentinel/logs
 *   Returns last 20 scan run logs stored by the cron job.
 */

import { NextResponse } from "next/server";
import { kvGet } from "@/lib/kv";
import type { ScanLog } from "@/app/api/cron/sentinel/route";

export const runtime = "nodejs";

export async function GET() {
  const logs = (await kvGet<ScanLog[]>("sentinel:scan:logs")) ?? [];
  return NextResponse.json({ ok: true, logs });
}
