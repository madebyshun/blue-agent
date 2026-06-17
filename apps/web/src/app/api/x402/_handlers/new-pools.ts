// x402/new-pools — freshly created Base liquidity pools with a basic risk flag
// Price: $0.05 — live GeckoTerminal new-pools, no LLM, no fabricated numbers.

import { getBaseNewPools } from "@/lib/market-data";

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { hours?: number } = {};
    try {
      const text = await req.text();
      if (text?.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}
    const url = new URL(req.url);
    if (body.hours == null) {
      const q = url.searchParams.get("hours");
      if (q != null) body.hours = parseFloat(q);
    }
    const hours = Number.isFinite(body.hours as number) && (body.hours as number) > 0 ? (body.hours as number) : 24;

    console.log(`[NewPools] Fetching new Base pools within ${hours}h`);

    const pools = await getBaseNewPools(30).catch(() => []);

    // GeckoTerminal's new_pools list does not expose a creation timestamp in the
    // mapped Pool shape, so age is unknown. We keep age_hours null rather than
    // inventing one, and therefore cannot filter by `hours` when age is unknown.
    const mapped = pools.map((p) => {
      const liquidity_usd = p.liquidityUsd;
      return {
        symbol: p.baseSymbol || p.name || null,
        address: p.poolAddress || null,
        age_hours: null as number | null,
        liquidity_usd,
        volume_24h: p.volume24h,
        price_usd: p.priceUsd,
        change_1h: p.change.h1,
        // Code logic, not LLM: thin liquidity is the cheap-to-rug signal.
        honeypot_flag: liquidity_usd != null ? liquidity_usd < 10000 : null,
        url: p.url || null,
      };
    });

    // Only filter when age is actually known. All ages are null here, so the
    // full list passes — but the guard keeps the behaviour correct if a future
    // data source supplies age_hours.
    const filtered = mapped.filter((p) => p.age_hours == null || p.age_hours <= hours);

    return Response.json({
      tool: "new-pools",
      pools: filtered,
      total_found: filtered.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[NewPools] Error:", error);
    return Response.json(
      { error: "New pools lookup failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
