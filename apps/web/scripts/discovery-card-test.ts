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
const NVDA = "0x1111111111111111111111111111111111111111";
const TSLA = "0x2222222222222222222222222222222222222222";
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

ok("any other tool is not a discovery card", discoveryRows("hub_token_price", {}) === null);

console.log(failures === 0 ? "\ndiscovery-card-test: PASS" : `\ndiscovery-card-test: FAIL — ${failures}`);
process.exit(failures === 0 ? 0 : 1);
