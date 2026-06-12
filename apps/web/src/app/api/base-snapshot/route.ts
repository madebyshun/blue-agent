// GET /api/base-snapshot
//
// Live Base chain stats for the BlueBank dashboard — TVL + 7d change from
// DefiLlama (real data). Cached 10 min.

import { NextResponse } from "next/server";

export const revalidate = 600;

export async function GET() {
  try {
    const res = await fetch("https://api.llama.fi/v2/historicalChainTvl/Base", { next: { revalidate: 600 } });
    const data = (await res.json()) as { date: number; tvl: number }[];
    const last = data.at(-1)?.tvl ?? null;
    const d7   = data.at(-8)?.tvl ?? null;
    const change7dPct = last != null && d7 ? ((last - d7) / d7) * 100 : null;
    return NextResponse.json({ tvlUsd: last, change7dPct, ts: Date.now() });
  } catch (e) {
    return NextResponse.json({ tvlUsd: null, change7dPct: null, error: (e as Error).message, ts: Date.now() }, { status: 200 });
  }
}
