/**
 * Small, pure readers of a trade request's arguments, shared by the chat
 * route's swap and inspect tools (2026-10-01). They live here rather than in
 * `api/chat/route.ts` because a route file may only export route handlers, and
 * these need a test (scripts/chat-trade-intent-test.ts).
 */
import { QUANTITY_WORD_RE } from "@/lib/wallet/amount";
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
 * The user's own dollar amount, when the model dropped the "$" (2026-10-16).
 *
 * MEASURED on production: "swap $1 eth to usdc" reached prepare_swap once as
 * amountIn "0.001" and once as "1" — a $1 request armed 1 ETH (~$2,440). The
 * model is not trusted with that conversion: if the user's message carries
 * exactly ONE dollar figure and the model's amount is that same number, empty,
 * or a number the user never typed (its own conversion), the dollar figure is
 * restored ("$1") and the server converts it at the live price. A number or
 * quantity word the user did type is left alone.
 */
export function userDollarAmount(userText: string, modelAmount: unknown): string | null {
  const hits = [...userText.matchAll(/\$\s*([0-9]+(?:\.[0-9]+)?)(?![0-9.])|\b([0-9]+(?:\.[0-9]+)?)\s*(?:usd|dollars?|bucks)\b/gi)];
  if (hits.length !== 1) return null;
  const n = hits[0][1] ?? hits[0][2];
  const a = modelAmount == null ? "" : String(modelAmount).trim();
  if (a === "" || dollarAmount(a) === n || (Number.isFinite(Number(a)) && Number(a) === Number(n))) return n;
  // A quantity word the user typed ("all", "half") or a number they typed
  // themselves ("swap 0.001 eth, about $2") is theirs — kept. A number that
  // appears nowhere in their message is the model's own conversion — replaced.
  if (QUANTITY_WORD_RE.test(a)) return null;
  const typed = new Set((userText.match(/[0-9]+(?:\.[0-9]+)?/g) ?? []).map(Number));
  return Number.isFinite(Number(a)) && typed.has(Number(a)) ? null : n;
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
