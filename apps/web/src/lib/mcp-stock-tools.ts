/**
 * stock_quote / stock_movers — the two tokenized-stock reads on the MCP menu
 * (ShunTr, 2026-11-04, "cách A"). Both wrap catalog handlers that already run
 * live (base-stock-quote, rh-stock-quote, base-stock-movers, rh-stock-movers);
 * this module only decides WHICH chain answers, in code, before any price.
 *
 * Why these two earn a preloaded slot (the keep rule in lib/mcp-tools.ts): an
 * agent connected through Coinbase for Agents is told to "pull market data on
 * my holdings". A ticker alone never identifies a stock token (NVDA is NVDAc on
 * Base 8453 AND a different contract on Robinhood Chain 4663), so an agent that
 * has to discover the right tool per chain quotes one venue and misses the
 * other. OHLC and liquidity are asked for by name and stay behind blue_call.
 */
import { resolveBaseStock } from "@/lib/base-stocks/handler-common";
import { findByTicker, findChainlinkOnly } from "@/lib/robinhood/rwa-registry";

export type StockChain = "base" | "robinhood";
export type StockChainArg = StockChain | "both";

export function parseStockChain(v: unknown, dflt: StockChainArg = "both"): StockChainArg | null {
  if (v === undefined || v === null || v === "") return dflt;
  const s = String(v).trim().toLowerCase();
  if (s === "base" || s === "8453") return "base";
  if (s === "robinhood" || s === "rh" || s === "4663") return "robinhood";
  if (s === "both") return "both";
  return null;
}

/** Which chains list this ticker (or Base token address), from the registries. */
export function stockListings(ticker: string): { base: boolean; robinhood: boolean; rhTicker: string; suggestions: string[] } {
  const q = ticker.trim();
  const b = resolveBaseStock(q);
  const isAddr = /^0x[0-9a-fA-F]{40}$/.test(q);
  const rhKey = q.replace(/c$/i, "") === q ? q : q.slice(0, -1); // "NVDAc" → "NVDA" for RH
  const direct = !isAddr && !!(findByTicker(q) ?? findChainlinkOnly(q));
  const stripped = !isAddr && !direct && !!(findByTicker(rhKey) ?? findChainlinkOnly(rhKey));
  return { base: "stock" in b, robinhood: direct || stripped, rhTicker: stripped ? rhKey : q, suggestions: "suggestions" in b ? b.suggestions : [] };
}

/**
 * The chains stock_quote will read, or a refusal (said BEFORE any price, so a
 * ticker no venue lists is never charged).
 */
export function planStockQuote(args: Record<string, unknown>): { chains: StockChain[]; ticker: string; rhTicker: string } | { refuse: string } {
  const ticker = String(args.ticker ?? args.token ?? "").trim();
  if (!ticker) return { refuse: "ticker is required, e.g. \"NVDA\" (or a Base token address 0x…)." };
  const chain = parseStockChain(args.chain);
  if (!chain) return { refuse: "chain must be \"base\" (8453), \"robinhood\" (4663) or \"both\"." };
  const l = stockListings(ticker);
  const want: StockChain[] = chain === "both" ? ["base", "robinhood"] : [chain];
  const chains = want.filter((c) => l[c]);
  if (!chains.length) {
    const where = chain === "both" ? "on Base 8453 or Robinhood Chain 4663" : chain === "base" ? "on Base 8453" : "on Robinhood Chain 4663";
    const hint = l.suggestions.length ? ` Close matches on Base: ${l.suggestions.join(", ")}.` : "";
    return { refuse: `No tokenized stock ${ticker} is listed ${where}.${hint}` };
  }
  return { chains, ticker, rhTicker: l.rhTicker };
}

export const STOCK_QUOTE_TOOL: Record<StockChain, string> = { base: "base-stock-quote", robinhood: "rh-stock-quote" };
export const STOCK_MOVERS_TOOL: Record<StockChain, string> = { base: "base-stock-movers", robinhood: "rh-stock-movers" };

export function planStockMovers(args: Record<string, unknown>): { chains: StockChain[]; limit: number } | { refuse: string } {
  const chain = parseStockChain(args.chain);
  if (!chain) return { refuse: "chain must be \"base\" (8453), \"robinhood\" (4663) or \"both\"." };
  const raw = args.limit === undefined || args.limit === null || args.limit === "" ? 5 : Number(args.limit);
  if (!Number.isInteger(raw) || raw < 1 || raw > 20) return { refuse: "limit must be a whole number from 1 to 20." };
  return { chains: chain === "both" ? ["base", "robinhood"] : [chain], limit: raw };
}
