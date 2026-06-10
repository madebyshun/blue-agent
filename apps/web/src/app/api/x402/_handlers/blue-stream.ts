// x402/blue-stream
// Blue Stream — a live snapshot feed of Base onchain activity. Pure real data
// (GeckoTerminal trending/new pools + DefiLlama TVL). No LLM, no fabrication.
// Price: $0.05

import { getBaseTrending, getBaseNewPools, getBaseTvl, type Pool } from "@/lib/market-data";

function pct(n: number | null): string | null {
  return n == null ? null : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function mapPool(p: Pool) {
  return {
    token: p.baseSymbol,
    pool: p.name,
    price_usd: p.priceUsd,
    change_24h: pct(p.change.h24),
    change_1h: pct(p.change.h1),
    volume_24h_usd: p.volume24h,
    liquidity_usd: p.liquidityUsd,
    url: p.url,
  };
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { feed?: string; limit?: number } = {};
    try { const t = await req.text(); if (t.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const feed = (body.feed ?? url.searchParams.get("feed") ?? "movers").trim().toLowerCase();
    const limit = Math.min(Math.max(Number(body.limit ?? url.searchParams.get("limit") ?? 10), 1), 25);

    const [trending, newPools, tvl] = await Promise.all([
      feed === "new" ? Promise.resolve([] as Pool[]) : getBaseTrending(limit),
      feed === "new" || feed === "all" ? getBaseNewPools(limit) : Promise.resolve([] as Pool[]),
      getBaseTvl(),
    ]);

    if (!trending.length && !newPools.length && !tvl) {
      return Response.json(
        { error: "Live Base data sources unavailable right now. Retry shortly." },
        { status: 503 }
      );
    }

    return Response.json({
      tool: "blue-stream",
      timestamp: new Date().toISOString(),
      data_source: "GeckoTerminal + DefiLlama (live Base)",
      feed,
      base_tvl: tvl
        ? { usd: tvl.tvlUsd, change_1d: pct(tvl.change1dPct), change_7d: pct(tvl.change7dPct) }
        : null,
      trending: trending.map(mapPool),
      new_pools: newPools.map(mapPool),
      note: "Snapshot of live Base onchain activity. Poll this endpoint for a near-real-time feed; pair with blue-monitor for per-target watch + alerts.",
    });
  } catch (e) {
    return Response.json(
      { error: "Blue stream failed", message: (e as Error).message },
      { status: 500 }
    );
  }
}
