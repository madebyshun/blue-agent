/**
 * GET /api/stats/public — public traction stats (aggregate, on-chain-verifiable).
 *
 * Privacy: returns ONLY the sanitized aggregate from buildPublicStats(). No
 * wallet addresses, ledger balances, or launcher identities are ever included.
 * Safe to call unauthenticated; cached at the edge.
 */

import { NextResponse } from "next/server";
import { buildPublicStats } from "@/lib/public-stats";

export const revalidate = 60;

export async function GET() {
  const stats = await buildPublicStats();
  return NextResponse.json(stats, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
