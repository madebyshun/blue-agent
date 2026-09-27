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
 * OUT OF SCOPE for the arg-contract groups (1-4), each for a named reason:
 *   hub_hood_arrow  — reads the arrow feed inline (`callHoodArrow`), not a catalog
 *                     handler, so it has no body-field vocabulary to compare.
 *   b20_encode_*    — calldata builders handled in-route, same reason.
 *   blue_call       — deliberately NOT remapped. It forwards `input` untouched
 *                     because the shape it must match is the one blue_registry
 *                     just published to the agent; see ARG_REMAP's own comment.
 *
 * Group 5 is a SECOND concern in the same file, because it needs the same parsed
 * maps: the free/paid asymmetry at the x402 door. All three names above are in
 * scope there — group 5 asks "does this name reach a paying route", not "do its
 * field names line up". See its own header for the measurement that prompted it.
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

// Two handlers take no input at all: gas-tracker is a chain-wide read with
// nothing to parameterise, and blue-doctor probes a fixed upstream list — a
// diagnostic you have to configure is one more thing to get wrong at the exact
// moment something is already broken. Named one by one, so an accidentally
// empty vocabulary anywhere else still fails loud.
const NO_INPUT_BY_DESIGN = new Set(["gas-tracker", "blue-doctor"]);

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

// ── 5. the bypass asymmetry at the payment door ──────────────────────────────
// `callHubTool` attaches internalX402Headers(); `callPaidTool` deliberately does
// not, and that omission IS the x402 payment path. Unlike everything above it,
// this property is not recoverable by reading a manifest — it lives in which
// helper a dispatch branch happens to call.
//
// 🔴 MEASURED 2026-09-27. The comment block above `callPaidTool` carried this as
// two hand-typed counts — "the 15 preloaded tools" and "the other ~95" — from the
// 2026-09-26 manifest cut onward. 15 was never the size of anything: HUB_MAP held
// TEN entries in the commit that wrote the sentence. It survived because the pair
// was self-consistent (the catalog was 110 that day, 110 − 15 = 95), so each
// number made the other look derived. The counts are gone from that block; these
// are the assertions that replaced them, and they are why it can now name maps
// instead of quantities.
//
// Comments are stripped first: that block cites `internalX402Headers()` in prose,
// so a raw text count of the call site would read 3 and the guard would be
// measuring its own documentation. Whole-line comments only — a line starting
// `//` is never code, while a trailing one might sit beside some.
const codeOnly = routeSrc
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

const consoleMapBlock = codeOnly.match(/const CONSOLE_MAP: Record<string, string> = \{([\s\S]*?)\n\};/);
check("5.0 CONSOLE_MAP block found", !!consoleMapBlock);
const CONSOLE_KEYS = [...(consoleMapBlock?.[1] ?? "").matchAll(/^\s*([a-z0-9_]+):\s*"([a-z0-9-]+)",/gm)]
  .map((m) => m[1]);
check(`5.0b …with at least the 2 console commands (${CONSOLE_KEYS.length})`, CONSOLE_KEYS.length >= 2);

const b20Block = codeOnly.match(/const B20_ENCODE_TOOLS = new Set\(\[([\s\S]*?)\]\)/);
check("5.0c B20_ENCODE_TOOLS block found", !!b20Block);
const B20_KEYS = [...(b20Block?.[1] ?? "").matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
check(`5.0d …with at least 1 encoder (${B20_KEYS.length})`, B20_KEYS.length >= 1);

// Dispatch coverage, both directions. 2.1/2.2 only cover HUB_MAP and hub_* names,
// so a blue_*/b20_* name could still be advertised with no branch (a tool that
// cannot be called at all) or branched with no TOOLS entry (the hidden surface —
// undiscoverable by any client, invocable by any client — that the cut removed).
const branchNames = [...codeOnly.matchAll(/name === "([a-z0-9_]+)"/g)].map((m) => m[1]);
const dispatched = new Set([...HUB_MAP.keys(), ...CONSOLE_KEYS, ...B20_KEYS, ...branchNames]);
for (const name of advertised) {
  check(`5.1 advertised ${name} has a dispatch path`, dispatched.has(name));
}
for (const name of dispatched) {
  check(`5.2 dispatched ${name} is advertised in MCP_TOOLS`, advertised.has(name));
}

const bypassSites = [...codeOnly.matchAll(/internalX402Headers\(/g)].map((m) => m.index ?? 0);
check(`5.3 internalX402Headers has exactly one call site (${bypassSites.length})`, bypassSites.length === 1);
const hubStart = codeOnly.indexOf("async function callHubTool");
const hubEnd = codeOnly.indexOf("async function callConsole");
check(
  "5.4 …and it is inside callHubTool",
  bypassSites.length === 1 && hubStart > 0 && hubEnd > hubStart &&
    bypassSites[0] > hubStart && bypassSites[0] < hubEnd,
);

const paidCalls = [...codeOnly.matchAll(/await callPaidTool\(/g)].map((m) => m.index ?? 0);
check(`5.5 callPaidTool is awaited from exactly one branch (${paidCalls.length})`, paidCalls.length === 1);
// The branch that owns the call is the nearest `name === "…"` before it.
const owner = paidCalls.length === 1
  ? [...codeOnly.slice(0, paidCalls[0]).matchAll(/name === "([a-z0-9_]+)"/g)].pop()?.[1]
  : undefined;
check(`5.6 …and that branch is blue_call (${owner ?? "none"})`, owner === "blue_call");

// 🔴 The payment path in one assertion. Attaching the bypass here would make every
// catalog id free over MCP — a revenue change with no diff anywhere near a price,
// and invisible to every other check in this file. CLAUDE.md records the omission
// as deliberate and as ShunTr's call, not a refactor.
const paidStart = codeOnly.indexOf("async function callPaidTool");
const paidEnd = codeOnly.indexOf("async function postPrepare");
const paidBody = paidStart > 0 && paidEnd > paidStart ? codeOnly.slice(paidStart, paidEnd) : "";
check(`5.7 callPaidTool body located (${paidBody.length} chars)`, paidBody.length > 200);
check(
  "5.8 callPaidTool does NOT attach internalX402Headers",
  paidBody.length > 200 && !paidBody.includes("internalX402Headers"),
);

console.log(`\nmcp arg-contract guard: ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL  ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
