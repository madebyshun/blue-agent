// x402/rh-stock-liquidity (M3) — pool + TVL + slippage estimate.
// Price: $0.05
//
// For a given RH RWA ticker, returns all pools (sorted by TVL) plus an
// order-book-style slippage estimate for common trade sizes. Uses reserve
// data from GeckoTerminal — deterministic, no LLM.
//
// Slippage math: for a constant-product AMM, slipping N USDC through a pool
// with reserve R_usdc results in receiving ~(N / (R + N)) fraction less than
// the spot rate. That's a first-order approximation — real V3 concentrated
// liquidity will trade tighter — but it gives builders an honest upper bound.

import { findByTicker, RH_CHAIN } from "@/lib/robinhood/rwa-registry";
import { poolsForToken } from "@/lib/robinhood/rwa-market";

const SLIPPAGE_SIZES_USD = [100, 1_000, 10_000, 100_000];

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { ticker?: string } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const ticker = (body.ticker ?? url.searchParams.get("ticker") ?? "").trim();

    if (!ticker) return Response.json({ error: "Provide `ticker` (e.g. MSTR, AAPL)." }, { status: 400 });

    const token = findByTicker(ticker);
    if (!token) {
      return Response.json({ tool: "rh-stock-liquidity", ticker, error: "Ticker not in registry." }, { status: 404 });
    }

    const pools = await poolsForToken(token.contract);
    const timestamp = new Date().toISOString();

    if (!pools.length) {
      return Response.json({
        tool: "rh-stock-liquidity",
        ticker: token.ticker,
        name: token.name,
        contract: token.contract,
        pools: [],
        total_tvl_usd: 0,
        note: "No DEX pools found for this token on Robinhood Chain.",
        data_sources: ["api.geckoterminal.com (RH Chain)"],
        network: RH_CHAIN,
        timestamp,
      });
    }

    // Deepest pool drives the slippage estimate.
    const deepest = pools[0];
    const slippage = SLIPPAGE_SIZES_USD.map((size) => ({
      trade_size_usd: size,
      // First-order xy=k slippage (upper bound). Real V3 slips less.
      slippage_pct_upper: deepest.reserve_usd > 0
        ? +(100 * size / (deepest.reserve_usd + size)).toFixed(4)
        : null,
      exceeds_pool_reserve: size > deepest.reserve_usd,
    }));

    return Response.json({
      tool: "rh-stock-liquidity",
      ticker: token.ticker,
      name: token.name,
      contract: token.contract,
      pool_count: pools.length,
      total_tvl_usd: pools.reduce((s, p) => s + p.reserve_usd, 0),
      total_volume_24h_usd: pools.reduce((s, p) => s + (p.volume_24h_usd ?? 0), 0),
      deepest_pool: deepest,
      pools,
      slippage_upper_bound: {
        method: "first-order xy=k",
        note: "Upper bound only — real V3 slippage is typically 30–70% of this figure. Use rh-stock-swap-quote (Phase 3) for a live quote.",
        estimates: slippage,
      },
      data_sources: ["api.geckoterminal.com (RH Chain)"],
      network: RH_CHAIN,
      explorer_url: `${RH_CHAIN.explorer}/address/${token.contract}`,
      timestamp,
    });
  } catch (e) {
    return Response.json({ error: "rh-stock-liquidity failed", message: (e as Error).message }, { status: 500 });
  }
}
