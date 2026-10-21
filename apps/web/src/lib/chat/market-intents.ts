/**
 * Market questions are routed to their tool IN CODE, with their arguments,
 * before the model is asked anything (ShunTr's 24-prompt test, 2026-10-21).
 *
 * MEASURED in that test (share 9c52e1d1): after ~8 turns the Fast model
 * stopped calling tools and answered from the conversation and from memory —
 * DEGEN "deployed 3 days ago, 1 holder" (it is a 35.9B-supply token), a "stock
 * tokens" table of memecoins, TSLA at $428 while its oracle read $379, "Sunday
 * night" on a Wednesday, and "tax clean" stamped on five tokens of which one
 * was measured. Prompts do not stop that; a data source does. So:
 *
 *   • a question that names its data gets that tool, every time, whatever
 *     the history holds (marketCallsFor);
 *   • a data question that matches nothing is NOT answered from memory
 *     (looksLikeMarketData → the route replies that it has no live source).
 *
 * Two answers come from code with no tool at all: whether the US market is
 * open (marketHoursText) and a stock token's price on its desk (stock_quote,
 * answered by the route from the desk snapshot).
 */
import { BASE_STOCKS } from "@/lib/base-stocks/registry";
import { RWA_TOKENS } from "@/lib/robinhood/rwa-registry";

export interface MarketCall { name: string; args: Record<string, unknown> }

const STOCK_TICKERS = new Set<string>([
  ...BASE_STOCKS.map((s) => s.ticker.toUpperCase()),
  ...RWA_TOKENS.filter((t) => t.kind === "stock" || t.kind === "etf").map((t) => t.ticker.toUpperCase()),
]);

/** Words that are also tickers and must not be read as one unless written in capitals. */
const WORDISH = new Set(["A", "ALL", "ARE", "IT", "ON", "BE", "SO", "NOW", "CAN", "GO", "FOR", "AN", "ONE", "NEW", "OPEN",
  "LOW", "HIGH", "TWO", "CAT", "COIN", "BIG", "WELL", "LOVE", "FUN", "CASH", "KEY", "SAFE", "PLAY", "REAL", "TRUE", "AI", "BUY", "SELL", "TOP"]);

function chainFrom(t: string): "base" | "robinhood" | null {
  const base = /\bbase\b|\b8453\b|coinbase/.test(t);
  const rh = /\brobinhood\b|\brh\b|\b4663\b/.test(t);
  return base && !rh ? "base" : rh && !base ? "robinhood" : null;
}

/** A stock ticker the user named: in capitals anywhere, or lower-case right
 *  next to a price word or a chain name. */
export function stockTickerIn(raw: string): string | null {
  for (const m of raw.matchAll(/\b([A-Za-z]{2,6})\b/g)) {
    const w = m[1], up = w.toUpperCase();
    if (!STOCK_TICKERS.has(up)) continue;
    if (w === up && !WORDISH.has(up)) return up;
    const around = raw.slice(Math.max(0, m.index! - 12), m.index! + w.length + 22).toLowerCase();
    if (!WORDISH.has(up) && /price|giá|quote|on base|on robinhood|on rh|stock/.test(around)) return up;
  }
  return null;
}

/** Symbols in "price of X and Y" / "X price" / "giá X". At most three. */
function priceSymbols(t: string): string[] {
  const out: string[] = [];
  const of = t.match(/\bprice(?:s)? (?:of|for) ([$a-z0-9 ,&]+?)(?:\?|$| on | right now| today)/);
  if (of) out.push(...of[1].split(/\s*(?:,|&|\band\b|\bvà\b)\s*/));
  const before = t.match(/\b\$?([a-z][a-z0-9]{1,11}) price\b/);
  if (before && !["the", "what", "token", "a", "current", "stock"].includes(before[1])) out.push(before[1]);
  const vi = t.match(/\bgiá (?:của )?\$?([a-z][a-z0-9]{1,11})\b/);
  if (vi && !["bao", "token", "cổ"].includes(vi[1])) out.push(vi[1]);
  const how = t.match(/\bhow much is \$?([a-z][a-z0-9]{1,11})\b/);
  if (how) out.push(how[1]);
  return [...new Set(out.map((s) => s.replace(/^\$/, "").trim()).filter((s) => /^[a-z][a-z0-9]{1,11}$/.test(s)))].slice(0, 3);
}

const ADDR = /0x[a-f0-9]{40}\b/;

/**
 * The tool calls a market question obviously needs, or null. Pure; the route
 * runs these instead of asking the model which tool to call.
 */
export function marketCallsFor(messages: readonly { role: string; content: unknown }[]): MarketCall[] | null {
  const last = messages[messages.length - 1];
  if (last?.role !== "user" || typeof last.content !== "string") return null;
  const raw = last.content.trim();
  const t = raw.toLowerCase();
  if (t.length > 200) return null;
  // Actions and alerts have their own tools; explanations are the model's.
  if (/^(please\s+)?(buy|sell|swap|send|bridge|convert|trade|transfer|pay|revoke)\b/.test(t)) return null;
  if (/\b(alert me|notify me|tell me when|ping me|báo tôi)\b/.test(t)) return null;
  // "…and buy $1 there": a trade inside the question belongs to the trade tools.
  if (/\b(buy|sell|swap|mua|bán)\b.*(\$\s?\d|\d+(\.\d+)?\s?(usdc|usd|eth|đô))/.test(t)) return null;
  // The weekend gap is explained from what the desk actually does, in code
  // (2026-10-21: the model's own explanation invented a weekly NAV schedule).
  if (/\bweekend gap\b|\bgap\b.*\bweekend\b|\bweekend\b.*\bgap\b/.test(t) && /^(why|how|what|explain)/.test(t)) return [{ name: "weekend_gap", args: {} }];
  if (/^(why|how does|how do|explain|what does|what is a |what's a )/.test(t)) return null;

  if (/\b(us |stock |nyse |nasdaq )?market (is )?(open|closed)\b|\bis the (us |stock )?market open\b|\bmarket hours\b|thị trường (mỹ|chứng khoán) (mở|đóng)/.test(t)) {
    return [{ name: "market_hours", args: {} }];
  }

  const addr = t.match(ADDR)?.[0];
  if (addr && /\b(buy|sell)(ing)? pressure\b|\bdex flow\b|\bbuyers?\b.*\bsellers?\b/.test(t)) return [{ name: "hub_dex_flow", args: { token: addr } }];
  if (addr && /^\s*((what|who) is|what's|tell me about|info on|overview of|look up)?\s*0x[a-f0-9]{40}\s*\??\s*$/.test(t)) {
    return [{ name: "check_token", args: { address: addr } }];
  }
  if (addr) return null; // anything else about an address: safety, explain — other routes

  if (/\b(buy|sell)(ing)? pressure\b|\bdex flow\b/.test(t)) {
    const sym = t.match(/\b(?:on|for|of|in) \$?([a-z][a-z0-9]{1,11})\b/)?.[1];
    return sym ? [{ name: "hub_dex_flow", args: { token: sym } }] : null;
  }

  const calls: MarketCall[] = [];
  const add = (c: MarketCall) => { if (!calls.some((x) => x.name === c.name && JSON.stringify(x.args) === JSON.stringify(c.args))) calls.push(c); };

  if (/\btrending\b/.test(t)) add({ name: "hub_safe_trending", args: {} });
  if (/\b(top|best) (base )?tokens?\b.*\b(quality|score)\b|\bquality score\b/.test(t)) add({ name: "hub_token_pick", args: {} });

  const stockish = /\bstocks?\b|\betfs?\b|\bshares?\b|cổ phiếu/.test(t);
  if (/\bnew (stock|etf)s?( tokens?)?\b|\bnew listings?\b|\bnewly listed\b|\bmã mới\b/.test(t)) add({ name: "hub_rh_new_listings", args: {} });
  else if (/\b(movers?|gainers?|losers?)\b/.test(t) && (stockish || /\brobinhood\b|\brh\b/.test(t))) add({ name: "hub_rh_movers", args: {} });
  else if (/\bhow many (stock|etf)|\b(all|list of|every) (the )?(stock|etf) tokens\b/.test(t)) add({ name: "hub_rh_index", args: {} });
  else {
    const find = raw.match(/\b(?:find|search(?: for)?|look ?up)\s+(.{2,40}?)\s+(?:on|in)\s+(?:robinhood|rh)\b/i);
    if (find) add({ name: "hub_rh_search", args: { query: find[1].replace(/\b(the|stock|token)\b/gi, "").trim() } });
  }

  // A ticker alone is not a price question ("ell my NVDA" must not get a
  // quote): it needs a price word, a chain, or to be the whole message.
  const ticker = stockTickerIn(raw);
  const asksQuote = !!ticker && (/\bprices?\b|\bgiá\b|\bquote\b|\btrading at\b|\bon (base|robinhood|rh)\b/.test(t) || t.replace(/[?!.\s]/g, "") === ticker.toLowerCase());
  if (ticker && asksQuote && !calls.length && !/\b(cheaper|above|below|gap|premium|discount)\b/.test(t)) {
    add({ name: "stock_quote", args: { ticker, chain: chainFrom(t) } });
  } else if (!calls.some((c) => c.name.startsWith("hub_rh_")) &&
    /\bstock tokens?\b|\bstocks? (on|today|now)\b|\bonchain stocks?\b|\bpriced (above|below)\b|\b(above|below) the (real )?stock\b|\bcheaper on\b|\b(stock )?(gap|premium|discount)s?\b.*\bstock|cổ phiếu onchain/.test(t)) {
    add({ name: "stock_brief", args: chainFrom(t) ? { chain: chainFrom(t) } : {} });
  }

  if (!stockish && /\b(launch(ed|es)?|graduat\w*|newly deployed|new tokens?|just deployed|token mới)\b/.test(t)) {
    add({ name: "new_tokens", args: { chain: chainFrom(t) ?? "base" } });
  }

  if (/\bprices?\b|\bgiá\b|\bworth\b|\bbao nhiêu\b|\bhow much is\b/.test(t) && !calls.some((c) => c.name === "stock_quote")) {
    for (const s of priceSymbols(t)) {
      if (STOCK_TICKERS.has(s.toUpperCase()) && !WORDISH.has(s.toUpperCase())) add({ name: "stock_quote", args: { ticker: s.toUpperCase(), chain: chainFrom(t) } });
      else add({ name: "hub_token_price", args: { symbol: s } });
    }
  }

  return calls.length ? calls.slice(0, 3) : null;
}

/**
 * A request for live market data that no route matched. Answering it from the
 * model's memory is what produced the test's invented prices, so the route
 * says it has no live source instead.
 */
export function looksLikeMarketData(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (/^(why|how does|how do|explain|what does|what is a |what's a |should i|can you|what can)/.test(t)) return false;
  return /\b(price|prices|trending|movers?|gainers?|losers?|launched|launches|listings?|market cap|24h volume|liquidity|how many tokens|top \d+ tokens?)\b|\bgiá\b/.test(t);
}

export const NO_LIVE_SOURCE =
  "I couldn't match that to a live data source, so I won't answer it from memory. Try one of these: \"price of ETH\", \"stock tokens today\", \"what's trending on Base?\", \"what launched on Base in the last hour?\", \"top movers on Robinhood Chain\".";

/** Pure: is the US stock market open, from the clock in New York (DST-aware). */
export function marketHoursText(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "long", hour: "numeric", minute: "2-digit", hour12: true,
  }).formatToParts(now);
  const get = (k: string) => parts.find((p) => p.type === k)?.value ?? "";
  const h24 = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(now));
  const min = Number(get("minute"));
  const day = get("weekday");
  const m = h24 * 60 + min;
  const clock = `${get("hour")}:${get("minute")} ${get("dayPeriod")} ${day} in New York`;
  const weekend = day === "Saturday" || day === "Sunday";
  const tail = "Stock-token oracles hold the last close while it is closed; DEX prices on Base and Robinhood Chain trade around the clock. US market holidays are not counted here.";
  if (weekend) return `No, the US stock market is closed for the weekend (it is ${clock}). It opens Monday at 9:30 AM ET. ${tail}`;
  if (m < 4 * 60) return `No, the US stock market is closed (it is ${clock}). Pre-market starts at 4:00 AM ET and the regular session at 9:30 AM ET. ${tail}`;
  if (m < 9 * 60 + 30) return `Not yet: it is pre-market (${clock}). The regular session opens at 9:30 AM ET. ${tail}`;
  if (m < 16 * 60) return `Yes, the US stock market is open (it is ${clock}). The regular session closes at 4:00 PM ET.`;
  if (m < 20 * 60) return `No, the regular session has closed; it is after-hours (${clock}). It opens again at 9:30 AM ET on the next trading day. ${tail}`;
  return `No, the US stock market is closed (it is ${clock}). It opens again at 9:30 AM ET on the next trading day. ${tail}`;
}

/** Why a stock token's gap behaves differently on weekends — what the desk does. */
export const WEEKEND_GAP_TEXT =
  "On weekends the US stock market is closed, so each stock token's Chainlink oracle holds Friday's closing price. The token itself keeps trading in DEX pools on Base and Robinhood Chain, so weekend news moves the pool price but not the oracle, and the gap can grow.\n\nWhen the market opens on Monday the oracle updates to the new stock price. The gap then closes from either side: the oracle catches up with the pool, or the pool comes back to the oracle. Ask \"stock tokens today\" to see the current gaps.";
