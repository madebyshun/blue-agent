// x402/rh-stock-ohlc (M2) — OHLC candles for RH RWA tokens.
// Price: $0.05
//
// Data source: GeckoTerminal RH Chain pool history (free, no key).
// The pool is chosen by `resolvePrimaryPool` — dollar-anchored counterparty,
// USDG preferred, deepest of those — so the series matches the pool X1/X2
// would trade through. A token with pools but no dollar-quoted one returns
// `no_usd_anchored_pool` and NO candles (#231); an exchange rate is not a
// price. Callers can override with `pool_address` to name a pool themselves.
//
// Timeframes: minute | hour | day. Limits: 1–500 candles.
// Returns chronological (oldest first) candles + a summary block.

import { findByTicker, RH_CHAIN } from "@/lib/robinhood/rwa-registry";
import { poolOhlc, resolvePrimaryPool, candleSummary, type OhlcTimeframe } from "@/lib/robinhood/rwa-market";

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
    // #231. Selection goes through `resolvePrimaryPool`, so this series comes
    // from the SAME pool the execution tools (X1 quote / X2 prepare) would
    // route through — anchored to a dollar counterparty, USDG preferred. The
    // old code selected by SIDE (`token_is_base`) and never looked at the
    // counterparty at all, so a token whose deepest pool was stock-vs-stock or
    // stock-vs-memecoin produced a ratio series labelled as a USD price.
    //
    // `side` then tells GT which half of the pool to price — see poolOhlc's
    // header for the 333× measurement that replaced the old invert math.
    let poolAddress = explicitPool;
    // anchor-exempt(#231): an explicit `pool_address` is the caller naming the
    // pool themselves; we honour it rather than second-guessing it. GT's own
    // default side (base) applies, and `pool_selection` below reports
    // "caller_supplied" so the answer is never mistaken for an anchored one.
    let side: "base" | "quote" = "base";
    let selection = explicitPool ? "caller_supplied" : "no_pool_found";
    let anchoredCount: number | null = null;
    let poolCount: number | null = null;
    const token = findByTicker(ticker);
    if (!poolAddress && token) {
      const primary = await resolvePrimaryPool(token.contract);
      selection = primary.selection;
      anchoredCount = primary.anchored_pool_count;
      poolCount = primary.pool_count;
      if (!primary.pool) {
        return Response.json({
          tool: "rh-stock-ohlc",
          ticker: token.ticker,
          contract: token.contract,
          pool_ref: null, is_v4_pool_id: null, pool_address: null,
          timeframe, limit,
          candles_returned: 0,
          candles: [],
          pool_selection: selection,
          pool_count: poolCount,
          anchored_pool_count: anchoredCount,
          warnings: [
            selection === "no_usd_anchored_pool"
              ? `no_usd_anchored_pool: ${poolCount} pool(s) exist for this token but none is quoted against a dollar-anchored asset (USDG/WETH). A candle series from a stock-vs-stock or stock-vs-memecoin pool is an exchange rate, not a price, so none is returned.`
              : "no_pool: token has no DEX pool on Robinhood Chain — cannot compute OHLC",
          ],
          data_sources: ["api.geckoterminal.com (RH Chain)"],
          network: RH_CHAIN,
          timestamp,
        });
      }
      poolAddress = primary.pool.address;
      side = primary.pool.token_is_base ? "base" : "quote";
    }

    if (!poolAddress) {
      return Response.json({
        tool: "rh-stock-ohlc",
        ticker,
        error: "Ticker not in registry and no pool_address provided.",
      }, { status: 404 });
    }

    const candles = await poolOhlc(poolAddress, timeframe, limit, { side });
    if (!candles) {
      return Response.json({
        tool: "rh-stock-ohlc",
        ticker: token?.ticker ?? null,
        contract: token?.contract ?? null,
        pool_ref: poolAddress,
        is_v4_pool_id: poolAddress.length >= 66,
        pool_address: poolAddress,
        timeframe, limit,
        candles_returned: 0,
        candles: [],
        pool_selection: selection,
        pool_count: poolCount,
        anchored_pool_count: anchoredCount,
        warnings: ["ohlc_unavailable: GeckoTerminal returned no candles (rate-limit or empty pool history)"],
        data_sources: ["api.geckoterminal.com (RH Chain)"],
        network: RH_CHAIN,
        timestamp,
      });
    }

    const warnings: string[] = [];
    if (candles.length < limit) warnings.push(`insufficient_history: requested ${limit} candles but pool only has ${candles.length}`);
    if (candles.length === 1) warnings.push("single_candle: summary.change_pct is derived from ONE candle's open→close and is not a real trend");

    return Response.json({
      tool: "rh-stock-ohlc",
      ticker: token?.ticker ?? null,
      name: token?.name ?? null,
      contract: token?.contract ?? null,
      pool_ref: poolAddress,
      is_v4_pool_id: poolAddress.length >= 66,
      pool_address: poolAddress,   // back-compat
      pool_url: `https://www.geckoterminal.com/robinhood/pools/${poolAddress}`,
      timeframe,
      limit,
      candles_returned: candles.length,
      candles,               // oldest first, [{t,o,h,l,c,v}] — always in USD for our token
      candle_field_meta: {
        t: "unix seconds",
        o_h_l_c: "USD per token",
        v: "base-token units (NOT USD); multiply by ~c for USD volume approx",
      },
      summary: candleSummary(candles),
      pool_selection: selection,
      pool_count: poolCount,
      anchored_pool_count: anchoredCount,
      price_derivation: `Candles are GeckoTerminal's USD price for the ${side} side of this pool, requested directly via its \`token=${side}\` parameter — no inversion and no rescaling is applied.`,
      warnings,
      data_sources: ["api.geckoterminal.com (RH Chain)"],
      network: RH_CHAIN,
      timestamp,
    });
  } catch (e) {
    return Response.json({ error: "rh-stock-ohlc failed", message: (e as Error).message }, { status: 500 });
  }
}
