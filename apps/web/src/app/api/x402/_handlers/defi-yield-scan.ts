/**
 * defi-yield-scan — Hard-filter DeFi yield scan on Base (NO LLM).
 *
 * Fetches DefiLlama yield pools on Base, deduplicates by protocol
 * (keeping highest APY per protocol), filters APY ≥ 4% + TVL ≥ $500K,
 * returns top 5 opportunities.
 *
 * Every number is live from DefiLlama — no LLM synthesis, no fabrication.
 * Returns _noCard:true when nothing passes.
 */
import { getBaseYields, type YieldPool } from "@/lib/market-data";

const MIN_APY = 4;       // %
const MIN_TVL = 500_000; // USD

export default async function handler(_req: Request): Promise<Response> {
  try {
    const raw = await getBaseYields(50, { minTvl: MIN_TVL });

    // Filter: APY ≥ 4%
    const filtered = raw.filter((p) => (p.apy ?? 0) >= MIN_APY);

    // Dedup by protocol — keep highest APY per protocol
    const byProtocol = new Map<string, YieldPool>();
    for (const p of filtered) {
      const existing = byProtocol.get(p.project);
      if (!existing || (p.apy ?? 0) > (existing.apy ?? 0)) {
        byProtocol.set(p.project, p);
      }
    }

    // Sort by APY desc, take top 5
    const opportunities = Array.from(byProtocol.values())
      .sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0))
      .slice(0, 5)
      .map((p) => ({
        protocol:   p.project,
        symbol:     p.symbol,
        apy:        p.apy != null ? +p.apy.toFixed(2) : null,
        apy_base:   p.apyBase   != null ? +p.apyBase.toFixed(2)   : null,
        apy_reward: p.apyReward != null ? +p.apyReward.toFixed(2) : null,
        tvl_usd:    p.tvlUsd,
        il_risk:    p.ilRisk,
        stablecoin: p.stablecoin,
        url:        p.url,
      }));

    if (opportunities.length === 0) {
      return Response.json({
        tool:      "defi-yield-scan",
        opportunities: [],
        _noCard:   true,
        reason:    `No Base DeFi pools passed APY ≥ ${MIN_APY}% + TVL ≥ $${(MIN_TVL / 1_000).toFixed(0)}K filters.`,
        scanned:   raw.length,
        timestamp: new Date().toISOString(),
      });
    }

    const baseline_apy = opportunities[0]?.apy ?? null;

    return Response.json({
      tool:          "defi-yield-scan",
      opportunities,
      count:         opportunities.length,
      baseline_apy,
      total_scanned: raw.length,
      total_passed:  filtered.length,
      filters: {
        min_apy_pct:        MIN_APY,
        min_tvl_usd:        MIN_TVL,
        dedup_by_protocol:  true,
        max_results:        5,
      },
      dataSource: "DefiLlama yields API",
      timestamp:  new Date().toISOString(),
    });
  } catch (e) {
    return Response.json(
      { error: "defi-yield-scan failed", message: (e as Error).message },
      { status: 500 }
    );
  }
}
