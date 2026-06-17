// x402/pool-scan — Base trending + new pools + TVL snapshot. No LLM. Price: $0.02
import { getBaseTrending, getBaseNewPools, getBaseTvl } from "@/lib/market-data";

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { limit?: number } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const limit = body.limit ?? (Number(url.searchParams.get("limit") ?? "10") || 10);

    const [trending, fresh, tvl] = await Promise.all([
      getBaseTrending(limit), getBaseNewPools(limit), getBaseTvl(),
    ]);
    return Response.json({
      tool: "pool-scan",
      base_tvl_usd: tvl?.tvlUsd ?? null,
      tvl_change_24h: tvl?.change1dPct ?? null,
      trending: trending.map((p) => ({ symbol: p.baseSymbol, price: p.priceUsd, change24h: p.change.h24, volume24h: p.volume24h, liquidity: p.liquidityUsd, url: p.url })),
      new_pools: fresh.map((p) => ({ symbol: p.baseSymbol, age_hours: null, liquidity: p.liquidityUsd, volume24h: p.volume24h, url: p.url })),
      data_source: "GeckoTerminal + DefiLlama (live)",
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return Response.json({ error: "pool-scan failed", message: (e as Error).message }, { status: 500 });
  }
}
