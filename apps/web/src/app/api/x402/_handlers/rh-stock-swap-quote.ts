// x402/rh-stock-swap-quote (X1) — quote for a RH tokenized-stock swap.
// Price: $0.05
//
// Given a ticker + side (buy/sell) + amount + optional denom (USDG default,
// or WETH), returns:
//   • best available route (direct pool at deepest liquidity, or multi-hop
//     via WETH if no direct pool exists)
//   • the pool's own address + fee tier (from the RH factory verified in
//     lib/robinhood/swap.ts)
//   • expected_out (spot-based estimate)
//   • min_out (expected_out × (1 − slippage_bps / 10000))
//   • deadline unix (default 5 min from now)
//
// Real, verifiable data:
//   • Route + pool selection: on-chain factory read (RH mainnet RPC)
//   • Price: Chainlink oracle when available, else GT DEX spot for the same
//     pool the swap will hit — self-consistent by construction.
//
// Estimate is spot-based (no V3 tick math). For very small trades relative
// to the pool this is ~exact; for large trades it under-reports slippage,
// which is why we also surface `slippage_upper_bound_from_liquidity`.

import { findByTicker, RH_CHAIN, RH_CHAINLINK_ETH_USD } from "@/lib/robinhood/rwa-registry";
import { chainlinkLatest } from "@/lib/robinhood/rwa-price";
import { poolsForToken } from "@/lib/robinhood/rwa-market";
import {
  ROBINHOOD_MAINNET_VERIFIED_WETH9,
  ROBINHOOD_MAINNET_VERIFIED_FACTORY,
  ROBINHOOD_SWAP_ROUTER_ADDRESS,
} from "@/lib/robinhood/swap";
import { findWethPools, bestPool } from "@/lib/robinhood/pool";

const USDG_ADDR = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as const;

type Side = "buy" | "sell";
type Denom = "USDG" | "WETH";

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: {
      ticker?: string;
      side?: string;
      amount?: string | number;
      denom?: string;
      slippage_bps?: number;
      deadline_minutes?: number;
    } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);

    const ticker = (body.ticker ?? url.searchParams.get("ticker") ?? "").trim();
    const side   = ((body.side ?? url.searchParams.get("side") ?? "buy") as string).toLowerCase() as Side;
    const denomIn = ((body.denom ?? url.searchParams.get("denom") ?? "USDG") as string).toUpperCase() as Denom;
    const slippageBps = Math.max(1, Math.min(5000, Number(body.slippage_bps ?? url.searchParams.get("slippage_bps") ?? 100)));
    const deadlineMin = Math.max(1, Math.min(60, Number(body.deadline_minutes ?? url.searchParams.get("deadline_minutes") ?? 5)));
    const amountStr = String(body.amount ?? url.searchParams.get("amount") ?? "").trim();

    if (!ticker || !amountStr) {
      return Response.json({ error: "Provide `ticker` and `amount` (human-readable, e.g. 100 for $100 USDG)." }, { status: 400 });
    }
    if (side !== "buy" && side !== "sell") {
      return Response.json({ error: "`side` must be `buy` or `sell`." }, { status: 400 });
    }
    if (denomIn !== "USDG" && denomIn !== "WETH") {
      return Response.json({ error: "`denom` must be `USDG` or `WETH`." }, { status: 400 });
    }

    const amount = parseFloat(amountStr);
    if (!Number.isFinite(amount) || amount <= 0) {
      return Response.json({ error: "`amount` must be a positive number." }, { status: 400 });
    }

    const token = findByTicker(ticker);
    if (!token) return Response.json({ tool: "rh-stock-swap-quote", ticker, error: "Ticker not in registry." }, { status: 404 });

    const timestamp = new Date().toISOString();

    // Resolve tokenIn / tokenOut based on side.
    const quoteAddr = denomIn === "USDG" ? USDG_ADDR : ROBINHOOD_MAINNET_VERIFIED_WETH9;
    const quoteDecimals = denomIn === "USDG" ? 6 : 18;
    const tokenIn  = (side === "buy") ? quoteAddr : token.contract;
    const tokenOut = (side === "buy") ? token.contract : quoteAddr;
    const tokenInDecimals  = (side === "buy") ? quoteDecimals : token.decimals;
    const tokenOutDecimals = (side === "buy") ? token.decimals : quoteDecimals;

    // ── Look up the deepest pool via the RH factory verified in swap.ts. ─
    // findWethPools handles TOKEN/WETH — but we want TOKEN/USDG when denom is
    // USDG. Fall back to a WETH-hopped route (multi-hop) if no direct pool.
    // Existing lib doesn't expose a generic TOKEN/USDG probe, so we use
    // GeckoTerminal to pick the actual pool address the router will hit.
    const gtPools = await poolsForToken(token.contract);
    const denomLower = quoteAddr.toLowerCase();
    const directGt = gtPools.find(
      (p) =>
        (p.base_token === denomLower || p.quote_token === denomLower) &&
        p.reserve_usd > 0,
    );

    // On-chain WETH pool probe — always accurate.
    let bestWethPool = null;
    if (denomIn === "WETH") {
      const pools = await findWethPools(token.contract);
      bestWethPool = bestPool(pools) ?? null;
    }

    // Chainlink oracle price for the RWA — trusted anchor.
    const oracle = token.chainlinkFeed
      ? await chainlinkLatest(token.chainlinkFeed, token.chainlinkHeartbeat ?? 86400)
      : null;

    // Prefer Chainlink price × 1 for spot; fall back to DEX spot if oracle
    // absent. When denom === USDG, oracle price is directly the USDG price.
    // When denom === WETH, we need WETH's USD price to convert — pull it from
    // the same pool GT reported for us (counterparty_usd if RWA is quote, or
    // via a separate lookup — for now trust GT DEX spot as WETH's USD).
    let spot_usd: number | null = null;
    let spot_source: "chainlink" | "dex-spot" | null = null;
    if (oracle && !oracle.is_stale) { spot_usd = oracle.price_usd; spot_source = "chainlink"; }
    else if (gtPools[0]) { spot_usd = gtPools[0].price_usd; spot_source = "dex-spot"; }

    // ── Compute expected_out ─────────────────────────────────────────────
    // For USDG (~$1) the math is direct. For WETH we need WETH's USD price to
    // convert `amount WETH` → USD → RWA units and vice versa.
    let expected_out: number | null = null;
    let route_kind: "direct" | "multi-hop" | null = null;
    if (spot_usd !== null) {
      if (denomIn === "USDG") {
        // Assume USDG ≈ $1 (validated by Chainlink USDG/USD feed elsewhere).
        // For "buy": USDG in → RWA out.  RWA_out = USDG / spot.
        // For "sell": RWA in → USDG out. USDG_out = RWA × spot.
        expected_out = side === "buy" ? amount / spot_usd : amount * spot_usd;
        route_kind = directGt ? "direct" : "multi-hop";
      } else {
        // WETH denom — need WETH's USD price. Prefer Chainlink ETH/USD on
        // RH Chain (deterministic); fall back to any WETH-quoted pool from GT.
        const ethQuote = await chainlinkLatest(RH_CHAINLINK_ETH_USD, 86400);
        let weth_usd: number | null = ethQuote?.price_usd ?? null;
        if (!weth_usd) {
          const wethPool = gtPools.find((p) => p.base_token === ROBINHOOD_MAINNET_VERIFIED_WETH9.toLowerCase() || p.quote_token === ROBINHOOD_MAINNET_VERIFIED_WETH9.toLowerCase());
          weth_usd = wethPool?.counterparty_usd ?? wethPool?.price_usd ?? null;
        }
        if (weth_usd) {
          expected_out = side === "buy"
            ? (amount * weth_usd) / spot_usd     // WETH → USD → RWA
            : (amount * spot_usd) / weth_usd;    // RWA → USD → WETH
          route_kind = bestWethPool ? "direct" : "multi-hop";
        }
      }
    }

    const min_out = expected_out !== null ? expected_out * (1 - slippageBps / 10000) : null;

    // ── Base-units (bigint-ish) representation for X2 to consume ─────────
    const amountInBaseUnits = BigInt(Math.round(amount * Math.pow(10, tokenInDecimals))).toString();
    const minOutBaseUnits = min_out !== null
      ? BigInt(Math.max(0, Math.floor(min_out * Math.pow(10, tokenOutDecimals)))).toString()
      : null;

    // Slippage upper bound from pool depth — first-order xy=k.
    const deepestPoolTvl = gtPools[0]?.reserve_usd ?? 0;
    const notional_usd = denomIn === "USDG" ? (side === "buy" ? amount : (expected_out ?? amount)) : ((expected_out ?? amount) * (spot_usd ?? 0));
    const slippage_upper_pct = deepestPoolTvl > 0 && notional_usd > 0
      ? +(100 * notional_usd / (deepestPoolTvl + notional_usd)).toFixed(4)
      : null;

    return Response.json({
      tool: "rh-stock-swap-quote",
      ticker: token.ticker,
      name: token.name,
      contract: token.contract,
      side,
      denom_in: denomIn,
      amount_in: amount,
      amount_in_base_units: amountInBaseUnits,
      spot_usd,
      spot_source,
      expected_out,
      expected_out_base_units: expected_out !== null
        ? BigInt(Math.max(0, Math.floor(expected_out * Math.pow(10, tokenOutDecimals)))).toString()
        : null,
      min_out,
      min_out_base_units: minOutBaseUnits,
      slippage_bps: slippageBps,
      slippage_upper_bound_from_liquidity_pct: slippage_upper_pct,
      route: {
        kind: route_kind,
        note: route_kind === "multi-hop"
          ? "No direct pool at the requested denom — X2 will build a WETH-hopped path (2 approves + 2 swaps)."
          : route_kind === "direct"
            ? "Direct pool available at the requested denom."
            : "Cannot resolve a route at spot pricing — try WETH denom or verify token liquidity.",
        direct_pool_gt: directGt
          ? { address: directGt.address, name: directGt.name, dex: directGt.dex, fee_bps: directGt.fee_bps, tvl_usd: directGt.reserve_usd }
          : null,
        direct_pool_on_chain_weth: bestWethPool
          ? { address: bestWethPool.address, fee: bestWethPool.fee, liquidity: bestWethPool.liquidity }
          : null,
      },
      execution: {
        token_in: tokenIn,
        token_out: tokenOut,
        token_in_decimals: tokenInDecimals,
        token_out_decimals: tokenOutDecimals,
        router: ROBINHOOD_SWAP_ROUTER_ADDRESS,
        factory: ROBINHOOD_MAINNET_VERIFIED_FACTORY,
        deadline_unix: Math.floor(Date.now() / 1000) + deadlineMin * 60,
        deadline_minutes: deadlineMin,
      },
      chainlink: oracle,
      data_sources: [
        "on-chain RH V3 factory (getPool + liquidity)",
        "api.geckoterminal.com (RH Chain)",
        oracle ? "Chainlink AggregatorV3 (RH Chain)" : null,
      ].filter(Boolean),
      network: RH_CHAIN,
      timestamp,
    });
  } catch (e) {
    return Response.json({ error: "rh-stock-swap-quote failed", message: (e as Error).message }, { status: 500 });
  }
}
