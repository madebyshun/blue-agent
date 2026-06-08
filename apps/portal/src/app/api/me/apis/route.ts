/**
 * GET /api/me/apis?wallet=0x...
 *
 * Returns the APIs registered by a given wallet. Used by /dashboard.
 * No auth at this layer — wallet address is provided by the client
 * (which connects + reads via wagmi). Server returns public data only.
 */

import { NextRequest, NextResponse } from "next/server";
import { getBuilderAPIs, isValidAddress } from "@/lib/registry";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet || !isValidAddress(wallet)) {
    return NextResponse.json({ error: "Missing or invalid ?wallet param" }, { status: 400 });
  }

  const apis = await getBuilderAPIs(wallet);

  const stats = apis.reduce(
    (acc, a) => ({
      apis:    acc.apis + 1,
      calls:   acc.calls + (a.callCount ?? 0),
      revenue: acc.revenue + (a.revenueTotal ?? 0),
    }),
    { apis: 0, calls: 0, revenue: 0 },
  );

  return NextResponse.json({ wallet, stats, apis }, {
    headers: { "Cache-Control": "private, no-cache" },
  });
}
