/**
 * credit-price-override-test — a chat credit price set apart from the x402
 * USDC price (lib/credit-pricing.ts CREDIT_PRICE_OVERRIDE, 2026-10-21).
 */
import { toolCreditCost, CREDIT_PRICE_OVERRIDE, CREDITS_PER_USDC } from "../src/lib/credit-pricing";
import { getTierInfo, WALLET_DAILY } from "../src/lib/credits";
import { AGENT_TOOLS } from "../src/lib/agent-tools";
import { CHAT_HIDDEN_TOOLS } from "../src/lib/chat-hidden-tools";
import { readFileSync } from "node:fs";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`); if (!cond) failures++; }

const t0 = getTierInfo(0);
const trending = toolCreditCost("safe-trending", t0);
ok("trending costs nothing on top of the message", trending === 0, String(trending));
ok("the free daily credits buy 50 fast-model answers with trending", Math.floor(WALLET_DAILY / (trending + 10)) === 50);
for (const id of ["token-price", "rh-stock-movers", "rh-stock-new-listings", "rh-stock-quote", "rh-stock-search", "rh-rwa-index", "blue-registry", "token-pick-signal"]) ok(`data tool ${id} is free in chat`, toolCreditCost(id, t0) === 0);
for (const id of ["deep-analysis", "risk-gate", "contract-trust", "dex-flow", "honeypot-check", "blue-compose"]) ok(`model-running tool ${id} is free in chat too`, toolCreditCost(id, t0) === 0);

// Every Hub tool chat actually offers costs nothing on top of the message —
// a tool added to chat later without an override would silently charge twice.
{
  const route = readFileSync("src/app/api/chat/route.ts", "utf8");
  const block = route.slice(route.indexOf("const TOOL_ENDPOINT"), route.indexOf("};", route.indexOf("const TOOL_ENDPOINT")));
  const offered = new Set([...route.matchAll(/\n\s*name:\s*"([a-z_0-9]+)"/g)].map((m) => m[1]));
  for (const [, name, id] of block.matchAll(/\n\s*([a-z_]+):\s*"([a-z0-9-]+)"/g)) {
    if (!offered.has(name) || CHAT_HIDDEN_TOOLS.has(name)) continue;
    ok(`chat tool ${name} (${id}) adds no credits`, toolCreditCost(id, t0) === 0, String(toolCreditCost(id, t0)));
  }
}
ok("the x402 USDC price is unchanged ($0.15)", AGENT_TOOLS.find((t) => t.id === "safe-trending")?.price === "$0.15");
ok("a tool chat does not offer still follows its USDC price", toolCreditCost("narrative-position", t0) === Math.round(0.15 * CREDITS_PER_USDC));
for (const id of Object.keys(CREDIT_PRICE_OVERRIDE)) ok(`override "${id}" names a real catalog id`, AGENT_TOOLS.some((t) => t.id === id));

console.log(failures === 0 ? "\ncredit-price-override-test: PASS" : `\ncredit-price-override-test: FAIL — ${failures}`);
process.exit(failures === 0 ? 0 : 1);
