// x402/rh-stock-arb (M5) — Chainlink vs DEX arbitrage delta.
// Price: $0.05
//
// For a given RH RWA ticker, reads:
//   • Chainlink AggregatorV3 latestRoundData (oracle-truth price)
//   • Deepest DEX pool spot on RH Chain (executable price)
// and returns the delta in absolute and percentage terms, plus a directional
// verdict (LONG_DEX, SHORT_DEX, ALIGNED).
//
// This is a real trading signal, not an LLM opinion. The verdict is derived
// deterministically from the numeric delta.

import { findByTicker, RH_CHAIN } from "@/lib/robinhood/rwa-registry";
import { chainlinkLatest } from "@/lib/robinhood/rwa-price";
import { poolsForToken } from "@/lib/robinhood/rwa-market";

// Threshold below which we call it "aligned" — Chainlink heartbeat is 24h so
// small drift is normal even when nothing's changed off-chain.
const ALIGNED_PCT = 0.5;

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { ticker?: string } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const ticker = (body.ticker ?? url.searchParams.get("ticker") ?? "").trim();
    if (!ticker) return Response.json({ error: "Provide `ticker` (e.g. MSTR, AAPL)." }, { status: 400 });

    const token = findByTicker(ticker);
    if (!token) return Response.json({ tool: "rh-stock-arb", ticker, error: "Ticker not in registry." }, { status: 404 });

    const timestamp = new Date().toISOString();

    const [chainlink, pools] = await Promise.all([
      token.chainlinkFeed
        ? chainlinkLatest(token.chainlinkFeed, token.chainlinkHeartbeat ?? 86400)
        : Promise.resolve(null),
      poolsForToken(token.contract),
    ]);

    const dex = pools[0] ?? null;

    // Cannot arb without both sources — return honest INSUFFICIENT_DATA.
    if (!chainlink || !dex) {
      return Response.json({
        tool: "rh-stock-arb",
        ticker: token.ticker,
        name: token.name,
        contract: token.contract,
        verdict: "INSUFFICIENT_DATA",
        chainlink: chainlink ?? null,
        dex: dex ?? null,
        note: !chainlink && !dex
          ? "Neither Chainlink feed nor a DEX pool available for this ticker."
          : !chainlink
            ? "No Chainlink feed available for this ticker."
            : "No DEX pool found for this token on Robinhood Chain.",
        data_sources: [
          chainlink ? "Chainlink AggregatorV3 on-chain (RH Chain)" : null,
          dex ? "api.geckoterminal.com (RH Chain)" : null,
        ].filter(Boolean),
        network: RH_CHAIN,
        timestamp,
      });
    }

    const cl = chainlink.price_usd;
    const dx = dex.price_usd;
    const abs_delta = dx - cl;
    const pct_delta = (abs_delta / cl) * 100;

    // Verdict — hard-mapped from the sign + magnitude, never LLM'd.
    let verdict: "ALIGNED" | "LONG_DEX" | "SHORT_DEX";
    if (Math.abs(pct_delta) < ALIGNED_PCT) verdict = "ALIGNED";
    else if (pct_delta < 0) verdict = "LONG_DEX";  // DEX below oracle → buy DEX
    else verdict = "SHORT_DEX";                     // DEX above oracle → sell DEX

    return Response.json({
      tool: "rh-stock-arb",
      ticker: token.ticker,
      name: token.name,
      contract: token.contract,
      verdict,
      delta: {
        abs_usd: +abs_delta.toFixed(6),
        pct: +pct_delta.toFixed(4),
        aligned_threshold_pct: ALIGNED_PCT,
      },
      chainlink,
      dex: {
        pool_address: dex.address,
        pool_name: dex.name,
        dex_id: dex.dex,
        price_usd: dex.price_usd,
        tvl_usd: dex.reserve_usd,
        volume_24h_usd: dex.volume_24h_usd,
        change_24h_pct: dex.change_24h,
        pool_url: dex.url,
      },
      data_sources: [
        "Chainlink AggregatorV3 on-chain (RH Chain)",
        "api.geckoterminal.com (RH Chain)",
      ],
      network: RH_CHAIN,
      timestamp,
    });
  } catch (e) {
    return Response.json({ error: "rh-stock-arb failed", message: (e as Error).message }, { status: 500 });
  }
}
