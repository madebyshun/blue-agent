/**
 * Small, pure readers of a trade request's arguments, shared by the chat
 * route's swap and inspect tools (2026-10-01). They live here rather than in
 * `api/chat/route.ts` because a route file may only export route handlers, and
 * these need a test (scripts/chat-trade-intent-test.ts).
 */
import { findBaseStock, type BaseStock } from "@/lib/base-stocks/registry";

/**
 * A DOLLAR amount ("$5", "5 USD", "5 dollars") — the "buy $5 of TSLA" shape.
 * Returns the bare number, or null when the amount is not dollar-denominated.
 * The dollar leg is the chain's own stable (USDC on Base, USDG on Robinhood
 * Chain), so this never converts anything: $5 means 5 of that stable.
 */
export function dollarAmount(raw: string): string | null {
  const m = raw.trim().match(/^\$\s*([0-9]+(?:\.[0-9]+)?)$|^([0-9]+(?:\.[0-9]+)?)\s*(?:usd|dollars?|bucks)$/i);
  return m ? (m[1] ?? m[2]) : null;
}

/**
 * A Base stock by its exact ticker ("NVDA") or its token symbol ("NVDAc"),
 * from the verified Base stock registry ONLY — each row there is cross-checked
 * against base.org/stocks and asserted on-chain. Never a name search: the #280
 * impostor got in by matching a name.
 */
export function baseStockByTickerOrSymbol(raw: string): BaseStock | undefined {
  const sym = raw.trim().replace(/^\$/, "");
  if (!sym) return undefined;
  const direct = findBaseStock(sym);
  if (direct) return direct;
  // The token symbol is the ticker plus a LOWERCASE "c" — "NVDAc", not "NVDAC".
  if (sym.length > 1 && sym.endsWith("c")) {
    const hit = findBaseStock(sym.slice(0, -1));
    if (hit && hit.symbol === sym) return hit;
  }
  return undefined;
}
