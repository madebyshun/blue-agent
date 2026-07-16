// x402/rh-stock-movers (M4) — top RH RWA gainers/losers 24h.
// Price: $0.05
//
// Pulls top pools on Robinhood Chain by 24h volume, cross-references against
// the canonical RH RWA registry (drops non-RWA pools like ROBINHOOD/WETH), and
// ranks by 24h price change.
//
// Real data only — no fabricated movers. If < 3 registered RWA pools show up
// with volume, returns an empty list rather than pad the response.

import { RWA_TOKENS, RH_CHAIN } from "@/lib/robinhood/rwa-registry";
import { poolsForToken, type PoolMeta } from "@/lib/robinhood/rwa-market";

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { limit?: number } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(20, Number(body.limit ?? url.searchParams.get("limit") ?? 5)));

    const timestamp = new Date().toISOString();

    // Iterate the RWA registry and pull each token's deepest pool. This is
    // ~20 GT calls, but poolsForToken has an in-memory 60s memo and always
    // resolves prices correctly for the queried token (base OR quote side).
    // Compared to topPools + heuristics, this is honest about which token
    // moved by how much.
    const stocks = RWA_TOKENS.filter((t) => t.kind === "stock" || t.kind === "etf");
    const perToken = await Promise.all(
      stocks.map(async (rwa) => {
        try {
          const pools = await poolsForToken(rwa.contract);
          if (!pools.length) return null;
          // Deepest pool that reports a 24h change becomes the mover source.
          const best = pools.find((p) => p.change_24h !== null) ?? null;
          if (!best) return null;
          return { rwa, pool: best };
        } catch {
          return null;
        }
      }),
    );

    type WithToken = {
      rwa: (typeof RWA_TOKENS)[number];
      pool: PoolMeta;
      token_change_24h: number;
      token_price_usd: number;
    };
    const rwaPools: WithToken[] = perToken
      .filter((r): r is { rwa: (typeof RWA_TOKENS)[number]; pool: PoolMeta } => r !== null)
      .map((r) => ({
        rwa: r.rwa,
        pool: r.pool,
        // pool.change_24h + pool.price_usd are already for OUR token (poolsForToken
        // selects the correct side per token).
        token_change_24h: r.pool.change_24h!,
        token_price_usd: r.pool.price_usd,
      }));

    // If zero pools with change, return an empty response honestly. With ≥1
    // real signal we surface it — better honest partial data than nothing.
    if (rwaPools.length === 0) {
      return Response.json({
        tool: "rh-stock-movers",
        gainers: [],
        losers: [],
        note: "No RWA tokens on Robinhood Chain currently report a 24h change via GeckoTerminal — DEX liquidity is still forming.",
        universe: { registered_tokens: stocks.length, tokens_with_pool_change: 0 },
        data_sources: ["api.geckoterminal.com (RH Chain)"],
        network: RH_CHAIN,
        timestamp,
      });
    }

    const asRow = (r: WithToken) => ({
      ticker: r.rwa.ticker,
      name: r.rwa.name,
      contract: r.rwa.contract,
      kind: r.rwa.kind,
      sector: r.rwa.sector ?? null,
      price_usd: r.token_price_usd,
      change_24h_pct: r.token_change_24h,
      change_1h_pct: r.pool.change_1h,
      volume_24h_usd: r.pool.volume_24h_usd,
      tvl_usd: r.pool.reserve_usd,
      pool_address: r.pool.address,
      pool_name: r.pool.name,
      pool_url: r.pool.url,
    });

    const gainers = [...rwaPools].sort((a, b) => b.token_change_24h - a.token_change_24h).slice(0, limit).map(asRow);
    const losers  = [...rwaPools].sort((a, b) => a.token_change_24h - b.token_change_24h).slice(0, limit).map(asRow);

    return Response.json({
      tool: "rh-stock-movers",
      timeframe: "24h",
      gainers,
      losers,
      universe: {
        registered_tokens: stocks.length,
        tokens_with_pool_change: rwaPools.length,
      },
      data_sources: ["api.geckoterminal.com (RH Chain)", "docs.robinhood.com/chain/contracts"],
      network: RH_CHAIN,
      timestamp,
    });
  } catch (e) {
    return Response.json({ error: "rh-stock-movers failed", message: (e as Error).message }, { status: 500 });
  }
}
