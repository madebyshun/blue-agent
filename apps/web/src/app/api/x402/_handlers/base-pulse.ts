// x402/base-pulse — Base chain market pulse (TVL + DEX volume + trending). No LLM.
// Price: $0.05
import { getBaseTvl, getBaseTrending, getBaseNewPools } from "@/lib/market-data";
import { filterScamPools } from "./_scam-filter";

const fmtB = (n: number | null | undefined) => (n == null ? "n/a" : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${n.toFixed(0)}`);

export default async function handler(req: Request): Promise<Response> {
  try {
    const [tvl, trendingRaw, freshRaw] = await Promise.all([getBaseTvl(), getBaseTrending(15), getBaseNewPools(30)]);
    const trending = filterScamPools(trendingRaw);
    const fresh    = filterScamPools(freshRaw);
    const top = [...trending].sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0)).slice(0, 5);
    const dexVol = trending.reduce((s, p) => s + (p.volume24h ?? 0), 0);
    const avgChange = trending.length ? trending.reduce((s, p) => s + (p.change.h24 ?? 0), 0) / trending.length : 0;
    const tvl7 = tvl?.change7dPct ?? 0;
    const sentiment = avgChange > 3 && tvl7 >= 0 ? "bullish" : avgChange < -3 || tvl7 < -5 ? "bearish" : "neutral";
    const pulse = Math.max(0, Math.min(100, Math.round(50 + tvl7 * 1.5 + avgChange * 1.2)));

    return Response.json({
      tool: "base-pulse",
      timestamp: new Date().toISOString(),
      tvl_usd: tvl?.tvlUsd ?? null,
      tvl_change_24h: tvl?.change1dPct ?? null,
      tvl_change_7d: tvl?.change7dPct ?? null,
      dex_volume_24h: dexVol || null,
      top_tokens: top.map((p) => ({ symbol: p.baseSymbol, change24h: p.change.h24, volume24h: p.volume24h })),
      new_pools_24h: fresh.length,
      trending_category: top[0]?.baseSymbol ?? null,
      market_sentiment: sentiment,
      pulse_score: pulse,
      summary: `Base TVL ${fmtB(tvl?.tvlUsd)} (${tvl?.change1dPct != null ? (tvl.change1dPct > 0 ? "+" : "") + tvl.change1dPct + "% 24h" : "n/a"}); ${trending.length} trending pools, avg 24h ${avgChange.toFixed(1)}% — ${sentiment}.`,
      data_source: "DefiLlama + GeckoTerminal (live)",
    });
  } catch (e) {
    return Response.json({ error: "base-pulse failed", message: (e as Error).message }, { status: 500 });
  }
}
