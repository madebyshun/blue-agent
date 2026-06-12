// GET /api/token-lookup?addr=0x…
//
// Look up ANY Base token by contract address (DexScreener) — powers the
// "scan a contract" search in the BASE MARKET card. Returns price/24h + the
// top pool for the price chart. Real data, no fabrication.

import { NextResponse } from "next/server";

interface Pair {
  chainId?: string; pairAddress?: string;
  baseToken?: { address?: string; symbol?: string };
  priceUsd?: string; priceChange?: { h24?: number }; volume?: { h24?: number }; liquidity?: { usd?: number };
}

export async function GET(req: Request) {
  const addr = new URL(req.url).searchParams.get("addr")?.trim() ?? "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
    return NextResponse.json({ token: null, error: "invalid address" }, { status: 200 });
  }
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addr}`);
    const j = (await r.json()) as { pairs?: Pair[] };
    const p = (j.pairs ?? [])
      .filter(x => x.chainId === "base" && x.baseToken?.address?.toLowerCase() === addr.toLowerCase())
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    if (!p) return NextResponse.json({ token: null, error: "no Base pair found" }, { status: 200 });
    return NextResponse.json({
      token: {
        sym: p.baseToken?.symbol ?? "?",
        addr,
        price: p.priceUsd ? Number(p.priceUsd) : null,
        change24h: p.priceChange?.h24 ?? null,
        vol24h: p.volume?.h24 ?? null,
        pool: p.pairAddress ?? null,
      },
      ts: Date.now(),
    });
  } catch (e) {
    return NextResponse.json({ token: null, error: (e as Error).message }, { status: 200 });
  }
}
