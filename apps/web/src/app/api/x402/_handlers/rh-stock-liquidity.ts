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
//
// #231 — EVERY DOLLAR FIGURE HERE IS ANCHORED. The slippage table is priced
// off `resolvePrimaryPool` (dollar-anchored counterparty, USDG preferred), so
// a `trade_size_usd` row means dollars and matches the pool X1/X2 would route
// through. `total_tvl_usd` sums anchored pools only, with the excluded depth
// reported as `unanchored_tvl_usd` — same split #227 applied upstream.
// The full `pools` array still lists everything, each row tagged
// `usd_anchored`, because "show me all pools" is this tool's job.

import { findByTicker, RH_CHAIN } from "@/lib/robinhood/rwa-registry";
import { poolsForToken, resolvePrimaryPool, isUsdAnchored } from "@/lib/robinhood/rwa-market";

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

    // Both reads hit the same memoized GT URL, so this is ONE network call:
    // `resolvePrimaryPool` calls `poolsForToken` internally and the 60s memo in
    // rwa-market serves the second read. We need both because this tool answers
    // two different questions — "which pool speaks for the dollar price"
    // (primary) and "what pools exist at all" (the full list).
    const pools = await poolsForToken(token.contract);
    const primary = await resolvePrimaryPool(token.contract);
    const timestamp = new Date().toISOString();

    // Tag every row so a reader can tell dollar depth from exchange-rate depth
    // without re-deriving the anchor set. #231.
    const poolRows = pools.map((p) => ({ ...p, usd_anchored: isUsdAnchored(p) }));

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

    // Anchored-only dollar aggregates. #227 made `resolvePrimaryPool` do this
    // split already, so we read its numbers rather than re-summing here and
    // risking a second definition of "dollar depth".
    const anchoredVolume = pools
      .filter((p) => isUsdAnchored(p))
      .reduce((s, p) => s + (p.volume_24h_usd ?? 0), 0);
    const unanchoredVolume = pools
      .filter((p) => !isUsdAnchored(p))
      .reduce((s, p) => s + (p.volume_24h_usd ?? 0), 0);

    const warnings: string[] = [];
    if (primary.unanchored_tvl_usd > primary.total_tvl_usd) {
      warnings.push(
        `unanchored_depth_exceeds_dollar_depth: $${primary.unanchored_tvl_usd.toFixed(0)} sits in pools quoted against another equity or a memecoin vs $${primary.total_tvl_usd.toFixed(0)} in dollar-anchored pools. The unanchored depth is real, but it cannot be sold for dollars at the rate those pools display.`,
      );
    }

    // The slippage estimate is a DOLLAR table, so it may only come from a
    // dollar-anchored pool. #231: the xy=k curve itself survives on any pool
    // (depth is a property of the pool), but `trade_size_usd` does not — on a
    // stock-vs-stock pool the "USD" one-side depth is GeckoTerminal's valuation
    // of the OTHER stock, so a $10k row silently answers "how much does $10k of
    // THAT stock move this pool". Rather than print a plausible-looking table
    // in the wrong unit, we return null and say why.
    const deepest = primary.pool;
    if (!deepest) {
      warnings.push(
        primary.selection === "no_usd_anchored_pool"
          ? `no_usd_anchored_pool: ${primary.pool_count} pool(s) exist for this token but none is quoted against a dollar-anchored asset (USDG/WETH), so no dollar-denominated slippage table can be produced. The pools below are listed with their real depth — read them as exchange-rate depth, not dollar depth.`
          : "no_pool: token has no DEX pool on Robinhood Chain",
      );
      return Response.json({
        tool: "rh-stock-liquidity",
        ticker: token.ticker,
        name: token.name,
        contract: token.contract,
        pool_count: primary.pool_count,
        anchored_pool_count: primary.anchored_pool_count,
        pool_selection: primary.selection,
        total_tvl_usd: primary.total_tvl_usd,
        unanchored_tvl_usd: primary.unanchored_tvl_usd,
        total_volume_24h_usd: anchoredVolume,
        unanchored_volume_24h_usd: unanchoredVolume,
        primary_pool: null,
        deepest_pool: null,   // back-compat alias of primary_pool
        pools: poolRows,
        slippage_upper_bound: null,
        warnings,
        data_sources: ["api.geckoterminal.com (RH Chain)"],
        network: RH_CHAIN,
        explorer_url: `${RH_CHAIN.explorer}/address/${token.contract}`,
        timestamp,
      });
    }

    // xy=k first-order slippage uses ONE-SIDE USD depth (≈ TVL / 2 for a
    // balanced pool), NOT the total TVL. Using TVL under-estimates by ~2×.
    // We expose the one-side figure directly and note the assumption.
    const oneSide = deepest.one_side_usd;
    const isV4 = deepest.dex.includes("v4");
    const slippage = SLIPPAGE_SIZES_USD.map((size) => ({
      trade_size_usd: size,
      slippage_pct_upper: oneSide > 0
        ? +(100 * size / (oneSide + size)).toFixed(4)
        : null,
      exceeds_pool_one_side: size > oneSide,
    }));
    if (deepest.reserve_usd < 5_000) warnings.push(`thin_pool: deepest dollar-anchored TVL is only $${deepest.reserve_usd.toFixed(0)}`);
    if (isV4) warnings.push("v4_concentrated_liquidity: real slippage can be LOWER (in-range tick) or MUCH HIGHER (out-of-range) than the xy=k estimate; treat as an order-of-magnitude bound only");

    return Response.json({
      tool: "rh-stock-liquidity",
      ticker: token.ticker,
      name: token.name,
      contract: token.contract,
      pool_count: primary.pool_count,
      anchored_pool_count: primary.anchored_pool_count,
      pool_selection: primary.selection,
      // Dollar-market aggregates: anchored pools only (#227). The excluded
      // depth is reported beside them so nothing is hidden, just relabelled.
      total_tvl_usd: primary.total_tvl_usd,
      unanchored_tvl_usd: primary.unanchored_tvl_usd,
      total_volume_24h_usd: anchoredVolume,
      unanchored_volume_24h_usd: unanchoredVolume,
      primary_pool: deepest,
      deepest_pool: deepest,   // back-compat alias — now the deepest ANCHORED pool
      pools: poolRows,
      slippage_upper_bound: {
        method: "first-order xy=k on ONE-side USD depth",
        one_side_usd: oneSide,
        pool_ref: deepest.pool_ref,
        pool_dex: deepest.dex,
        pool_selection: primary.selection,
        note: "Upper bound only, priced off this token's dollar-anchored primary pool so `trade_size_usd` really is dollars. For Uniswap V4 concentrated liquidity, actual slippage may differ substantially — use rh-stock-swap-quote (X1) for a live quote-time number.",
        estimates: slippage,
      },
      warnings,
      data_sources: ["api.geckoterminal.com (RH Chain)"],
      network: RH_CHAIN,
      explorer_url: `${RH_CHAIN.explorer}/address/${token.contract}`,
      timestamp,
    });
  } catch (e) {
    return Response.json({ error: "rh-stock-liquidity failed", message: (e as Error).message }, { status: 500 });
  }
}
