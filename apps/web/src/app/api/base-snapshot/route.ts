// GET /api/base-snapshot
//
// Live Base market data for the BlueBank dashboard — all real, cached 10 min:
//   - Base chain TVL + 7d change + 30d series (DefiLlama)
//   - Base DEX 24h / 7d volume (DefiLlama)
//   - $BLUEAGENT price + 24h (DexScreener)
//   - cbBTC price + 24h — Coinbase's wrapped BTC on Base (DexScreener)

import { NextResponse } from "next/server";
import { getBaseDexVolume, getChainTvlHistory } from "@/lib/market-data";

export const revalidate = 600;

const BLUE  = "0xf895783b2931c919955e18b5e3343e7c7c456ba3";
const CBBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { next: { revalidate: 600 } });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch { return null; }
}

interface DexPair { chainId?: string; priceUsd?: string; liquidity?: { usd?: number }; priceChange?: { h24?: number }; volume?: { h24?: number } }
async function token(addr: string) {
  const d = await getJson<{ pairs?: DexPair[] }>(`https://api.dexscreener.com/latest/dex/tokens/${addr}`);
  const p = (d?.pairs ?? []).filter(x => x.chainId === "base").sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  if (!p) return null;
  return { price: p.priceUsd ? Number(p.priceUsd) : null, change24h: p.priceChange?.h24 ?? null, vol24h: p.volume?.h24 ?? null };
}

export async function GET() {
  const [tvlData, dexData, blue, cbbtc] = await Promise.all([
    // Same cache as the DexScreener reads below and, like them, no client timeout.
    getChainTvlHistory("Base", { revalidate: 600, timeoutMs: null }),
    getBaseDexVolume({ revalidate: 600, timeoutMs: null }),
    token(BLUE),
    token(CBBTC),
  ]);

  const tvlUsd = tvlData?.at(-1)?.tvl ?? null;
  const d7     = tvlData?.at(-8)?.tvl ?? null;
  const change7dPct = tvlUsd != null && d7 ? ((tvlUsd - d7) / d7) * 100 : null;
  const tvlSeries = (tvlData ?? []).slice(-30).map(p => Math.round(p.tvl));

  return NextResponse.json({
    tvlUsd, change7dPct, tvlSeries,
    dexVol24h: dexData?.volume24hUsd ?? null,
    dexVol7d:  dexData?.volume7dUsd ?? null,
    blue, cbbtc,
    ts: Date.now(),
  });
}
