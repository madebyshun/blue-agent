/**
 * token-pick-facts-test — token-pick-signal reports facts, never a trade call
 * (plan §3 fix 3, 2026-09-30).
 *
 * It used to answer BUY / WATCH / SKIP with a model-written thesis, entry,
 * kill-criterion and horizon, and the chat card drew it as a trade — conviction
 * badge, target, size, a red "kill switch". The rebuild emits measured facts
 * and nothing that tells a user what to buy. Source-reading: the handler's
 * data path is live GeckoTerminal I/O, and what must hold is a property of the
 * code (no verdict word, no model call), not of one day's pools.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

let failures = 0;
function ok(label: string, cond: boolean) {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures++;
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\/\/.*$/gm, "");
const H = strip(readFileSync(join(process.cwd(), "src/app/api/x402/_handlers/token-pick-signal.ts"), "utf8"));
const CARD = readFileSync(join(process.cwd(), "src/app/chat/components/ToolCards.tsx"), "utf8");
const card = CARD.slice(CARD.indexOf("export function TokenPickCard"), CARD.indexOf("// ──", CARD.indexOf("export function TokenPickCard")));
const ROUTE = readFileSync(join(process.cwd(), "src/app/api/chat/route.ts"), "utf8");
const toolDesc = ROUTE.slice(ROUTE.indexOf('name: "hub_token_pick"'), ROUTE.indexOf("input_schema", ROUTE.indexOf('name: "hub_token_pick"')));

console.log("\ntoken-pick-signal is facts only");
ok("no model call in the handler", !/callLLM|callBankrLLM|callVeniceLLM/.test(H));
ok("no verdict word is produced", !/"BUY"|"WATCH"|"SKIP"|blue_verdict/.test(H));
ok("no entry / kill criterion / horizon / thesis field", !/\bentry\s*:|kill_criterion|horizon\s*:|thesis\s*:/.test(H));
ok("the response says so (facts_only: true)", /facts_only:\s*true/.test(H));
ok("the card draws no trade (no entry, target, size, kill switch, conviction)",
  card.length > 0 && !/Entry|Target|Kill switch|conviction|Size/.test(card));
ok("the chat tool tells the model not to add a call", /FACTS ONLY/.test(toolDesc) && /NO buy\/sell call/.test(toolDesc));

console.log(failures === 0 ? "\ntoken-pick-facts-test: PASS" : `\ntoken-pick-facts-test: FAIL — ${failures}`);
process.exit(failures === 0 ? 0 : 1);
