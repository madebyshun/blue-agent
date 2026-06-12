// GET /api/base-tokens
//
// Top Base tokens with live price + 24h change + the pool address (for the
// per-token chart). Real data via DexScreener. Cached 5 min. Verified token
// addresses only — never guessed.

import { NextResponse } from "next/server";

export const revalidate = 300;

// Verified Base token addresses.
const TOKENS = [
  { sym: "WETH",       addr: "0x4200000000000000000000000000000000000006" },
  { sym: "cbBTC",      addr: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" },
  { sym: "AERO",       addr: "0x940181a94A35A4569E4529A3CDfB74e38FD98631" },
  { sym: "DEGEN",      addr: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed" },
  { sym: "BRETT",      addr: "0x532f27101965dd16442E59d40670FaF5eBB142E4" },
  { sym: "$BLUEAGENT", addr: "0xf895783b2931c919955e18b5e3343e7c7c456ba3" },
];

interface Pair {
  chainId?: string; pairAddress?: string;
  baseToken?: { address?: string };
  priceUsd?: string; priceChange?: { h24?: number }; volume?: { h24?: number }; liquidity?: { usd?: number };
}

async function one(sym: string, addr: string) {
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addr}`, { next: { revalidate: 300 } });
    const j = (await r.json()) as { pairs?: Pair[] };
    const p = (j.pairs ?? [])
      .filter(x => x.chainId === "base" && x.baseToken?.address?.toLowerCase() === addr.toLowerCase())
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    if (!p) return null;
    return {
      sym, addr,
      price: p.priceUsd ? Number(p.priceUsd) : null,
      change24h: p.priceChange?.h24 ?? null,
      vol24h: p.volume?.h24 ?? null,
      pool: p.pairAddress ?? null,
    };
  } catch { return null; }
}

export async function GET() {
  const rows = (await Promise.all(TOKENS.map(t => one(t.sym, t.addr)))).filter(Boolean);
  return NextResponse.json({ tokens: rows, ts: Date.now() });
}
