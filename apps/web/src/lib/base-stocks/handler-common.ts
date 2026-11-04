// Shared by the base-stock-* x402 tools (api/x402/_handlers/base-stock-*): resolve a ticker or contract to ONE
// Coinbase Tokenized Stock on Base 8453 from lib/base-stocks/coinbase-list (the
// every one Base publishes, each asserted on chain). Never by fuzzy name: a ticker
// either matches a listed symbol exactly, or the caller is told the near misses.
import { COINBASE_BASE_STOCKS, type CoinbaseBaseStock } from "@/lib/base-stocks/coinbase-list";

export const BASE_CHAIN = { chain: "base", chain_id: 8453, explorer: "https://basescan.org" } as const;

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  try { const t = await req.text(); if (t?.trim().startsWith("{")) return JSON.parse(t); } catch { /* empty */ }
  return {};
}

export function resolveBaseStock(input: string): { stock: CoinbaseBaseStock } | { error: string; suggestions: string[] } {
  const q = input.trim();
  if (!q) return { error: "Provide `ticker` (e.g. NVDA, TSLA) or a Base token address.", suggestions: [] };
  if (/^0x[0-9a-fA-F]{40}$/.test(q)) {
    const s = COINBASE_BASE_STOCKS.find((x) => x.token.toLowerCase() === q.toLowerCase());
    return s ? { stock: s } : { error: `${q} is not a Coinbase Tokenized Stock on Base (checked against base.org's list).`, suggestions: [] };
  }
  // "NVDA" or the on-chain symbol "NVDAc", exactly; nothing fuzzier.
  const t = q.toUpperCase();
  const s = COINBASE_BASE_STOCKS.find((x) => x.ticker === t || x.symbol.toUpperCase() === t);
  if (s) return { stock: s };
  const near = COINBASE_BASE_STOCKS.filter((x) => x.ticker.startsWith(t.slice(0, 2)) || x.name.toUpperCase().includes(q.toUpperCase())).slice(0, 5).map((x) => x.ticker);
  return { error: `No Coinbase Tokenized Stock on Base with ticker ${q}.`, suggestions: near };
}

export function stockRef(s: CoinbaseBaseStock) {
  return { ticker: s.ticker, symbol: s.symbol, name: s.name, token: s.token, ...BASE_CHAIN, token_url: `https://basescan.org/token/${s.token}` };
}
