/**
 * credit-price-override-test — a chat credit price set apart from the x402
 * USDC price (lib/credit-pricing.ts CREDIT_PRICE_OVERRIDE, 2026-10-21).
 */
import { toolCreditCost, CREDIT_PRICE_OVERRIDE, CREDITS_PER_USDC } from "../src/lib/credit-pricing";
import { getTierInfo, WALLET_DAILY } from "../src/lib/credits";
import { AGENT_TOOLS } from "../src/lib/agent-tools";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`); if (!cond) failures++; }

const t0 = getTierInfo(0);
const trending = toolCreditCost("safe-trending", t0);
ok("trending costs nothing on top of the message", trending === 0, String(trending));
ok("the free daily credits buy 50 fast-model answers with trending", Math.floor(WALLET_DAILY / (trending + 10)) === 50);
for (const id of ["token-price", "rh-stock-movers", "rh-stock-new-listings", "rh-stock-quote", "rh-stock-search", "rh-rwa-index", "blue-registry", "token-pick-signal"]) ok(`data tool ${id} is free in chat`, toolCreditCost(id, t0) === 0);
for (const id of ["deep-analysis", "risk-gate", "contract-trust", "dex-flow", "honeypot-check", "blue-compose"]) ok(`model-running tool ${id} keeps its price`, toolCreditCost(id, t0) > 0);
ok("the x402 USDC price is unchanged ($0.15)", AGENT_TOOLS.find((t) => t.id === "safe-trending")?.price === "$0.15");
ok("a tool without an override still follows its USDC price", toolCreditCost("deep-analysis", t0) === Math.round(0.5 * CREDITS_PER_USDC));
for (const id of Object.keys(CREDIT_PRICE_OVERRIDE)) ok(`override "${id}" names a real catalog id`, AGENT_TOOLS.some((t) => t.id === id));

console.log(failures === 0 ? "\ncredit-price-override-test: PASS" : `\ncredit-price-override-test: FAIL — ${failures}`);
process.exit(failures === 0 ? 0 : 1);
