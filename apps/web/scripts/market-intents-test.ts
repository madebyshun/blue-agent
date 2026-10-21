/**
 * market-intents-test — ShunTr's 24 market prompts of 2026-10-21 (share
 * 9c52e1d1), replayed in order. In that test the Fast model stopped calling
 * tools after ~8 turns and invented prices, a memecoin "stock" table and the
 * wrong weekday. Every one of these must now reach its tool from code.
 */
import { stockQuoteText, type StockBriefData } from "../src/lib/brief/stocks";
import { forcedToolFor } from "../src/lib/chat/intents";
import { cardReply } from "../src/lib/chat/card-replies";
import { looksLikeMarketData, marketCallsFor, marketHoursText, stockTickerIn } from "../src/lib/chat/market-intents";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`); if (!cond) failures++; }
const route = (text: string) => marketCallsFor([{ role: "user", content: text }]);
const names = (text: string) => (route(text) ?? []).map((c) => `${c.name}${Object.keys(c.args).length ? JSON.stringify(c.args) : ""}`).join(" + ") || "none";

const CASES: [string, string][] = [
  ["price of ETH", 'hub_token_price{"symbol":"eth"}'],
  ["price of AERO and VIRTUAL", 'hub_token_price{"symbol":"aero"} + hub_token_price{"symbol":"virtual"}'],
  ["NVDA price on Robinhood Chain", 'stock_quote{"ticker":"NVDA","chain":"robinhood"}'],
  ["NVDA on Base", 'stock_quote{"ticker":"NVDA","chain":"base"}'],
  ["is AAPL on Robinhood Chain trading above the real stock?", 'stock_brief{"chain":"robinhood"}'],
  ["giá ETH bao nhiêu?", 'hub_token_price{"symbol":"eth"}'],
  ["what's trending on Base?", "hub_safe_trending"],
  ["trending tokens on Base with no sell tax", "hub_safe_trending"],
  ["top token on Base by on-chain quality", "hub_token_pick"],
  ["is there buy pressure on DEGEN?", 'hub_dex_flow{"token":"degen"}'],
  ["what launched on Base in the last hour?", 'new_tokens{"chain":"base"}'],
  ["which launches graduated today on Base?", 'new_tokens{"chain":"base"}'],
  ["what is 0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed", 'check_token{"address":"0x4ed4e862860bed51a9570b96d89af5e1b0efefed"}'],
  ["stock tokens today", "stock_brief"],
  ["which stock tokens are priced below the stock right now?", "stock_brief"],
  ["top movers on Robinhood Chain", "hub_rh_movers"],
  ["new stock tokens on Robinhood Chain", "hub_rh_new_listings"],
  ["find Palantir on Robinhood Chain", 'hub_rh_search{"query":"Palantir"}'],
  ["how many stock tokens are on Robinhood Chain?", "hub_rh_index"],
  ["is the US market open?", "market_hours"],
  ["why is the weekend gap different?", "weekend_gap"],
  ["compare ETH price and what's trending on Base", 'hub_safe_trending + hub_token_price{"symbol":"eth"}'],
  ["META is cheaper on which chain, and buy $1 there", "none"],
  ["alert me when TSLA on Robinhood Chain drops 5% in 24 hours", "none"],
];
for (const [q, want] of CASES) ok(`"${q}" → ${want}`, names(q) === want, names(q));

// Not market questions: never routed, never refused.
for (const q of ["what can you do?", "ell my NVDA", "I like NVDA", "swap $1 eth to usdc", "is 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 safe?", "explain tx 0x" + "a".repeat(64)]) {
  ok(`"${q.slice(0, 40)}" is not routed here`, route(q) === null, names(q));
}
ok("an explanation is not a data request", !looksLikeMarketData("why is the weekend gap different?"));
ok("an unmatched price question is a data request", looksLikeMarketData("what was the price of the top gainer last week"));
ok("tickers: a word is not a ticker", stockTickerIn("can you open the app") === null);
ok("tickers: NVDA in capitals is", stockTickerIn("NVDA on Base") === "NVDA");
ok("a bare ticker is a quote", names("NVDA?") === 'stock_quote{"ticker":"NVDA","chain":null}', names("NVDA?"));

// The clock, not a guess (the test answered "Sunday night" on a Wednesday).
const wed = marketHoursText(new Date("2026-10-21T06:32:00Z"));
ok("Wed 02:32 ET: closed, says Wednesday", /closed/.test(wed) && /Wednesday/.test(wed), wed);
ok("Wed 10:00 ET: open", /^Yes, the US stock market is open/.test(marketHoursText(new Date("2026-10-21T14:00:00Z"))));
ok("Wed 08:00 ET: pre-market", /pre-market/.test(marketHoursText(new Date("2026-10-21T12:00:00Z"))));
ok("Sat: weekend", /weekend/.test(marketHoursText(new Date("2026-10-24T15:00:00Z"))));
ok("after DST ends (Mon 2 Nov, 14:45 UTC = 9:45 EST): open", /^Yes/.test(marketHoursText(new Date("2026-11-02T14:45:00Z"))));

// Second test round, 2026-10-21 (share dec1dcf9).
const forced = (q: string) => forcedToolFor([{ role: "user", content: q }]);
ok("\"why is the weekend gap different?\" is not forced to the report", forced("why is the weekend gap different?") === null, String(forced("why is the weekend gap different?")));
ok("\"weekend gap\" alone still gets the report", forced("weekend gap") === "stock_brief");
ok("an alert request reaches set_price_alert", forced("alert me when ETH on Base goes above $2,500") === "set_price_alert");
ok("an automation reaches set_price_alert", forced("every day at 9:00, if ETH on Base is below $2,000, buy $1") === "set_price_alert");
ok("\"what changed in my wallet?\" is still the wallet brief", forced("what changed in my wallet?") === "wallet_brief");
const pass = cardReply("hub_pretrade", { verdict: "PASS", label: "USD Coin (USDC)", chain: "base", reasons: [{ level: "INFO", code: "TAX_CLEAN", text: "Sell tax measured at 0%." }] }) ?? "";
ok("a clean check is said plainly, no code word, no invented praise", pass === "Nothing found against USD Coin (USDC) on Base. Sell tax measured at 0%. That is what could be checked, not a guarantee.", pass);
ok("a block says don't trade it", (cardReply("hub_pretrade", { verdict: "BLOCK", label: "x", chain: "base", reasons: [{ level: "BLOCK", text: "This is a copy of USDC, not the real one." }] }) ?? "").startsWith("Don't trade it. This is a copy of USDC"));

// A stock quote is the desk's own reading.
const row = (chain: "base" | "robinhood", ticker: string, dex: number, oracle: number, drift: number, nav: number | null = null) =>
  ({ chain, ticker, name: ticker, contract: "0x0", held: null, oracle, dex, drift, nav, premium: null, onDesk: true, withheld: false });
const d = { session: "premarket", desk: { base: "ok", robinhood: "ok" }, catalogRead: true, held: [], movers: { base: [], robinhood: [] }, report: { desks: {}, cheaper: [] },
  rows: { base: [row("base", "NVDA", 220.58, 220.96, -0.17, 221.08)], robinhood: [row("robinhood", "NVDA", 221.4, 220.54, 0.39)] } } as unknown as StockBriefData;
const qb = stockQuoteText(d, "NVDA", "base") ?? "";
ok("NVDA on Base: DEX, oracle, gap, NAV", qb.startsWith("NVDA on Base: DEX $220.58 · Chainlink oracle $220.96 · gap −0.17% · Coinbase NAV $221.08."), qb);
ok("no chain named: both desks", (stockQuoteText(d, "NVDA", null) ?? "").includes("NVDA on Robinhood Chain: DEX $221.40"));
ok("a ticker on no desk: null", stockQuoteText(d, "ZZZZ", null) === null);
ok("a ticker missing from the named desk says so", /not on the Base stock desk/.test(stockQuoteText(d, "TSLA", "base") ?? ""));

console.log(failures === 0 ? "\nmarket-intents-test: PASS" : `\nmarket-intents-test: FAIL — ${failures}`);
process.exit(failures === 0 ? 0 : 1);
