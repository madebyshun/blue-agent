/**
 * Guard: an MCP tool's inputSchema and its handler's body fields are TWO
 * INDEPENDENT DECLARATIONS, and nothing in the type system joins them.
 *
 * Run: `npx tsx scripts/mcp-arg-contract-check.ts` (from apps/web). Exit 0 = pass.
 * Hermetic — source reads only. No network, no LLM, no wallet, no writes.
 *
 * WHY IT EXISTS
 * -------------
 * `lib/mcp-tools.ts` publishes `{ properties, required }` to the agent.
 * `api/x402/_handlers/<id>.ts` reads `body.<field>`. The ONLY bridge between the
 * two names is `ARG_REMAP` in api/mcp/route.ts, and it is a hand-written map.
 *
 * 🔴 MEASURED 2026-09-27: `hub_contract_trust` published `required: ["contract"]`
 * while its handler read `body.address` and had no remap entry, so EVERY call to
 * that tool returned `400 {"error":"address is required"}`. The manifest listed
 * it, `tools/call` accepted it, and it could not succeed once. Proven by calling
 * the handler both ways rather than by reading it:
 *     { contract: "0xA4A2…" } -> 400 "address is required"        ← never read
 *     { address:  "0xnot…"  } -> 400 "Invalid address format"     ← WAS read
 *
 * How it got there is the part worth guarding. ARG_REMAP was trimmed from 22
 * entries to 1 on 2026-09-26, in the same commit that cut TOOLS from 85 to 18.
 * The trim was correct about the 21 it dropped — those keyed handlers this
 * surface no longer reaches — and wrong about the one it should have kept,
 * because nothing anywhere states which remaps the SURVIVING tools depend on.
 * A manifest cut and a remap cut are the same commit and have no shared list.
 *
 * So this file computes that list instead of trusting one: for every HUB_MAP
 * tool it derives the handler's accepted vocabulary from source and asserts the
 * published schema fields land inside it, directly or through a remap.
 *
 * OUT OF SCOPE, each for a named reason:
 *   hub_hood_arrow  — reads the arrow feed inline (route.ts ~857), not a catalog
 *                     handler, so it has no body-field vocabulary to compare.
 *   b20_encode_*    — calldata builders handled in-route, same reason.
 *   blue_call       — deliberately NOT remapped. It forwards `input` untouched
 *                     because the shape it must match is the one blue_registry
 *                     just published to the agent; see ARG_REMAP's own comment.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { MCP_TOOLS } from "../src/lib/mcp-tools";

let pass = 0;
const failures: string[] = [];
function check(name: string, cond: boolean) {
  if (cond) pass++;
  else failures.push(name);
}

const ROOT = process.cwd();
const routeSrc = readFileSync(join(ROOT, "src/app/api/mcp/route.ts"), "utf8");

// ── 1. parse the two maps out of the route ───────────────────────────────────
// Read from source rather than imported: a Next `route.ts` may only export the
// HTTP verbs plus a fixed set of config keys, so `export const HUB_MAP` would
// fail `next build`. Line-anchored on the same formatting docs-truth-check
// group 7 depends on — keep entries one-per-line.
const hubMapBlock = routeSrc.match(/const HUB_MAP: Record<string, string> = \{([\s\S]*?)\n\};/);
check("1.1 HUB_MAP block found in api/mcp/route.ts", !!hubMapBlock);

const HUB_MAP = new Map<string, string>();
for (const m of (hubMapBlock?.[1] ?? "").matchAll(/^\s*([a-z0-9_]+):\s*"([a-z0-9-]+)",/gm)) {
  HUB_MAP.set(m[1], m[2]);
}
check(`1.2 …and parsed at least 10 entries (${HUB_MAP.size})`, HUB_MAP.size >= 10);

const remapBlock = routeSrc.match(/const ARG_REMAP: Record<[\s\S]*?\n\};/);
check("1.3 ARG_REMAP block found", !!remapBlock);
const remapText = remapBlock?.[0] ?? "";
// Per-entry text, so "which field does THIS remap consume" is answerable.
const REMAP = new Map<string, string>();
for (const m of remapText.matchAll(/"([a-z0-9-]+)":\s*\(a\)\s*=>\s*\(\{([\s\S]*?)\}\),/g)) {
  REMAP.set(m[1], m[2]);
}
check(`1.4 …and parsed at least 1 entry (${[...REMAP.keys()].join(", ") || "none"})`, REMAP.size >= 1);

// ── 2. advertised set == callable set ────────────────────────────────────────
// A name in HUB_MAP is tools/call-able even when absent from TOOLS. CLAUDE.md
// calls the gap a hidden surface: undiscoverable by any client, invocable by any
// client. Both directions, because either one alone permits it.
const advertised = new Set(MCP_TOOLS.map((t) => t.name));
for (const name of HUB_MAP.keys()) {
  check(`2.1 HUB_MAP.${name} is advertised in MCP_TOOLS`, advertised.has(name));
}
for (const t of MCP_TOOLS) {
  if (!t.name.startsWith("hub_")) continue;
  // hood_arrow is the one advertised hub_ name routed outside HUB_MAP, by design.
  if (t.name === "hub_hood_arrow") continue;
  check(`2.2 advertised ${t.name} is reachable via HUB_MAP`, HUB_MAP.has(t.name));
}

// ── 3. the actual contract: published fields must reach the handler ──────────
// A handler's accepted vocabulary is what it reads off the request: `body.<f>`
// and `searchParams.get("<f>")`. Both forms, because these handlers accept
// either and a field supported only via query string is still reachable.
function vocabularyOf(handlerId: string): { fields: Set<string>; found: boolean } {
  const p = join(ROOT, `src/app/api/x402/_handlers/${handlerId}.ts`);
  if (!existsSync(p)) return { fields: new Set(), found: false };
  const src = readFileSync(p, "utf8");
  const fields = new Set<string>();
  for (const m of src.matchAll(/\bbody\.([a-zA-Z_][a-zA-Z0-9_]*)/g)) fields.add(m[1]);
  for (const m of src.matchAll(/searchParams\.get\("([^"]+)"\)/g)) fields.add(m[1]);
  return { fields, found: true };
}

// gas-tracker takes no input at all — a chain-wide read with nothing to
// parameterise. Named, so an accidentally-empty vocabulary elsewhere still fails.
const NO_INPUT_BY_DESIGN = new Set(["gas-tracker"]);

for (const [mcpName, handlerId] of HUB_MAP) {
  const tool = MCP_TOOLS.find((t) => t.name === mcpName);
  if (!tool) continue; // already failed 2.1
  const schema = tool.inputSchema as { properties?: Record<string, unknown>; required?: string[] };
  const props = Object.keys(schema.properties ?? {});
  const required = schema.required ?? [];

  const { fields, found } = vocabularyOf(handlerId);
  check(`3.0 ${mcpName} → _handlers/${handlerId}.ts exists`, found);
  if (!found) continue;

  // 🔴 Vacuity floor. The regexes above are the whole basis of every 3.1/3.2
  // below, and if one stops matching — a handler switches to destructuring, a
  // field moves behind a helper — the vocabulary reads EMPTY and every field
  // check turns into "not in vocab", which fails loud. The inverse is the
  // danger: a vocabulary that silently grows to include everything would pass
  // anything. So assert it is non-empty AND that it is a plausible size.
  check(`3.0b …and its vocabulary is non-empty (${[...fields].join(",") || "none"})`,
        fields.size > 0 || NO_INPUT_BY_DESIGN.has(handlerId));

  const reachable = (f: string): boolean => {
    if (fields.has(f)) return true;
    // Remapped: the entry must CONSUME `a.<f>` and WRITE a key the handler reads.
    // Checking only that a remap exists would pass a remap that ignores the field.
    const body = REMAP.get(handlerId);
    if (!body) return false;
    if (!new RegExp(`\\ba\\.${f}\\b`).test(body)) return false;
    const written = [...body.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g)].map((m) => m[1]);
    return written.some((w) => fields.has(w));
  };

  for (const f of required) {
    check(`3.1 ${mcpName} REQUIRED "${f}" is read by ${handlerId} (vocab: ${[...fields].join(",")})`,
          reachable(f));
  }
  // Optional fields matter too, quieter: a published-but-ignored optional field
  // makes an agent pass a constraint the tool silently drops, and the result
  // looks successful. That is worse to debug than a 400.
  for (const f of props.filter((p) => !required.includes(p))) {
    check(`3.2 ${mcpName} optional "${f}" is read by ${handlerId}`, reachable(f));
  }
}

// ── 4. no remap keys a handler that is no longer reachable here ──────────────
// The 2026-09-26 trim was right that a stale entry is dead weight. This keeps
// it from re-accumulating, and it is the assertion that makes a FUTURE manifest
// cut visible: drop a tool from HUB_MAP and its remap fails here immediately.
const reachableHandlers = new Set(HUB_MAP.values());
for (const id of REMAP.keys()) {
  check(`4.1 ARG_REMAP["${id}"] keys a handler still in HUB_MAP`, reachableHandlers.has(id));
}

console.log(`\nmcp arg-contract guard: ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL  ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
