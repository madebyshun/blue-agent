/**
 * Blue Sentinel — Discovery Stats API
 *
 * GET /api/sentinel/discovery
 *   Returns last auto-discovery run stats stored by the cron job.
 */

import { NextResponse } from "next/server";
import { kvGet } from "@/lib/kv";

export const runtime = "nodejs";

interface DiscoveryInfo {
  count:     number;
  tokens:    number;
  domains:   number;
  scannedAt: string;
}

export async function GET() {
  const info = await kvGet<DiscoveryInfo>("sentinel:discovery:last");
  if (!info) {
    return NextResponse.json({ count: 0, tokens: 0, domains: 0, scannedAt: null }, { status: 200 });
  }
  return NextResponse.json(info);
}
