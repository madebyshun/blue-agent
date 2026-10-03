// x402/base-pulse — Base chain market pulse (TVL + DEX volume + trending). No LLM.
// Price: $0.05
//
// `dex_volume_24h` was, until 2026-10-03, the sum of 24h volume across the
// <= 15 GeckoTerminal *trending* pools left after the scam filter — a number
// that moves with what happens to be trending, published under a name that
// says "Base DEX volume". It is now DefiLlama's chain-wide Base DEX volume,
// which is what the name always claimed. The trending-pool sum is still here,
// under `trending_pools_volume_24h`, so nothing it was good for is lost.
//
// `market_sentiment` and `pulse_score` used to read `tvl?.change7dPct ?? 0`
// and an average-change of 0 when no trending pool came back, so a full
// upstream outage published `pulse_score: 50, "neutral"` as if measured. Both
// inputs are now required: missing either → "unknown" / null, with the reason
// in `pulse_unavailable_reason`. The verdict word is still hard-mapped in code.
import { getBaseTvl, getBaseTrending, getBaseNewPools, getBaseDexVolume } from "@/lib/market-data";
import { filterScamPools } from "./_scam-filter";

const fmtB = (n: number | null | undefined) => (n == null ? "n/a" : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${n.toFixed(0)}`);

export default async function handler(req: Request): Promise<Response> {
  try {
    const [tvl, dex, trendingRaw, freshRaw] = await Promise.all([
      getBaseTvl(), getBaseDexVolume(), getBaseTrending(15), getBaseNewPools(30),
    ]);
    const trending = filterScamPools(trendingRaw);
    const fresh    = filterScamPools(freshRaw);
    const top = [...trending].sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0)).slice(0, 5);
    const trendingVol = trending.reduce((s, p) => s + (p.volume24h ?? 0), 0);
    // Only pools that actually report a 24h change count — a missing change is not 0%.
    const changes = trending.map((p) => p.change.h24).filter((c): c is number => typeof c === "number" && Number.isFinite(c));
    const avgChange = changes.length ? changes.reduce((s, c) => s + c, 0) / changes.length : null;
    const tvl7 = tvl?.change7dPct ?? null;
    const missing = [
      tvl7 == null ? "Base TVL 7d change unavailable (DefiLlama)" : null,
      avgChange == null ? "no trending pools with a 24h change (GeckoTerminal)" : null,
    ].filter((m): m is string => m != null);
    let sentiment: "bullish" | "bearish" | "neutral" | "unknown" = "unknown";
    let pulse: number | null = null;
    if (tvl7 != null && avgChange != null) {
      sentiment = avgChange > 3 && tvl7 >= 0 ? "bullish" : avgChange < -3 || tvl7 < -5 ? "bearish" : "neutral";
      pulse = Math.max(0, Math.min(100, Math.round(50 + tvl7 * 1.5 + avgChange * 1.2)));
    }

    return Response.json({
      tool: "base-pulse",
      chain: "base",
      chainId: 8453,
      timestamp: new Date().toISOString(),
      tvl_usd: tvl?.tvlUsd ?? null,
      tvl_change_24h: tvl?.change1dPct ?? null,
      tvl_change_7d: tvl?.change7dPct ?? null,
      // Chain-wide (DefiLlama). Null when DefiLlama is unreachable — never the
      // trending sum standing in for it.
      dex_volume_24h: dex?.volume24hUsd ?? null,
      dex_volume_change_24h: dex?.change1dPct ?? null,
      // Sum over the trending pools below only. A slice of the market, not its size.
      trending_pools_volume_24h: trendingVol || null,
      top_tokens: top.map((p) => ({ symbol: p.baseSymbol, change24h: p.change.h24, volume24h: p.volume24h })),
      new_pools_24h: fresh.length,
      trending_category: top[0]?.baseSymbol ?? null,
      market_sentiment: sentiment,
      pulse_score: pulse,
      pulse_unavailable_reason: missing.length ? `insufficient data: ${missing.join("; ")}` : null,
      summary: `Base TVL ${fmtB(tvl?.tvlUsd)} (${tvl?.change1dPct != null ? (tvl.change1dPct > 0 ? "+" : "") + tvl.change1dPct + "% 24h" : "n/a"}); Base DEX volume ${fmtB(dex?.volume24hUsd)} 24h; ${trending.length} trending pools, avg 24h ${avgChange != null ? `${avgChange.toFixed(1)}%` : "n/a"} — ${sentiment}.`,
      data_source: "DefiLlama (TVL, DEX volume) + GeckoTerminal (trending, new pools) — live",
    });
  } catch (e) {
    return Response.json({ error: "base-pulse failed", message: (e as Error).message }, { status: 500 });
  }
}
