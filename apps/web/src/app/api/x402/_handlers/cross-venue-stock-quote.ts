// x402/cross-venue-stock-quote — unified tokenized stock quote across Base B20,
// Robinhood Chain 4663, and Chainlink oracle with spread & slippage metrics.
// Price: $0.02
import { runInternalTool } from "@/lib/x402-internal-run";
import { stockListings } from "@/lib/mcp-stock-tools";
import { nyseMarketStatus } from "@/lib/robinhood/rwa-market";

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { ticker?: string } = {};
    try {
      const t = await req.text();
      if (t?.trim().startsWith("{")) body = JSON.parse(t);
    } catch {}
    const url = new URL(req.url);
    const ticker = (body.ticker ?? url.searchParams.get("ticker") ?? "").trim();
    if (!ticker) {
      return Response.json({ error: 'ticker is required, e.g. "NVDA" or "TSLA"' }, { status: 400 });
    }

    const listings = stockListings(ticker);
    if (!listings.base && !listings.robinhood) {
      const hint = listings.suggestions.length ? ` Close matches on Base: ${listings.suggestions.join(", ")}.` : "";
      return Response.json(
        { error: `No tokenized stock "${ticker}" is listed on Base 8453 or Robinhood Chain 4663.${hint}` },
        { status: 404 },
      );
    }

    const [baseRes, rhRes] = await Promise.all([
      listings.base ? runInternalTool({ tool: "base-stock-quote", body: { ticker }, service: true, timeoutMs: 20_000 }) : Promise.resolve(null),
      listings.robinhood ? runInternalTool({ tool: "rh-stock-quote", body: { ticker: listings.rhTicker }, service: true, timeoutMs: 20_000 }) : Promise.resolve(null),
    ]);

    const baseData = baseRes && baseRes.status === 200 ? baseRes.body : null;
    const rhData = rhRes && rhRes.status === 200 ? rhRes.body : null;

    if (!baseData && !rhData) {
      return Response.json(
        { error: "Both Base and Robinhood stock quote reads failed", tool: "cross-venue-stock-quote" },
        { status: 502 },
      );
    }

    const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const baseDexObj = baseData?.dex && typeof baseData.dex === "object" ? (baseData.dex as Record<string, unknown>) : null;
    const baseOracleObj = baseData?.oracle && typeof baseData.oracle === "object" ? (baseData.oracle as Record<string, unknown>) : null;
    const basePrice = num(baseDexObj?.price_usd ?? baseData?.dex_price_usd);
    const baseOraclePrice = num(baseOracleObj?.share_price_usd);
    const rhPrice = num(rhData?.dex_price_usd ?? rhData?.price_usd);
    const spreadPct =
      basePrice !== null && rhPrice !== null && rhPrice > 0
        ? +(((basePrice - rhPrice) / rhPrice) * 100).toFixed(3)
        : null;

    const market = nyseMarketStatus(new Date());

    return Response.json({
      tool: "cross-venue-stock-quote",
      ticker: ticker.toUpperCase(),
      us_market_session: market.session,
      base_dex_price_usd: basePrice,
      base_oracle_price_usd: baseOraclePrice,
      robinhood_price_usd: rhPrice,
      cross_venue_spread_pct: spreadPct,
      spread_note:
        spreadPct !== null
          ? `Base DEX is ${spreadPct > 0 ? "+" : ""}${spreadPct}% vs Robinhood Chain (${rhData?.source === "chainlink" ? "Chainlink oracle" : "DEX"})`
          : "Cross-venue spread unavailable (stock listed or priced on one venue only)",
      venues: {
        base: baseData ? { chain_id: 8453, ...baseData } : { listed: listings.base, error: baseRes ? `status ${baseRes.status}` : "not listed" },
        robinhood: rhData ? { chain_id: 4663, ...rhData } : { listed: listings.robinhood, error: rhRes ? `status ${rhRes.status}` : "not listed" },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return Response.json({ error: "cross-venue-stock-quote failed", message: (e as Error).message }, { status: 502 });
  }
}
