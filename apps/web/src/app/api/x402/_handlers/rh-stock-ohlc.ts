// x402/rh-stock-ohlc (M2) — OHLC candles for RH RWA tokens.
// Price: $0.05
//
// Data source: GeckoTerminal RH Chain pool history (free, no key).
// The pool with the deepest liquidity is chosen automatically. Callers can
// override with `pool_address` if they want a specific pool.
//
// Timeframes: minute | hour | day. Limits: 1–500 candles.
// Returns chronological (oldest first) candles + a summary block.

import { findByTicker, RH_CHAIN } from "@/lib/robinhood/rwa-registry";
import { poolOhlc, poolsForToken, candleSummary, type OhlcTimeframe } from "@/lib/robinhood/rwa-market";

const ALLOWED: OhlcTimeframe[] = ["minute", "hour", "day"];

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { ticker?: string; timeframe?: string; limit?: number; pool_address?: string } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const ticker = (body.ticker ?? url.searchParams.get("ticker") ?? "").trim();
    const timeframeRaw = (body.timeframe ?? url.searchParams.get("timeframe") ?? "hour").toLowerCase();
    const timeframe = (ALLOWED as string[]).includes(timeframeRaw) ? (timeframeRaw as OhlcTimeframe) : "hour";
    const limit = Math.max(1, Math.min(500, Number(body.limit ?? url.searchParams.get("limit") ?? 100)));
    const explicitPool = (body.pool_address ?? url.searchParams.get("pool_address") ?? "").trim();

    if (!ticker && !explicitPool) {
      return Response.json({ error: "Provide `ticker` (e.g. MSTR) or `pool_address`." }, { status: 400 });
    }

    const timestamp = new Date().toISOString();

    // ── Resolve target pool ──────────────────────────────────────────────
    // Prefer pools where our token is on the BASE side — GT OHLC candles are
    // then already in USD terms for our token. Fall back to a quote-side pool
    // with inversion + counterparty USD multiplier when no base-side exists.
    let poolAddress = explicitPool;
    let invert = false;
    let usdMul = 1;
    const token = findByTicker(ticker);
    if (!poolAddress && token) {
      const pools = await poolsForToken(token.contract);
      if (!pools.length) {
        return Response.json({
          tool: "rh-stock-ohlc",
          ticker: token.ticker,
          candles: [],
          note: "No DEX pool found for this token on Robinhood Chain — cannot compute OHLC.",
          data_sources: ["api.geckoterminal.com (RH Chain)"],
          network: RH_CHAIN,
          timestamp,
        });
      }
      const basePool = pools.find((p) => p.token_is_base);
      const chosen = basePool ?? pools[0];
      poolAddress = chosen.address;
      if (!chosen.token_is_base) {
        invert = true;
        usdMul = chosen.counterparty_usd ?? 1;
      }
    }

    if (!poolAddress) {
      return Response.json({
        tool: "rh-stock-ohlc",
        ticker,
        error: "Ticker not in registry and no pool_address provided.",
      }, { status: 404 });
    }

    const candles = await poolOhlc(poolAddress, timeframe, limit, { invert, usd_multiplier: usdMul });
    if (!candles) {
      return Response.json({
        tool: "rh-stock-ohlc",
        ticker: token?.ticker ?? null,
        pool_address: poolAddress,
        candles: [],
        note: "OHLC data unavailable (rate-limit or empty history).",
        data_sources: ["api.geckoterminal.com (RH Chain)"],
        network: RH_CHAIN,
        timestamp,
      });
    }

    return Response.json({
      tool: "rh-stock-ohlc",
      ticker: token?.ticker ?? null,
      name: token?.name ?? null,
      contract: token?.contract ?? null,
      pool_address: poolAddress,
      pool_url: `https://www.geckoterminal.com/robinhood/pools/${poolAddress}`,
      timeframe,
      limit,
      candles,               // oldest first, [{t,o,h,l,c,v}] — always in USD for our token
      summary: candleSummary(candles),
      price_derivation: invert
        ? `Pool has token on quote side — candles inverted (1/x) and multiplied by counterparty USD price (${usdMul}) to yield token USD.`
        : "Pool has token on base side — candles are native USD.",
      data_sources: ["api.geckoterminal.com (RH Chain)"],
      network: RH_CHAIN,
      timestamp,
    });
  } catch (e) {
    return Response.json({ error: "rh-stock-ohlc failed", message: (e as Error).message }, { status: 500 });
  }
}
