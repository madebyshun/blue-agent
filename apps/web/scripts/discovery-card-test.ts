/**
 * discovery-card-test — G0 (2026-09-30): Chat can DISCOVER on both chains, and
 * every discovered row can be traded by its contract, never by its ticker.
 *
 * Two halves:
 *   1. wiring — the six discovery tools are offered in Chat (schema + endpoint
 *      + not hidden + not halted) and each has a card case;
 *   2. rows — the pure adapter turns each tool's real response shape into rows
 *      armed with chain + contract, labels Robinhood stock tokens in the
 *      issuer's terms, and withholds the Swap button where it must.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { discoveryRows } from "../src/app/chat/components/DiscoveryCard";
import { haltReason } from "../src/lib/tool-halts";
import { RWA_TOKENS } from "../src/lib/robinhood/rwa-registry";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}
const ROOT = process.cwd();
const ROUTE = readFileSync(join(ROOT, "src/app/api/chat/route.ts"), "utf8");
const CARDS = readFileSync(join(ROOT, "src/app/chat/components/ToolCards.tsx"), "utf8");

const TOOLS: Record<string, string> = {
  hub_rh_movers: "rh-stock-movers",
  hub_rh_new_listings: "rh-stock-new-listings",
  hub_rh_search: "rh-stock-search",
  hub_rh_quote: "rh-stock-quote",
  hub_rh_index: "rh-rwa-index",
  hub_safe_trending: "safe-trending",
};

console.log("\n1. wiring");
const hidStart = ROUTE.search(/const CHAT_HIDDEN_TOOLS[^=]*= new Set\(\[/);
const hidden = ROUTE.slice(hidStart, ROUTE.indexOf("]);", hidStart));
ok("the hidden-tools set was found (the check is alive)", hidStart > 0 && hidden.includes("hub_market_fit"));
for (const [name, id] of Object.entries(TOOLS)) {
  ok(`${name}: schema offered`, ROUTE.includes(`name: "${name}"`));
  ok(`${name}: → ${id}`, new RegExp(`${name}:\\s*"${id}"`).test(ROUTE));
  ok(`${name}: not hidden from chat`, !hidden.includes(`"${name}"`));
  ok(`${name}: ${id} is not halted`, haltReason(id) === null);
  ok(`${name}: has a card case`, CARDS.includes(`case "${name}":`));
}

console.log("\n2. rows");
// REAL registry contracts: a row's label and Swap now come from the registry
// entry for its contract, so a synthetic address would exercise only the
// "not in registry" path.
const reg = (ticker: string) => {
  const t = RWA_TOKENS.find((x) => x.ticker === ticker);
  if (!t) throw new Error(`registry has no ${ticker} — pick another fixture`);
  return t.contract;
};
const NVDA = reg("NVDA");
const TSLA = reg("TSLA");
const USDG = RWA_TOKENS.find((t) => t.kind === "stable")!;
const ETF = RWA_TOKENS.find((t) => t.kind === "etf")!;
const movers = discoveryRows("hub_rh_movers", {
  gainers: [{ ticker: "NVDA", name: "NVIDIA", contract: NVDA, kind: "stock", price_usd: 180.5, change_24h_pct: 2.1, tvl_usd: 90_000, pool_name: "NVDA / USDG" }],
  losers:  [{ ticker: "TSLA", name: "Tesla", contract: TSLA, kind: "stock", price_usd: 250, change_24h_pct: -1.4, tvl_usd: 40_000, pool_name: "TSLA / WETH" }],
});
ok("movers: both sides become rows", movers?.rows.length === 2);
ok("movers: armed with the CONTRACT on Robinhood Chain",
  movers?.rows[0].address === NVDA && movers?.rows[0].chain === "robinhood");
ok("movers: labelled as a Robinhood (Jersey) stock token, not a share",
  /Stock token \(Robinhood, Jersey\) · tracks NVDA/.test(movers?.rows[0].label ?? "") && !/share/i.test(movers?.rows[0].label ?? ""));
ok("movers: a USDG pool opens USDG → token; a WETH pool opens ETH → token",
  movers?.rows[0].quoteVia === "USDG" && movers?.rows[1].quoteVia === "ETH");

const listings = discoveryRows("hub_rh_new_listings", {
  recent_deployments: [{ ticker: "NEW", contract: TSLA, deployed_at: "2026-09-29T00:00:00Z" }, { ticker: "OLD", contract: NVDA }],
  new_only: [{ ticker: "NEW", contract: TSLA }],
});
ok("new listings: a deployment outside the registry gets no Swap",
  listings?.rows[0].swappable === false && /registry/.test(listings?.rows[0].noSwapReason ?? ""));
ok("new listings: a registered one does", listings?.rows[1].swappable === true);

const quoteOnly = discoveryRows("hub_rh_quote", { ticker: "XYZ", contract: null, price_usd: 10 });
ok("quote: a Chainlink-only ticker (no contract) gets no Swap", quoteOnly?.rows[0].swappable === false);

const index = discoveryRows("hub_rh_index", {
  stocks: Array.from({ length: 15 }, (_, i) => ({ ticker: `S${i}`, contract: `0x${String(i).padStart(40, "0")}`, kind: "stock" })),
  etfs: [{ ticker: "E1", contract: `0x${"e".repeat(40)}`, kind: "etf" }],
});
ok("index: a long catalog is cut, and the rest is counted", index?.rows.length === 12 && index?.more === 4);

const trending = discoveryRows("hub_safe_trending", {
  tokens: [
    { status: "ok", address: NVDA, symbol: "AAA", price_usd: 1, change_24h: 3, liquidity_usd: 900_000, honeypot: { verdict: "SAFE" }, exit_risk: "LOW" },
    { status: "ok", address: TSLA, symbol: "TRAP", honeypot: { verdict: "HONEYPOT" } },
    { status: "error", address: null, symbol: "BAD" },
  ],
});
ok("safe-trending: rows are on Base", trending?.rows.every((r) => r.chain === "base") === true);
ok("safe-trending: a failed scan row is dropped", trending?.rows.length === 2);
ok("safe-trending: a measured honeypot gets no Swap", trending?.rows[1].swappable === false);
ok("safe-trending: the tax verdict is shown as a fact", /tax check SAFE/.test(trending?.rows[0].facts.join(" ") ?? ""));

// Labels come from the REGISTRY, not the payload's `kind` (absent from
// rh-stock-quote / rh-stock-new-listings, and "stable"/"wrapped" for the
// chain's two utility rows, which every tool can return).
const search = discoveryRows("hub_rh_search", {
  matches: [{ ticker: USDG.ticker, name: USDG.name, contract: USDG.contract, kind: "stable" }],
});
ok("search: USDG is NOT labelled a Robinhood (Jersey) stock token",
  !/Stock token|Jersey/.test(search?.rows[0].label ?? "") && /Stablecoin/.test(search?.rows[0].label ?? ""), search?.rows[0].label);
ok("search: …and gets no Swap (it would open USDG → USDG)", search?.rows[0].swappable === false);
const etfQuote = discoveryRows("hub_rh_quote", { ticker: ETF.ticker, contract: ETF.contract, price_usd: 500 });
ok(`quote: an ETF (${ETF.ticker}) with no \`kind\` in the payload is still labelled an ETF token`,
  /^ETF token \(Robinhood, Jersey\)/.test(etfQuote?.rows[0].label ?? ""), etfQuote?.rows[0].label);

// rh-stock-quote's real shape: `is_stale` at the top level and on `chainlink`.
const stale = discoveryRows("hub_rh_quote", {
  tool: "rh-stock-quote", ticker: "NVDA", contract: NVDA, price_usd: 180.5, source: "chainlink",
  chainlink: { price_usd: 180.5, is_stale: true }, is_stale: true,
});
ok("quote: a stale oracle (the handler's `is_stale`) is marked STALE", /oracle STALE/.test(stale?.rows[0].facts.join(" ") ?? ""));
const fresh = discoveryRows("hub_rh_quote", { ticker: "NVDA", contract: NVDA, price_usd: 180.5, chainlink: { is_stale: false }, is_stale: false });
ok("quote: …and a fresh one is not", !/STALE/.test(fresh?.rows[0].facts.join(" ") ?? ""));

const flagged = discoveryRows("hub_safe_trending", {
  tokens: [
    { status: "ok", address: TSLA, symbol: "USDC", price_usd: 1, honeypot: { verdict: "SAFE" }, exit_risk: "LOW", flags: ["IMPERSONATION_CHECK"] },
    { status: "ok", address: NVDA, symbol: "BBB", honeypot: { verdict: "SAFE" }, flags: ["TAX_UNVERIFIED", "BLACKLIST_CAPABLE"] },
  ],
});
ok("safe-trending: a row the tool flagged IMPERSONATION_CHECK gets no Swap", flagged?.rows[0].swappable === false && /impersonat/.test(flagged?.rows[0].noSwapReason ?? ""));
ok("safe-trending: …and the flag is shown as a fact, not dropped", /pinned token's symbol/.test(flagged?.rows[0].facts.join(" ") ?? ""));
ok("safe-trending: TAX_UNVERIFIED and BLACKLIST_CAPABLE are shown too (still swappable)",
  /tax unverified/.test(flagged?.rows[1].facts.join(" ") ?? "") && /blacklist/.test(flagged?.rows[1].facts.join(" ") ?? "") && flagged?.rows[1].swappable === true);

ok("any other tool is not a discovery card", discoveryRows("hub_token_price", {}) === null);

console.log("\n3. the Hood board's neutral Swap");
const HOOD = readFileSync(join(ROOT, "src/app/app/hood/HoodClient.tsx"), "utf8");
const HSWAP = readFileSync(join(ROOT, "src/app/app/hood/HoodSwap.tsx"), "utf8");
ok("every expanded board row mounts HoodSwap with its chain and contract",
  /<HoodSwap ticker=\{r\.ticker\} chain=\{chainOf\(r\)\} contract=\{r\.contract\} \/>/.test(HOOD));
ok("the swap is armed with the contract, never the ticker",
  /initialBuy=\{contract\}/.test(HSWAP) && /token_address: contract/.test(HSWAP));
ok("it is not the arrow's Review & Sign", !/ReviewSignPanel/.test(HSWAP));
ok("labels say B20 (Coinbase) / Stock token (Robinhood, Jersey), never shares",
  /B20 tokenized stock \(Coinbase\)/.test(HSWAP) && /Stock token \(Robinhood, Jersey\)/.test(HSWAP) && !/\bshares?\b/i.test(HSWAP.replace(/never "shares"/, "")));

console.log("\n4. a Robinhood USDG Swap can actually be signed");
// Every USDG-quoted RH row (discovery default + the Hood board) mounts
// RobinhoodSwapCard WITHOUT an amount. That card was confirm-only: no <input>,
// amount only from `result.amount`, so `canSwap` (amt > 0) could never be true.
const RSC = readFileSync(join(ROOT, "src/app/chat/components/RobinhoodSwapCard.tsx"), "utf8");
const dsStart = CARDS.indexOf("function DiscoverySwap(");
const discSwap = CARDS.slice(dsStart, CARDS.indexOf("\n}\n", dsStart));
const usdgMount = (src: string) => {
  const i = src.indexOf("<RobinhoodSwapCard result={{");
  return i < 0 ? "" : src.slice(i, src.indexOf("}} />", i));
};
ok("DiscoverySwap's USDG path mounts RobinhoodSwapCard with no amount (the card must own one)",
  dsStart > 0 && usdgMount(discSwap).length > 0 && !/\bamount\s*:/.test(usdgMount(discSwap)));
ok("…and so does the Hood board's RH row", usdgMount(HSWAP).length > 0 && !/\bamount\s*:/.test(usdgMount(HSWAP)));
ok("RobinhoodSwapCard: no stated amount ⇒ editable, and that drives the amount it trades",
  /const editableAmount = result\.amount == null/.test(RSC) && /const initialAmt = editableAmount \? typedAmt/.test(RSC));
ok("…rendering an amount <input> bound to it",
  /\{editableAmount && \([\s\S]{0,400}<input[^>]*value=\{typedAmt\}/.test(RSC));
ok("…while a STATED amount stays confirm-only (#107)", /editableAmount \? typedAmt\.trim\(\) : String\(result\.amount\)/.test(RSC));

console.log(failures === 0 ? "\ndiscovery-card-test: PASS" : `\ndiscovery-card-test: FAIL — ${failures}`);
process.exit(failures === 0 ? 0 : 1);
