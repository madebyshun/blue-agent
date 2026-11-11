// x402/base-stock-quote — live quote for one Coinbase Tokenized Stock on Base
// 8453: the deepest DEX pool's price, 24h change, liquidity and volume
// (GeckoTerminal, from the pool's swaps), plus — where Blue Hood holds the
// stock's Chainlink feed — the oracle share price (multiplier-adjusted) and the
// DEX-vs-oracle drift. A missing read is null and said, never filled in.
import { BASE_STOCKS } from "@/lib/base-stocks/registry";
import { readBaseStockQuote } from "@/lib/base-stocks/b20-quote";
import { readTokenMarket } from "@/lib/markets";
import { quoteBuyImpact } from "@/lib/aerodrome-swap";
import { readBody, resolveBaseStock, stockRef } from "@/lib/base-stocks/handler-common";
import { readIssuance } from "@/lib/base-stocks/issuance";
import { actionsFor } from "@/lib/base-stocks/corporate-actions";

export default async function handler(req: Request): Promise<Response> {
  const body = await readBody(req);
  const r = resolveBaseStock(String(body.ticker ?? body.token ?? new URL(req.url).searchParams.get("ticker") ?? ""));
  if ("error" in r) return Response.json(r, { status: 400 });
  const s = r.stock;
  const hood = BASE_STOCKS.find((x) => x.token.toLowerCase() === s.token.toLowerCase());
  // Listed is not issued: most tokens on base.org's list have no supply and no
  // pool yet. Say that, instead of asking a market API about a token that
  // cannot have a price (and failing the call on its silence).
  const [issuance, corp] = await Promise.all([
    readIssuance(s),
    actionsFor(s.token).catch(() => null),
  ]);
  // Dividends and splits, announced before they apply. Coinbase's own record per
  // action; an announced one has no multiplier yet.
  const corporate_actions = corp
    ? { ...corp, source: "announcement events on the token (Base 8453) + Coinbase's record for each action" }
    : { status: "could not be read right now" };
  if (issuance.minted === false) {
    return Response.json({
      ...stockRef(s), issuance, corporate_actions, status: "listed, not issued",
      dex: { status: "not issued yet: Coinbase has minted no supply, so there is no pool or price" },
      note: "Listed by Coinbase on base.org, with zero supply on Base 8453 at this read. A stock token tracks a share; it is not the share. Not financial advice.",
      timestamp: new Date().toISOString(),
    });
  }
  const [mk, oracle, impact] = await Promise.all([
    readTokenMarket("base", s.token),
    hood ? readBaseStockQuote(hood).catch(() => null) : Promise.resolve(null),
    quoteBuyImpact(s.token, 8).catch(() => null),
  ]);
  if (mk.status === "unread" && !oracle) {
    throw new Error("Market data could not be read right now (GeckoTerminal); nothing was charged.");
  }
  return Response.json({
    ...stockRef(s),
    issuance,
    corporate_actions,
    dex: mk.pool ? {
      price_usd: mk.pool.priceUsd, change_24h_pct: mk.pool.change24hPct, liquidity_usd: mk.pool.liquidityUsd,
      volume_24h_usd: mk.pool.volume24hUsd, pool: mk.pool.address, pool_name: mk.pool.name, dex: mk.pool.dex,
      source: "GeckoTerminal, deepest pool by liquidity",
    } : { status: mk.status === "none_listed" ? "no DEX pool listed" : "unread" },
    oracle: oracle ? {
      share_price_usd: oracle.share_price_usd, feed_age_seconds: oracle.feed_age_seconds, feed_is_stale: oracle.feed_is_stale,
      multiplier: oracle.multiplier, drift_pct: oracle.drift_pct, source: "Chainlink on Base, divided by the token's multiplier()",
    } : { status: "no Chainlink feed held for this stock; DEX price only" },
    // Liquidity TVL alone misleads on these pools; this is what a buy would move the price.
    buy_impact: impact ? {
      ...impact,
      source: "Aerodrome Quoter on Base, deepest USDC pool only; a router splitting across pools may do better",
    } : { status: "no Aerodrome USDC pool could be quoted" },
    note: "A stock token tracks a share; it is not the share. Not financial advice.",
    timestamp: new Date().toISOString(),
  });
}
