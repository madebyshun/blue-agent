/**
 * Halts (lib/tool-halts.ts) must stay honest and must stay effective.
 *
 *   1. Every halted id exists in AGENT_TOOLS and in HANDLERS. A halt on an id
 *      that was retired or renamed pauses nothing and reads as if it did.
 *   2. The x402 route consults haltReason() in BOTH handlers (GET discovery and
 *      the POST path), so a halted id neither advertises a price nor runs.
 *   3. In the POST path the halt check comes BEFORE the chat credit-debit
 *      branch, so a chat user is never debited for a halted id.
 *
 * Hermetic — imports modules and reads files off disk, no network. Discovered
 * automatically by run-tests.ts (every `scripts/*-check.ts` runs in CI).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { HALTED_TOOLS } from "../src/lib/tool-halts";
import { AGENT_TOOLS } from "../src/lib/agent-tools";
import { HANDLERS } from "../src/app/api/x402/_handlers";

const SCRIPTS_DIR = path.dirname(path.resolve(process.argv[1]));
const ROUTE = path.resolve(SCRIPTS_DIR, "..", "src", "app", "api", "x402", "[tool]", "route.ts");

const failures: string[] = [];
const ids = Object.keys(HALTED_TOOLS);
const catalog = new Set(AGENT_TOOLS.map((t) => t.id));

for (const id of ids) {
  if (!catalog.has(id)) failures.push(`1 ${id} — halted but not in AGENT_TOOLS (retired or renamed?)`);
  if (!(id in HANDLERS)) failures.push(`1 ${id} — halted but has no handler in HANDLERS`);
  if (!HALTED_TOOLS[id] || HALTED_TOOLS[id].trim().length < 20) failures.push(`1 ${id} — halt has no stated reason`);
}

const src = readFileSync(ROUTE, "utf8");
const uses = src.split("haltReason(tool)").length - 1;
if (uses < 2) failures.push(`2 x402 route calls haltReason(tool) ${uses}× — need both GET and POST`);

const handleStart = src.indexOf("async function handle(");
const haltInHandle = src.indexOf("haltReason(tool)", handleStart);
const debitBranch = src.indexOf("Credit-debit path", handleStart);
if (handleStart < 0 || haltInHandle < 0 || debitBranch < 0) {
  failures.push("3 could not locate handle(), its halt check, or the credit-debit branch in the x402 route");
} else if (haltInHandle > debitBranch) {
  failures.push("3 the POST halt check runs AFTER the credit-debit branch — a chat user could be debited for a halted id");
}

console.log(`tool-halts-check — ${ids.length} halted ids`);
if (failures.length > 0) {
  console.log(`\n${failures.length} problem(s):`);
  for (const f of failures) console.log(`  FAIL  ${f}`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
