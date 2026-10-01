/**
 * Halts (lib/tool-halts.ts) must stay honest and must stay effective.
 *
 *   1. Every halted id exists in AGENT_TOOLS and in HANDLERS. A halt on an id
 *      that was retired or renamed pauses nothing and reads as if it did.
 *   2. The x402 route consults haltReason() in BOTH handlers (GET discovery and
 *      the POST path), so a halted id neither advertises a price nor runs.
 *   3. In the POST path the halt check comes BEFORE the internal branch, and
 *      inside lib/x402-internal-run.ts (which that branch, chat and MCP all
 *      call) it comes BEFORE the credit debit — so a chat user is never
 *      debited for a halted id, by either door.
 *
 * Hermetic — imports modules and reads files off disk, no network. Discovered
 * automatically by run-tests.ts (every `scripts/*-check.ts` runs in CI).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { HALTED_TOOLS } from "../src/lib/tool-halts";
import { CHAT_HIDDEN_TOOLS } from "../src/lib/chat-hidden-tools";
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
const internalCall = src.indexOf("runInternalTool(", handleStart);
if (handleStart < 0 || haltInHandle < 0 || internalCall < 0) {
  failures.push("3 could not locate handle(), its halt check, or the runInternalTool call in the x402 route");
} else if (haltInHandle > internalCall) {
  failures.push("3 the POST halt check runs AFTER the internal branch — a chat user could be debited for a halted id");
}
// Since 2026-10-01 chat and MCP call runInternalTool directly, never passing
// through the route's own check — so the function must hold the line itself.
// Positions are taken on code only: its comments mention spend() first.
const RUNNER = path.resolve(SCRIPTS_DIR, "..", "src", "lib", "x402-internal-run.ts");
const runner = readFileSync(RUNNER, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const runStart = runner.indexOf("export async function runInternalTool(");
const haltInRun = runner.indexOf("haltReason(tool)", runStart);
const spendInRun = runner.indexOf("await spend(", runStart);
if (runStart < 0 || haltInRun < 0 || spendInRun < 0) {
  failures.push("3 could not locate runInternalTool, its halt check, or its spend() in lib/x402-internal-run.ts");
} else if (haltInRun > spendInRun) {
  failures.push("3 runInternalTool debits BEFORE its halt check — chat and MCP could be charged for a halted id");
}

// 4. Chat must not OFFER a halted id. Parsed from the route's source because
//    api/chat/route.ts cannot be imported standalone (route-module exports).
const CHAT = path.resolve(SCRIPTS_DIR, "..", "src", "app", "api", "chat", "route.ts");
const chat = readFileSync(CHAT, "utf8");
const listStart = chat.indexOf("const ALL_HUB_TOOLS = [");
const listEnd = chat.indexOf("\n];", listStart);
// The hidden set itself is imported (lib/chat-hidden-tools.ts, since
// 2026-10-01); this anchor only proves the route still filters by it.
const filterAt = chat.indexOf("const HUB_TOOLS = ALL_HUB_TOOLS.filter((t) => !CHAT_HIDDEN_TOOLS.has(t.name))");
const endpointStart = chat.indexOf("const TOOL_ENDPOINT: Record<string, string> = {");
const endpointEnd = chat.indexOf("\n};", endpointStart);
if ([listStart, listEnd, filterAt, endpointStart, endpointEnd].some((i) => i < 0)) {
  failures.push("4 could not locate ALL_HUB_TOOLS / the CHAT_HIDDEN_TOOLS filter / TOOL_ENDPOINT in api/chat/route.ts");
} else {
  const offered = [...chat.slice(listStart, listEnd).matchAll(/^\s{4}name:\s*"([^"]+)"/gm)].map((m) => m[1]);
  const hidden = CHAT_HIDDEN_TOOLS;
  const endpoint = new Map(
    [...chat.slice(endpointStart, endpointEnd).matchAll(/^\s*"?([A-Za-z0-9_]+)"?\s*:\s*"([^"]+)"/gm)].map((m) => [m[1], m[2]]),
  );
  for (const name of offered) {
    if (hidden.has(name)) continue;
    const id = endpoint.get(name);
    if (id && HALTED_TOOLS[id]) failures.push(`4 chat offers ${name} → ${id}, which is halted — add ${name} to CHAT_HIDDEN_TOOLS`);
  }
}

console.log(`tool-halts-check — ${ids.length} halted ids`);
if (failures.length > 0) {
  console.log(`\n${failures.length} problem(s):`);
  for (const f of failures) console.log(`  FAIL  ${f}`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
