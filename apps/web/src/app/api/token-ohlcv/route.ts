// GET /api/token-ohlcv?pool=0x…
//
// Daily close-price series (last ~30d) for a Base pool — the per-token price
// chart on the BlueBank dashboard. Real data via GeckoTerminal OHLCV. Cached 1h.

import { NextResponse } from "next/server";

export const revalidate = 3600;

export async function GET(req: Request) {
  const pool = new URL(req.url).searchParams.get("pool");
  if (!pool || !/^0x[a-fA-F0-9]{40}$/.test(pool)) {
    return NextResponse.json({ points: [], error: "invalid pool" }, { status: 200 });
  }
  try {
    const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/base/pools/${pool}/ohlcv/day?limit=30`, { next: { revalidate: 3600 } });
    const j = await r.json();
    const list: number[][] = j?.data?.attributes?.ohlcv_list ?? [];
    // ohlcv_list rows: [timestamp, open, high, low, close, volume], newest first.
    const points = list.slice().reverse().map(row => Number(row[4]));
    return NextResponse.json({ points, ts: Date.now() });
  } catch (e) {
    return NextResponse.json({ points: [], error: (e as Error).message }, { status: 200 });
  }
}
