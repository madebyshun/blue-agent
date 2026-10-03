// GET /api/base-tvl-history
//
// Full daily Base chain TVL history (DefiLlama) for the interactive dashboard
// chart — the client slices it by time range (1M/6M/1Y/All). Real data, 1h cache.

import { NextResponse } from "next/server";
import { getChainTvlHistory } from "@/lib/market-data";

export const revalidate = 3600;

export async function GET() {
  const data = await getChainTvlHistory("Base", { revalidate: 3600, timeoutMs: null });
  if (!data) return NextResponse.json({ series: [], error: "DefiLlama unavailable", ts: Date.now() }, { status: 200 });
  const series = data.map(p => ({ t: p.date * 1000, v: Math.round(p.tvl) }));
  return NextResponse.json({ series, ts: Date.now() });
}
