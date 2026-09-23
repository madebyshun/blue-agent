/**
 * Curated chip ⇒ real chat tool.
 *
 * WHY THIS EXISTS
 * ---------------
 * The chat Tools tab renders `HUB_SKILLS` (app/chat/hub-skills.ts) as clickable
 * cards. Each card shows a Hub tool's NAME and DESCRIPTION — both pulled from
 * AGENT_TOOLS, the paid x402 catalog — and clicking it drops that entry's
 * `trigger` into the composer. So a chip is a promise with two halves, and the
 * two halves live in different files that nothing connected:
 *
 *   the LABEL comes from the x402 catalog  (lib/agent-tools.ts)
 *   the ANSWER comes from the chat route   (api/chat/route.ts — HUB_TOOLS + TOOL_ENDPOINT)
 *
 * MEASURED 2026-09-23: eleven of the twenty-seven curated entries had no chat
 * tool at all. Clicking "DeFi Opportunity Scanner" sent "Find DeFi opportunities
 * on Base" to a model that had no such tool, so it answered from its weights —
 * a card headed with a real DefiLlama-backed tool's description, returning
 * invented protocols and APYs. This is the same failure the repo has now hit
 * four times (the Trader Intel / Base Builder default skills, `hub_b20_analyze`,
 * and these): a live handler, an advertised capability, and no wiring between
 * them. Every instance was found by a human reading two files side by side.
 *
 * WHAT IT CHECKS
 * --------------
 * 1. Every curated id actually RENDERS. `HUB_SKILLS` silently drops ids missing
 *    from AGENT_TOOLS (hub-skills.ts flatMap), which is how `base-builder-network`
 *    sat in the list for months naming a tool that exists in neither HANDLERS nor
 *    the catalog. Dead config is not harmless: the next person to read the list
 *    treats it as the inventory.
 * 2. Every rendered chip is reachable — some chat tool's TOOL_ENDPOINT value
 *    equals the chip's id. This is the promise itself.
 * 3. That tool is also DECLARED in HUB_TOOLS. A TOOL_ENDPOINT entry with no
 *    schema is invisible to the model, so the route would dispatch a call that
 *    is never made.
 * 4. Guard-the-guard: both regexes are formatting-dependent, so a reindent that
 *    empties either list must fail loudly rather than pass vacuously.
 *
 * WHAT IT DOES NOT CHECK, DELIBERATELY
 * ------------------------------------
 * There is no blocklist of "chips we removed". The three that came out
 * (community-sentiment, agent-collab-match, base-builder-network) are held out
 * by checks 1–2 alone: re-add one and it has no TOOL_ENDPOINT entry, so this
 * fails. A named list would go stale and would invite adding the name back
 * instead of the wiring.
 *
 * Source-reading, not network: these are properties of the code we ship.
 *
 * Run: npx tsx scripts/curated-trigger-check.ts   (auto-discovered by `npm test`)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { HUB_SKILLS } from "../src/app/chat/hub-skills";

const WEB       = path.resolve(path.dirname(path.resolve(process.argv[1])), "..");
const ROUTE     = readFileSync(path.join(WEB, "src/app/api/chat/route.ts"), "utf8");
const HUB_SRC   = readFileSync(path.join(WEB, "src/app/chat/hub-skills.ts"), "utf8");

let failures = 0;
let checks   = 0;

function check(name: string, cond: boolean, detail = "") {
  checks++;
  if (cond) console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

// ── Parse the two maps out of route.ts ───────────────────────────────────────
// TOOL_ENDPOINT: chat tool name → x402 handler id.
const endpointBlock = ROUTE.slice(
  ROUTE.indexOf("const TOOL_ENDPOINT"),
  ROUTE.indexOf("\n};", ROUTE.indexOf("const TOOL_ENDPOINT")),
);
const endpointOf = new Map(
  [...endpointBlock.matchAll(/^\s+([a-z0-9_]+):\s*"([a-z0-9][a-z0-9-]*)",/gm)]
    .map((m) => [m[1], m[2]] as const),
);
/** Reverse index: handler id → the chat tool name(s) that reach it. */
const reachedBy = new Map<string, string[]>();
for (const [tool, id] of endpointOf) {
  reachedBy.set(id, [...(reachedBy.get(id) ?? []), tool]);
}

// Declared tool schemas. Same anchor the honesty check uses: `name:` at exactly
// four spaces is a HUB_TOOLS entry; schema properties are indented deeper.
const declared = new Set(
  [...ROUTE.matchAll(/^\s{4}name:\s*"([a-z0-9_]+)",$/gm)].map((m) => m[1]),
);

// ── 4. Guard the guard (run first — everything below is vacuous without it) ──
check("TOOL_ENDPOINT parsed out of route.ts",
  endpointOf.size >= 40, `${endpointOf.size} entries`);
check("HUB_TOOLS schemas parsed out of route.ts",
  declared.size >= 40, `${declared.size} schemas`);

// ── 1. Every curated id renders ──────────────────────────────────────────────
// CURATED is module-private, so its ids are read from source and compared
// against what HUB_SKILLS actually produced.
const curatedIds = [...HUB_SRC.matchAll(/^\s+\{\s*id:\s*"([a-z0-9][a-z0-9-]*)",/gm)].map((m) => m[1]);
const renderedIds = new Set(HUB_SKILLS.map((s) => s.id));
const dropped = curatedIds.filter((id) => !renderedIds.has(id));
check("CURATED ids parsed out of hub-skills.ts",
  curatedIds.length >= 20, `${curatedIds.length} entries`);
check("every curated id exists in AGENT_TOOLS (nothing silently dropped)",
  dropped.length === 0,
  dropped.length ? `not in the catalog: ${dropped.join(", ")}` : `${curatedIds.length} render`);

// ── 2 + 3. Every chip is reachable, and its tool is declared ─────────────────
const unreachable: string[] = [];
const undeclared:  string[] = [];
for (const skill of HUB_SKILLS) {
  const tools = reachedBy.get(skill.id);
  if (!tools?.length) { unreachable.push(`${skill.id} ("${skill.trigger.trim()}")`); continue; }
  for (const t of tools) if (!declared.has(t)) undeclared.push(`${t} → ${skill.id}`);
}
check("every chat skill chip reaches a chat tool",
  unreachable.length === 0,
  unreachable.length
    ? `no TOOL_ENDPOINT entry — the model answers these from its own weights: ${unreachable.join("; ")}`
    : `${HUB_SKILLS.length} chips wired`);
check("every tool behind a chip is declared in HUB_TOOLS",
  undeclared.length === 0,
  undeclared.length ? `routed but never offered to the model: ${undeclared.join(", ")}` : "all schemas present");

console.log(
  failures === 0
    ? `\nALL ${checks} CHECKS PASSED\n`
    : `\n${failures} of ${checks} CHECK(S) FAILED\n`,
);
process.exit(failures === 0 ? 0 : 1);
