// GET /api/base-tvl-history
//
// Full daily Base chain TVL history (DefiLlama) for the interactive dashboard
// chart — the client slices it by time range (1M/6M/1Y/All). Real data, 1h cache.

import { NextResponse } from "next/server";

export const revalidate = 3600;

export async function GET() {
  try {
    const res = await fetch("https://api.llama.fi/v2/historicalChainTvl/Base", { next: { revalidate: 3600 } });
    const data = (await res.json()) as { date: number; tvl: number }[];
    const series = (data ?? []).map(p => ({ t: p.date * 1000, v: Math.round(p.tvl) }));
    return NextResponse.json({ series, ts: Date.now() });
  } catch (e) {
    return NextResponse.json({ series: [], error: (e as Error).message, ts: Date.now() }, { status: 200 });
  }
}
