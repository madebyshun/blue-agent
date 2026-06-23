import { NextResponse } from "next/server";
import { getLaunches } from "@/lib/launches";
import { getTokenMarket } from "@/lib/market-data";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * GET /api/launches — public showcase feed of tokens launched through Blue Chat.
 *
 * Reads the durable launch registry (KV) and enriches each token with live
 * market data (price / market cap / 24h volume / 24h change) from DexScreener.
 * Enrichment is parallel + fail-soft: a token with no DEX pair yet simply
 * returns `market: null` rather than failing the whole response.
 */
export async function GET() {
  const launches = await getLaunches();

  // Enrich newest 60 with live market data; older entries return without it to
  // keep the response fast and within DexScreener rate limits.
  const ENRICH = 60;
  const enriched = await Promise.all(
    launches.map(async (l, i) => {
      if (i >= ENRICH) return { ...l, market: null };
      const m = await getTokenMarket(l.tokenAddress).catch(() => null);
      return {
        ...l,
        market: m
          ? {
              priceUsd: m.priceUsd,
              marketCap: m.marketCap ?? m.fdv,
              volume24h: m.volume24h,
              liquidityUsd: m.liquidityUsd,
              change24h: m.change.h24,
            }
          : null,
      };
    }),
  );

  const withMarket = enriched.filter((l) => l.market);
  const totalMcap = withMarket.reduce((s, l) => s + (l.market?.marketCap ?? 0), 0);
  const totalVol = withMarket.reduce((s, l) => s + (l.market?.volume24h ?? 0), 0);

  return NextResponse.json(
    {
      ok: true,
      count: launches.length,
      stats: { tracked: withMarket.length, totalMarketCap: totalMcap, totalVolume24h: totalVol },
      launches: enriched,
    },
    {
      headers: {
        // Edge/browser cache for 30s, serve stale while revalidating — the
        // showcase doesn't need to be real-time and this protects the upstream.
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
      },
    },
  );
}
