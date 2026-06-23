/**
 * base-token-scan — Hard-filter momentum scan on Base (NO LLM).
 *
 * Fetches GeckoTerminal trending pools, applies 5 hard-code filters,
 * returns ≤ 3 signals. Returns _noCard:true if nothing passes so the
 * feed stays silent rather than publishing low-quality noise.
 *
 * Filters applied in order:
 *  1. Scam filter  — blocks impersonated brands + > 1000% change
 *  2. vol24h       > $100K
 *  3. liquidityUsd > $50K
 *  4. liq/vol      ≥ 10%  (healthy depth relative to volume)
 *  5. change_24h   > 0% and < 500%  (positive momentum, not a rug pump)
 */
import { getBaseTrending } from "@/lib/market-data";
import { filterScamPools } from "./_scam-filter";

export default async function handler(_req: Request): Promise<Response> {
  try {
    const raw   = await getBaseTrending(25);
    const pools = filterScamPools(raw);

    const signals = pools
      .filter((p) => {
        const vol  = p.volume24h   ?? 0;
        const liq  = p.liquidityUsd ?? 0;
        const ch24 = p.change.h24;
        if (vol < 100_000)                   return false; // filter 2
        if (liq < 50_000)                    return false; // filter 3
        if (liq / vol < 0.10)               return false; // filter 4
        if (ch24 == null || ch24 <= 0)      return false; // filter 5a
        if (ch24 >= 500)                     return false; // filter 5b
        return true;
      })
      .slice(0, 3)
      .map((p) => ({
        symbol:        p.baseSymbol,
        price_usd:     p.priceUsd,
        change_24h:    p.change.h24,
        change_1h:     p.change.h1,
        volume_24h:    p.volume24h,
        liquidity_usd: p.liquidityUsd,
        market_cap:    p.marketCap,
        liq_vol_ratio: p.liquidityUsd != null && p.volume24h
          ? +((p.liquidityUsd / p.volume24h) * 100).toFixed(1)
          : null,
        filters_passed: 5,
        url: p.url,
      }));

    if (signals.length === 0) {
      return Response.json({
        tool:      "base-token-scan",
        signals:   [],
        _noCard:   true,
        reason:    "No Base tokens passed all 5 quality filters this scan.",
        scanned:   pools.length,
        timestamp: new Date().toISOString(),
      });
    }

    return Response.json({
      tool:    "base-token-scan",
      signals,
      count:   signals.length,
      scanned: pools.length,
      filters: {
        min_volume_24h:       100_000,
        min_liquidity:         50_000,
        min_liq_vol_ratio_pct:     10,
        change_24h_range:    "0–500%",
        scam_filter:             true,
      },
      dataSource: "GeckoTerminal + Blue Agent scam filter",
      timestamp:  new Date().toISOString(),
    });
  } catch (e) {
    return Response.json(
      { error: "base-token-scan failed", message: (e as Error).message },
      { status: 500 }
    );
  }
}
