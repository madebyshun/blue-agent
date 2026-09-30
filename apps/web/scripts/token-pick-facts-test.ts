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
import { HALTED_TOOLS } from "../src/lib/tool-halts";

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

// ── The published copy ────────────────────────────────────────────────────────
// The handler went facts-only and the copy that SOLD the old answer stayed:
// the home page's animated answer still printed `"signal": "BUY"`, a
// confidence and an entry under `↳ token-pick-signal`, and /plugin.md — read by
// integrators who wire agents to it — showed `blue_verdict: "BUY"` in its
// sample 200 and told them to "prepare a swap if verdict is BUY". An agent
// built to that doc pays per call for a branch that can no longer fire. Both
// also advertised tools that lib/tool-halts.ts refuses. These checks read the
// shipped text, so the copy cannot drift from the handler again unnoticed.
const PAGE = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");
const PLUGIN = readFileSync(join(process.cwd(), "public/plugin.md"), "utf8");
const AI_PLUGIN = readFileSync(join(process.cwd(), "src/app/.well-known/ai-plugin.json/route.ts"), "utf8");
const block = (src: string, start: string) => {
  const i = src.indexOf(start);
  return i < 0 ? "" : src.slice(i, src.indexOf("];", i));
};
const segs = block(PAGE, "const CHAT_SEGMENTS");
const cats = block(PAGE, "const HUB_CATEGORIES");
const halted = Object.keys(HALTED_TOOLS);
const haltedIn = (text: string, forms: (id: string) => string[]) =>
  halted.filter((id) => forms(id).some((f) => text.toLowerCase().includes(f)));
const VERDICT = /"BUY"|"WATCH"|"SKIP"|"signal"\s*:|"confidence"|"entry"|thesis|kill.criterion/i;

console.log("\nthe landing page's chat mock");
ok("the mock answer carries no verdict, confidence or entry", segs.length > 0 && !VERDICT.test(segs));
const haltedInPage = haltedIn(segs + cats, (id) => [id, id.replace(/-/g, " ")]);
ok(`the mock and the Hub categories name no halted tool${haltedInPage.length ? ` (${haltedInPage.join(", ")})` : ""}`,
  segs.length > 0 && cats.length > 0 && haltedInPage.length === 0);

console.log("\n/plugin.md (integrator doc)");
ok("no `blue_verdict`, confidence or kill criterion anywhere",
  !/blue_verdict|kill.criterion|"confidence"/i.test(PLUGIN));
ok("no composition example keyed on a BUY verdict", !/verdict is `?BUY/i.test(PLUGIN));
const pickLines = PLUGIN.split("\n").filter((l) => l.includes("token-pick-signal"));
// Verdict words case-SENSITIVE: "no buy/sell call" is the disclaimer, not a call.
const tradeWords = (l: string) => /\bBUY\b|\bWATCH\b|\bSKIP\b/.test(l) || /\bentry\b|thesis|sizing|actionable|asymmetric/i.test(l);
ok(`no line about token-pick-signal sells a trade call (${pickLines.length} lines)`,
  pickLines.length > 0 && pickLines.every((l) => !tradeWords(l)));
const sample = (() => {
  const i = PLUGIN.indexOf('"tool": "token-pick-signal"');
  return i < 0 ? "" : PLUGIN.slice(i, PLUGIN.indexOf("```", i));
})();
ok("the sample 200 response is the facts-only shape",
  /"facts_only": true/.test(sample) && !/"entry"|"thesis"|"headline"/.test(sample));
const haltedInPlugin = haltedIn(PLUGIN, (id) => [`\`${id}\``, `/api/x402/${id}`]);
ok(`no halted tool is advertised${haltedInPlugin.length ? ` (${haltedInPlugin.join(", ")})` : ""}`,
  haltedInPlugin.length === 0);

console.log("\n/.well-known/ai-plugin.json (the text an LLM follows)");
const aiPickAt = AI_PLUGIN.indexOf("token-pick-signal ($0.20)");
const aiPick = aiPickAt < 0 ? "" : AI_PLUGIN.slice(aiPickAt, AI_PLUGIN.indexOf("market-fit (", aiPickAt));
ok("token-pick-signal is described as facts, not setups",
  aiPick.length > 0 && !/asymmetric|setup/i.test(aiPick) && !/\bBUY\b/.test(aiPick) && /no buy\/sell call/.test(aiPick));

console.log(failures === 0 ? "\ntoken-pick-facts-test: PASS" : `\ntoken-pick-facts-test: FAIL — ${failures}`);
process.exit(failures === 0 ? 0 : 1);
