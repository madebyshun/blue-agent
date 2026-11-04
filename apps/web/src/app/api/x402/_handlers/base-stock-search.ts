// x402/base-stock-search — find Coinbase Tokenized Stocks on Base 8453 by ticker
// or company name, from every one Base publishes (lib/base-stocks/coinbase-list),
// each asserted on chain. Returns the CONTRACT to use: a ticker alone does not
// identify a token (NVDA is a different contract on Robinhood Chain).
import { COINBASE_BASE_STOCKS, COINBASE_BASE_STOCKS_CHECKED_AT, COINBASE_BASE_STOCKS_SOURCE } from "@/lib/base-stocks/coinbase-list";
import { readBody, stockRef } from "@/lib/base-stocks/handler-common";

export default async function handler(req: Request): Promise<Response> {
  const body = await readBody(req);
  const q = String(body.query ?? body.ticker ?? new URL(req.url).searchParams.get("query") ?? "").trim().toUpperCase();
  if (!q) return Response.json({ error: "Provide `query`: a ticker (NVDA) or part of a company name (nvidia)." }, { status: 400 });
  const limit = Math.max(1, Math.min(25, Number(body.limit ?? 10) || 10));
  const exact = COINBASE_BASE_STOCKS.filter((s) => s.ticker === q || s.symbol.toUpperCase() === q);
  const prefix = COINBASE_BASE_STOCKS.filter((s) => !exact.includes(s) && s.ticker.startsWith(q));
  const named = COINBASE_BASE_STOCKS.filter((s) => !exact.includes(s) && !prefix.includes(s) && s.name.toUpperCase().includes(q));
  const results = [...exact, ...prefix, ...named].slice(0, limit).map(stockRef);
  return Response.json({
    query: q, count: results.length, results,
    universe: { total: COINBASE_BASE_STOCKS.length, source: COINBASE_BASE_STOCKS_SOURCE, checked_on_chain: COINBASE_BASE_STOCKS_CHECKED_AT, checks: "isB20, decimals == 8, symbol == listed ticker" },
    note: "Coinbase Tokenized Stocks are available only in eligible jurisdictions outside the US.",
    timestamp: new Date().toISOString(),
  });
}
