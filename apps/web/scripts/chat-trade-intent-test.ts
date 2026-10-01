/**
 * chat-trade-intent-test — the chat route's pure helpers for trade requests
 * and card-first replies (lib/chat/trade-intent.ts, lib/chat/card-replies.ts).
 *
 *  • a dollar amount is recognised only in dollar shapes, never guessed;
 *  • a Base stock resolves only from the verified registry, by exact ticker or
 *    its exact "<TICKER>c" symbol;
 *  • every card reply copies its numbers from the payload, and an unknown or
 *    failed payload returns null so the model (not code) answers.
 */
import { dollarAmount, baseStockByTickerOrSymbol } from "../src/lib/chat/trade-intent";
import { cardReply, CARD_REPLY_TOOLS } from "../src/lib/chat/card-replies";
import { BASE_STOCKS } from "../src/lib/base-stocks/registry";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

console.log("dollarAmount");
ok("$5 → 5", dollarAmount("$5") === "5");
ok("$ 1.25 → 1.25", dollarAmount("$ 1.25") === "1.25");
ok("10 usd → 10", dollarAmount("10 USD") === "10");
ok("3 dollars → 3", dollarAmount("3 dollars") === "3");
ok("plain 5 is NOT dollars", dollarAmount("5") === null);
ok("0.1 ETH is NOT dollars", dollarAmount("0.1 ETH") === null);
ok("'all' is NOT dollars", dollarAmount("all") === null);
ok("$5k is not parsed (no guessing)", dollarAmount("$5k") === null);

console.log("baseStockByTickerOrSymbol");
const nvda = BASE_STOCKS.find((s) => s.ticker === "NVDA")!;
ok("NVDA → registry token", baseStockByTickerOrSymbol("NVDA")?.token === nvda.token);
ok("nvda (case) → registry token", baseStockByTickerOrSymbol("nvda")?.token === nvda.token);
ok("$NVDA → registry token", baseStockByTickerOrSymbol("$NVDA")?.token === nvda.token);
ok("NVDAc (token symbol) → registry token", baseStockByTickerOrSymbol(nvda.symbol)?.token === nvda.token);
ok("NVDAC (wrong case symbol) does not resolve", baseStockByTickerOrSymbol("NVDAC") === undefined);
ok("a name never resolves", baseStockByTickerOrSymbol("nvidia") === undefined);
ok("an unknown ticker never resolves", baseStockByTickerOrSymbol("DEGEN") === undefined);

console.log("cardReply");
ok("non-card tool → null", cardReply("hub_hood_arrow", { a: 1 }) === null);
ok("error payload → null (model says it failed)", cardReply("hub_rh_quote", { error: "x" }) === null);
ok("unknown shape → null", cardReply("hub_safe_trending", { foo: 1 }) === null);

const trending = cardReply("hub_safe_trending", {
  tokens: [
    { status: "ok", symbol: "A", flags: [] },
    { status: "ok", symbol: "B", flags: ["MICRO_CAP"], honeypot: { verdict: "HONEYPOT" } },
    { status: "skipped", symbol: "C" },
  ],
});
ok("trending counts only status:ok rows", !!trending && trending.startsWith("2 trending tokens on Base"), trending ?? "");
ok("trending names the honeypot count", !!trending && trending.includes("1 measured as a honeypot"));
ok("trending says a scan is not a buy signal", !!trending && /not a buy signal/.test(trending));
ok("empty trending is stated, not invented", cardReply("hub_safe_trending", { tokens: [] }) === "No trending Base token passed the liquidity floor right now.");

const movers = cardReply("hub_rh_movers", {
  gainers: [{ ticker: "MSTR", change_24h_pct: 4.2 }],
  losers: [{ ticker: "BABA", change_24h_pct: -3.15 }],
});
ok("movers quotes top and bottom from the payload", movers === "Robinhood Chain movers (24h, pool price): top MSTR +4.20% · bottom BABA -3.15%. Full list above; tap Trade on a row to buy or sell it.", movers ?? "");

const quote = cardReply("hub_rh_quote", { ticker: "NVDA", price_usd: 181.5, source: "chainlink", is_stale: true });
ok("quote names the source and staleness", !!quote && quote.startsWith("NVDA on Robinhood Chain: $181.50 (Chainlink oracle, STALE"), quote ?? "");
ok("quote with an unknown source → null", cardReply("hub_rh_quote", { ticker: "NVDA", price_usd: 1, source: "magic" }) === null);
ok("quote with no price says so", (cardReply("hub_rh_quote", { ticker: "ZZZ", price_usd: null }) ?? "").startsWith("No live price for ZZZ"));

const search = cardReply("hub_rh_search", { query: "tesla", matches: [{ ticker: "TSLA", name: "Tesla" }] });
ok("single search match", search === "TSLA — Tesla on Robinhood Chain (contract on the card).", search ?? "");
ok("no search match", cardReply("hub_rh_search", { query: "zzz", matches: [] }) === 'No Robinhood Chain stock or ETF token matches "zzz" in the registry.');

const price = cardReply("hub_token_price", { symbol: "eth", usd: 2450.5, change24h: -1.234, marketCap: 2.95e11 });
ok("token price from CoinGecko fields", price === "ETH: $2,450.5 (24h -1.23%), market cap $295.00B — CoinGecko.", price ?? "");
ok("token price without usd → null", cardReply("hub_token_price", { symbol: "eth" }) === null);

const listings = cardReply("hub_rh_new_listings", { recent_deployments: [{}, {}], new_since_registry: 1 });
ok("new listings counts deployments and unlisted", !!listings && listings.startsWith("2 recent deployments") && listings.includes("1 not yet in BlueAgent's registry"), listings ?? "");

ok("every card tool is a real chat tool name (hub_ prefix)", [...CARD_REPLY_TOOLS].every((t) => t.startsWith("hub_")));

console.log(failures === 0 ? "\nchat-trade-intent-test: PASS" : `\nchat-trade-intent-test: FAIL — ${failures}`);
process.exit(failures === 0 ? 0 : 1);
