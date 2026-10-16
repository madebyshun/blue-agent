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
import { cardReply, CARD_REPLY_TOOLS, CARD_RENDERED_TOOLS, walletText } from "../src/lib/chat/card-replies";
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
    { status: "ok", symbol: "A", address: "0x1111111111111111111111111111111111111111", change_24h: 12.5, liquidity_usd: 3_090_000, flags: [], honeypot: { verdict: "SAFE" } },
    { status: "ok", symbol: "B", address: "0x2222222222222222222222222222222222222222", change_24h: 905.39, liquidity_usd: 10_170_000, flags: ["MICRO_CAP"], honeypot: { verdict: "HONEYPOT" } },
    { status: "ok", symbol: "D", change_24h: 1, flags: ["TAX_UNVERIFIED"], honeypot: { verdict: "UNKNOWN" } },
    { status: "skipped", symbol: "C" },
  ],
}) ?? "";
// 2026-10-16: short, like Bankr — a summary line, then one line per row.
ok("trending opens with who leads", trending.startsWith("**Trending on Base**: B leads, +905.39% in 24h."), trending);
ok("one line per ok row, skipped rows left out", /\n- \[\*\*A\*\*\]\(https:\/\/basescan\.org\/token\/0x1111/.test(trending) && !/\*\*C\*\*/.test(trending), trending);
ok("the contract rides in the symbol's link", trending.includes("(https://basescan.org/token/0x2222222222222222222222222222222222222222)"), trending);
ok("a honeypot says not tradable", /\*\*B\*\*\]\([^)]*\) \+905\.39% · liq \$10\.17M · honeypot, not tradable/.test(trending), trending);
ok("a measured clean tax is said; an unread one is not repeated per row", /\*\*A\*\*.*tax clean/.test(trending) && !/tax unverified|tax check UNKNOWN/i.test(trending), trending);
ok("trending says how to trade and that it is checked first", /checked before you sign/.test(trending), trending);
ok("at most five rows", cardReply("hub_safe_trending", { tokens: Array.from({ length: 9 }, (_, i) => ({ status: "ok", symbol: `T${i}`, change_24h: i })) })!.includes("…and 4 more."));
ok("empty trending is stated, not invented", cardReply("hub_safe_trending", { tokens: [] }) === "No trending Base token passed the liquidity floor right now.");

const movers = cardReply("hub_rh_movers", {
  gainers: [{ ticker: "MSTR", change_24h_pct: 4.2 }],
  losers: [{ ticker: "BABA", change_24h_pct: -3.15 }],
});
ok("movers quotes top and bottom from the payload", !!movers && movers.endsWith("Robinhood Chain movers (24h, pool price): top MSTR +4.20% · bottom BABA -3.15%. To trade one, say e.g. \"buy $5 of <ticker> on robinhood\"."), movers ?? "");
ok("movers lists both rows in text", !!movers && /\*\*MSTR\*\*/.test(movers) && /\*\*BABA\*\*/.test(movers));

const quote = cardReply("hub_rh_quote", { ticker: "NVDA", price_usd: 181.5, source: "chainlink", is_stale: true });
ok("quote names the source and staleness", !!quote && quote.startsWith("NVDA on Robinhood Chain: $181.50 (Chainlink oracle, STALE"), quote ?? "");
ok("quote with an unknown source → null", cardReply("hub_rh_quote", { ticker: "NVDA", price_usd: 1, source: "magic" }) === null);
ok("quote with no price says so", (cardReply("hub_rh_quote", { ticker: "ZZZ", price_usd: null }) ?? "").startsWith("No live price for ZZZ"));

const search = cardReply("hub_rh_search", { query: "tesla", matches: [{ ticker: "TSLA", name: "Tesla" }] });
ok("single search match is written as a row", !!search && /\*\*TSLA\*\*/.test(search) && /Tesla/.test(search), search ?? "");
ok("no search match", cardReply("hub_rh_search", { query: "zzz", matches: [] }) === 'No Robinhood Chain stock or ETF token matches "zzz" in the registry.');

const price = cardReply("hub_token_price", { symbol: "eth", usd: 2450.5, change24h: -1.234, marketCap: 2.95e11 });
ok("token price from CoinGecko fields", price === "ETH: $2,450.5 (24h -1.23%), market cap $295.00B — CoinGecko.", price ?? "");
ok("token price without usd → null", cardReply("hub_token_price", { symbol: "eth" }) === null);

const listings = cardReply("hub_rh_new_listings", { recent_deployments: [{}, {}], new_since_registry: 1 });
ok("new listings counts deployments and unlisted", !!listings && listings.includes("2 recent deployments") && listings.includes("1 not yet in BlueAgent's registry"), listings ?? "");

const b20 = cardReply("hub_b20_inspect", {
  address: "0xb20000000000000000000078ee7ce2fE4908108C", network: "mainnet", isB20: true, symbol: "NVDAc", name: "NVIDIA Corporation",
  decimals: 8, variant: "ASSET", totalSupplyFormatted: "20362.95", supplyCapUncapped: true,
  paused: { transfer: false, mint: false, burn: false },
  policies: { transferSender: { kind: "custom", policyId: "5" }, transferReceiver: { kind: "open", policyId: "0" }, transferExecutor: { kind: "custom", policyId: "5" }, mintReceiver: { kind: "custom", policyId: "5" } },
  explorerUrl: "https://basescan.org/token/0xb20000000000000000000078ee7ce2fE4908108C",
}) ?? "";
ok("b20 inspect is a list, never a one-line table", b20.split("\n").length >= 3 && !b20.includes("|---"), b20);
ok("b20 inspect states supply, cap and pause from the payload", b20.includes("Supply 20,362.95 NVDAc · cap uncapped · nothing paused"));
ok("b20 inspect states each scope's policy", b20.includes("send gated by policy #5 · receive open to all"));
ok("b20 isB20=false is stated, not described", (cardReply("hub_b20_inspect", { address: "0xabc", isB20: false }) ?? "").includes("is NOT a B20 token"));
ok("b20 with unread pause is 'unknown', never 'nothing paused'", !(cardReply("hub_b20_inspect", { address: "0xabc", isB20: true, symbol: "Xc" }) ?? "").includes("nothing paused"));
// Review 2026-10-01: inspectB20 maps FAILED reads to isB20=false / paused=false
// / policy open and lists them in `unread`; the reply must not state those.
const failedIsB20 = cardReply("hub_b20_inspect", { address: "0xabc", isB20: false, unread: ["isB20"] }) ?? "";
ok("b20 with a failed isB20() read is 'could not read', never 'NOT a B20'", /Could not read whether 0xabc is a B20/.test(failedIsB20) && !/is NOT a B20/.test(failedIsB20), failedIsB20);
const partial = cardReply("hub_b20_inspect", {
  address: "0xb20000000000000000000078ee7ce2fE4908108C", network: "mainnet", isB20: true, symbol: "Xc",
  paused: { transfer: false, mint: false, burn: false },
  policies: { transferSender: { kind: "open", policyId: "0" }, transferReceiver: { kind: "open", policyId: "0" }, transferExecutor: { kind: "open", policyId: "0" }, mintReceiver: { kind: "custom", policyId: "5" } },
  unread: ["paused.mint", "policies.transferSender"],
}) ?? "";
ok("b20 with an unread pause read never says 'nothing paused'", !partial.includes("nothing paused") && /pause state of mint could not be read/.test(partial) && /not paused: transfer, burn/.test(partial), partial);
ok("b20 with an unread policy read never says 'open to all' for it", /send could not be read/.test(partial) && /receive open to all/.test(partial), partial);
ok("no tool is marked as an on-screen card any more (2026-10-13)", CARD_RENDERED_TOOLS.size === 0);

console.log("walletText");
{
  const w = walletText(
    [
      { symbol: "USDC", amount: "10.125", address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", usdValue: 10.09, trust: "verified" },
      { symbol: "ETH", amount: "0.0001", address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", usdValue: 0.27, isNative: true },
      { symbol: "NOCK", amount: "66", address: "0x1111111111111111111111111111111111111111", trust: "unverified" },
    ],
    [],
    { partialReason: "2 balance reads did not complete." },
  );
  // 2026-10-16: short, like Bankr — total first, priced rows, unpriced counted.
  ok("wallet: total first", w.startsWith("Portfolio is about $10.36 where priced, across Base and Robinhood Chain."), w);
  ok("wallet: a priced row is value then amount, contract in the link", /- \[\*\*USDC\*\*\]\(https:\/\/basescan\.org\/token\/0x833589[^)]*\): \$10\.09 \(10\.125\)/.test(w), w);
  ok("wallet: unpriced tokens are counted, never listed and never $0", /1 token with no price/.test(w) && !/NOCK/.test(w) && !/\$0\.00/.test(w), w);
  ok("wallet: dust is counted, not listed", /1 under \$1/.test(w) && !/\*\*ETH\*\*/.test(w), w);
  ok("wallet: an incomplete Base read is said", /The Base list may be incomplete/.test(w), w);
  ok("wallet: an empty Robinhood leg is 'none found', not 'none held'", /\*\*Robinhood Chain\*\*: none found/.test(w), w);
  const spam = walletText([{ symbol: "www.afomo.top ✅", amount: "9.999", address: "0x51fe049fd61a8de0651c1e7da421bc7446bdc549", trust: "unverified" }], []);
  ok("wallet: a phishing-named airdrop never appears in the answer", !/afomo/.test(spam), spam);
  ok("wallet: a failed read with nothing read says so", walletText([], [], { error: "x" }).startsWith("Couldn't read the wallet"));
}
ok("every card tool is a real chat tool name (hub_ prefix)", [...CARD_REPLY_TOOLS].every((t) => t.startsWith("hub_")));

console.log(failures === 0 ? "\nchat-trade-intent-test: PASS" : `\nchat-trade-intent-test: FAIL — ${failures}`);
process.exit(failures === 0 ? 0 : 1);
