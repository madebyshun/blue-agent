import { NextRequest, NextResponse } from "next/server";
import { getLaunches } from "@/lib/launches";
import { getTokenMarket } from "@/lib/market-data";
import { B20HUB_HOOK, B20HUB_LAUNCHER } from "@/lib/b20hub/constants";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * GET /api/b20hub/tokens — B20HUB-only feed.
 *
 * B20HUB tokens are asset-variant B20s (address prefix 0xb200…) deployed on
 * Base through our launcher. We filter the shared launch registry by that
 * prefix rather than by launcherAddress because the registry predates the
 * launcher tag; once every record carries a launcherAddress we'll switch
 * to an exact-match filter (see follow-up ticket in the layout comment).
 *
 * Response shape mirrors /api/launches (with market enrichment) so the
 * feed grid can reuse the /app/launches Launch type.
 */
export interface B20HUBFeedResponse {
  ok: boolean;
  count: number;
  stats: {
    tracked: number;
    totalMarketCap: number;
    totalVolume24h: number;
  };
  hook: string;
  launcher: string;
  tokens: Array<{
    tokenAddress: string;
    tokenName: string;
    tokenSymbol: string;
    image?: string | null;
    feeRecipient?: { type: string; value: string };
    txHash?: string | null;
    launchedAt: number;
    market:
      | {
          priceUsd?: number | null;
          marketCap?: number | null;
          volume24h?: number | null;
          liquidityUsd?: number | null;
          change24h?: number | null;
        }
      | null;
  }>;
}

export async function GET(req: NextRequest) {
  const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(1, limitParam), 200) : 50;

  const all = await getLaunches(500);

  // Filter: asset-variant B20 (0xb200… prefix) on Base.
  const b20hub = all
    .filter(
      (l) =>
        typeof l.tokenAddress === "string" &&
        l.tokenAddress.toLowerCase().startsWith("0xb200") &&
        (l.chain ?? "base") === "base",
    )
    .slice(0, limit);

  // Enrich the newest 40 with DexScreener market data. Fail-soft.
  const ENRICH = 40;
  const enriched = await Promise.all(
    b20hub.map(async (l, i) => {
      if (i >= ENRICH) return { ...l, market: null };
      const m = await getTokenMarket(l.tokenAddress).catch(() => null);
      return {
        ...l,
        market: m
          ? {
              priceUsd:     m.priceUsd,
              marketCap:    m.marketCap ?? m.fdv,
              volume24h:    m.volume24h,
              liquidityUsd: m.liquidityUsd,
              change24h:    m.change.h24,
            }
          : null,
      };
    }),
  );

  const withMarket = enriched.filter((l) => l.market);
  const totalMcap = withMarket.reduce((s, l) => s + (l.market?.marketCap ?? 0), 0);
  const totalVol  = withMarket.reduce((s, l) => s + (l.market?.volume24h ?? 0), 0);

  return NextResponse.json<B20HUBFeedResponse>({
    ok: true,
    count: b20hub.length,
    stats: {
      tracked:         withMarket.length,
      totalMarketCap:  totalMcap,
      totalVolume24h:  totalVol,
    },
    hook:     B20HUB_HOOK,
    launcher: B20HUB_LAUNCHER,
    tokens:   enriched,
  }, {
    headers: {
      "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
    },
  });
}
