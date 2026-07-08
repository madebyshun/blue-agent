// x402/blue-stream
// Blue Stream — a live snapshot feed of onchain activity on Base OR Robinhood
// Chain. Pure real data (GeckoTerminal trending/new pools + DefiLlama TVL).
// No LLM, no fabrication.
// Price: $0.05

import {
  getBaseTrending,
  getBaseNewPools,
  getBaseTvl,
  getRobinhoodTrending,
  getRobinhoodNewPools,
  getRobinhoodTvl,
  type Pool,
} from "@/lib/market-data";
import { filterScamPools } from "./_scam-filter";

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

// The scam-filter's brand-name blocklist assumes any "AAPL"/"TSLA"/"COIN"-style
// symbol is an impersonation — true on Base, but WRONG on Robinhood Chain,
// where "Wrapped AAPL • Robinhood Token" etc. are legitimate tokenized
// equities. So on Robinhood we only keep the extreme-price-change rug guard,
// not the brand-name check.
function filterForChain(pools: Pool[], chain: "base" | "robinhood"): Pool[] {
  if (chain === "base") return filterScamPools(pools);
  return pools.filter((p) => {
    const chg = p.change.h24 ?? p.change.h1;
    return !(chg != null && Math.abs(chg) > 1000);
  });
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { feed?: string; limit?: number; chain?: string } = {};
    try { const t = await req.text(); if (t.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const feed = (body.feed ?? url.searchParams.get("feed") ?? "movers").trim().toLowerCase();
    const limit = Math.min(Math.max(Number(body.limit ?? url.searchParams.get("limit") ?? 10), 1), 25);
    const chain: "base" | "robinhood" =
      (body.chain ?? url.searchParams.get("chain") ?? "base").trim().toLowerCase() === "robinhood"
        ? "robinhood"
        : "base";

    const trendingFn = chain === "robinhood" ? getRobinhoodTrending : getBaseTrending;
    const newPoolsFn = chain === "robinhood" ? getRobinhoodNewPools : getBaseNewPools;
    const tvlFn = chain === "robinhood" ? getRobinhoodTvl : getBaseTvl;

    const [trending, newPools, tvl] = await Promise.all([
      feed === "new" ? Promise.resolve([] as Pool[]) : trendingFn(limit),
      feed === "new" || feed === "all" ? newPoolsFn(limit) : Promise.resolve([] as Pool[]),
      tvlFn(),
    ]);

    if (!trending.length && !newPools.length && !tvl) {
      return Response.json(
        {
          error: `Live ${chain === "robinhood" ? "Robinhood Chain" : "Base"} data sources unavailable right now. Retry shortly.`,
        },
        { status: 503 }
      );
    }

    return Response.json({
      tool: "blue-stream",
      timestamp: new Date().toISOString(),
      chain,
      data_source: `GeckoTerminal + DefiLlama (live ${chain === "robinhood" ? "Robinhood Chain" : "Base"})`,
      feed,
      base_tvl: tvl
        ? { usd: tvl.tvlUsd, change_1d: pct(tvl.change1dPct), change_7d: pct(tvl.change7dPct) }
        : null,
      trending: filterForChain(trending, chain).map(mapPool),
      new_pools: filterForChain(newPools, chain).map(mapPool),
      note:
        chain === "robinhood"
          ? "Snapshot of live Robinhood Chain onchain activity (tokenized equities + native tokens). Poll this endpoint for a near-real-time feed."
          : "Snapshot of live Base onchain activity. Poll this endpoint for a near-real-time feed; pair with blue-monitor for per-target watch + alerts.",
    });
  } catch (e) {
    return Response.json(
      { error: "Blue stream failed", message: (e as Error).message },
      { status: 500 }
    );
  }
}
