// x402/base-stock-movers — the 24h gainers and losers among Coinbase Tokenized
// Stocks on Base 8453 (every one Base publishes), ranked by the deepest pool's
// 24h change. Dust pools cannot rank: a pool needs min_liquidity_usd (default
// $10k) or its "move" is one trade. Tokens whose read was refused are counted,
// not dropped silently.
import { readStockMarkets } from "@/lib/markets";
import { readBody } from "@/lib/base-stocks/handler-common";

export default async function handler(req: Request): Promise<Response> {
  const body = await readBody(req);
  const limit = Math.max(1, Math.min(20, Number(body.limit ?? 5) || 5));
  const minLiq = Math.max(0, Number(body.min_liquidity_usd ?? 10_000) || 0);
  const { rows, readAt } = await readStockMarkets();
  const base = rows.filter((r) => r.chain === "base");
  const unread = base.filter((r) => !r.read).length;
  if (base.length && unread === base.length) throw new Error("Market data could not be read right now (GeckoTerminal); nothing was charged.");
  const ranked = base.filter((r) => r.read && r.change24hPct !== null && (r.liquidityUsd ?? 0) >= minLiq);
  const view = (r: (typeof base)[number]) => ({
    ticker: r.ticker, symbol: `${r.ticker}c`, name: r.name, token: r.contract, change_24h_pct: r.change24hPct,
    price_usd: r.priceUsd, liquidity_usd: r.liquidityUsd, volume_24h_usd: r.volume24hUsd,
  });
  const sorted = [...ranked].sort((a, b2) => (b2.change24hPct ?? 0) - (a.change24hPct ?? 0));
  return Response.json({
    chain: "base", chain_id: 8453,
    gainers: sorted.slice(0, limit).map(view),
    losers: sorted.slice(-limit).reverse().map(view),
    universe: { listed: base.length, ranked: ranked.length, below_liquidity_floor: base.filter((r) => r.read && (r.liquidityUsd ?? 0) < minLiq).length, unread },
    min_liquidity_usd: minLiq,
    source: "GeckoTerminal, deepest pool per token", read_at: readAt,
    note: "Facts, not a buy or sell signal. Not financial advice.",
  });
}
