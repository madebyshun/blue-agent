/**
 * Blue Sentinel — Manual Scan Trigger
 * GET /api/sentinel/scan
 *
 * Public endpoint to manually trigger a sentinel scan.
 * Same logic as /api/cron/sentinel but no auth required.
 */

import { NextResponse } from "next/server";

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://blueagent.dev";
  const secret  = process.env.CRON_SECRET ?? "";

  const url = secret
    ? `${baseUrl}/api/cron/sentinel?secret=${secret}`
    : `${baseUrl}/api/cron/sentinel`;

  const res  = await fetch(url, { signal: AbortSignal.timeout(55000) });
  const data = await res.json();

  return NextResponse.json(data);
}
