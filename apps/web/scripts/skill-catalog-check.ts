/**
 * SKILL.md's tool catalog is GENERATED from AGENT_TOOLS, and CI proves it.
 *
 * WHY THIS EXISTS
 * ---------------
 * SKILL.md is the agent-facing brief: another agent reads it to decide what
 * Blue Agent can do and what to POST. It has been wrong twice, in opposite
 * directions, and both failures came from the same missing mechanism.
 *
 *   2026-09-17 — it advertised 32 tool ids while the catalog held 111, and 20
 *   of the 32 had NEVER existed in either HANDLERS or AGENT_TOOLS. Four were
 *   priced $1.50–$3.00. The reader it misled was a machine, which cannot shrug
 *   and click something else.
 *
 *   The fix then was to DELETE the list and link `/api/catalog` instead — "the
 *   catalog changes when a tool ships; a hand-typed copy does not." Correct
 *   about hand-typed copies, and it stopped the bleeding. But it left the brief
 *   with no tools in it, so the one question a reading agent has ("which tool,
 *   and what do I send it?") needed a second HTTP call the file could not make
 *   on its behalf.
 *
 * A generated list is the resolution: it cannot go stale, because this check
 * regenerates it from source and fails on any difference. The old rule — "link
 * the catalog, do not retype it" — becomes "do not RETYPE it; generating it is
 * how it stays true."
 *
 * MEASURED 2026-09-24, and the reason this generates the WIRE shape rather than
 * the form: `/api/catalog` had been publishing `inputs[].key`, which is the Hub
 * form. For 18 of 111 tools x402Body translates the form into different field
 * names, so an agent that POSTed exactly what the catalog specified got every
 * field ignored and paid anyway. See lib/tool-wire-schema.ts.
 *
 * WHAT IT CHECKS
 * --------------
 * 1. The generated block in SKILL.md is byte-identical to what AGENT_TOOLS
 *    produces right now. `--write` regenerates it.
 * 2. Every field this brief tells an agent to send is a field the handler
 *    actually reads. This is the check that would have caught
 *    `token-momentum-scanner` (published "Timeframe"/"Filter"; handler reads
 *    only `min_mcap`) and `ecosystem-digest` (handler takes no `req` at all,
 *    yet a "Focus area" box was advertised) at the time they were written,
 *    instead of two years later.
 * 3. Guard-the-guard: the markers must still be found and the catalog must be
 *    non-empty, so a rename or a bad edit fails loudly rather than passing
 *    vacuously over an empty list.
 *
 * WHAT IT DOES NOT CHECK, DELIBERATELY
 * ------------------------------------
 * Prices and ids are not cross-checked against the live site. This runs on
 * source, offline, in CI. `docs-truth-check.ts` owns the published-number
 * invariants; duplicating them here would mean two places to update and a
 * network dependency in a check that does not need one.
 *
 * Run:  npx tsx scripts/skill-catalog-check.ts          (check — CI does this)
 *       npx tsx scripts/skill-catalog-check.ts --write  (regenerate SKILL.md)
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { AGENT_TOOLS } from "../src/lib/agent-tools";
import { wireSchema }  from "../src/lib/tool-wire-schema";

const WEB      = path.resolve(path.dirname(path.resolve(process.argv[1])), "..");
const REPO     = path.resolve(WEB, "../..");
const SKILL_MD = path.join(REPO, "SKILL.md");
const HANDLERS = path.join(WEB, "src/app/api/x402/_handlers");

const BEGIN = "<!-- BEGIN GENERATED TOOL CATALOG";
const END   = "<!-- END GENERATED TOOL CATALOG -->";

const WRITE = process.argv.includes("--write");

let failures = 0;
let checks   = 0;
function check(name: string, cond: boolean, detail = "") {
  checks++;
  if (cond) console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

// ── Which body fields does a handler actually read? ──────────────────────────
// Source-reading, and deliberately over-inclusive: it collects `body.x`,
// destructured `const { x } = body`, and `searchParams.get("x")`. A false
// POSITIVE here weakens the check; a false NEGATIVE would fail CI on a correct
// tool. Erring toward "reads it" keeps the check quiet unless nothing matches
// at all, which is the failure that actually costs a caller money.
function handlerReads(id: string): Set<string> | null {
  const file = path.join(HANDLERS, `${id}.ts`);
  if (!existsSync(file)) return null;
  const src  = readFileSync(file, "utf8");
  const read = new Set<string>();
  for (const m of src.matchAll(/body(?:\?)?\.([a-zA-Z_][\w]*)/g)) read.add(m[1]);
  for (const m of src.matchAll(/const\s*\{([^}]*)\}\s*=\s*body/g))
    for (const part of m[1].split(",")) {
      const k = part.split(/[:=]/)[0].trim();
      if (k) read.add(k);
    }
  for (const m of src.matchAll(/searchParams\.get\("([^"]+)"\)/g)) read.add(m[1]);
  return read;
}

// ── Render ───────────────────────────────────────────────────────────────────
const LIVE = AGENT_TOOLS.filter((t) => t.x402Url);

function renderBody(toolId: string): string {
  const { fields } = wireSchema(AGENT_TOOLS.find((t) => t.id === toolId)!);
  if (!fields.length) return "_(no body)_";
  return fields
    .map((f) => (f.required ? `\`${f.name}\`*` : `\`${f.name}\``))
    .join(" ");
}

function render(): string {
  const byCategory = new Map<string, typeof LIVE>();
  for (const t of LIVE) {
    byCategory.set(t.category, [...(byCategory.get(t.category) ?? []), t]);
  }

  // First-appearance order, NOT alphabetical. Two reasons: it is the order the
  // catalog and the Hub already present, and docs-truth-check.ts pins the
  // "Categories: …" sentence below in exactly this order. Sorting here would
  // leave that pin describing a different file than the one we ship.
  const out: string[] = [];
  out.push(
    `${BEGIN} — apps/web/scripts/skill-catalog-check.ts --write`,
    "     Do not edit inside this block by hand; CI regenerates and diffs it.",
    "     Source of truth: apps/web/src/lib/agent-tools.ts (AGENT_TOOLS).",
    "     Body fields are the WIRE shape (post-x402Body), not the Hub form. -->",
    "",
    `Blue Hub exposes **${LIVE.length} paid tools** across ${byCategory.size} categories.`,
    "",
    `Categories: ${[...byCategory.keys()].join(" · ")}`,
    "",
    "`POST https://blueagent.dev/api/x402/{id}` · x402 v2 · `eip155:8453` ·",
    "USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`. Fields marked `*` are required;",
    "every other field has a server-side default. Machine-readable equivalent, with",
    "full JSON Schema per tool: https://blueagent.dev/api/catalog",
    "",
  );

  for (const category of byCategory.keys()) {
    const tools = byCategory.get(category)!.slice().sort((a, b) => a.id.localeCompare(b.id));
    out.push(`### ${category} (${tools.length})`, "");
    out.push("| id | price | body | what it does |", "|---|---|---|---|");
    for (const t of tools) {
      const desc = t.description.replace(/\|/g, "\\|").trim();
      out.push(`| \`${t.id}\` | ${t.price ?? "—"} | ${renderBody(t.id)} | ${desc} |`);
    }
    out.push("");
  }

  out.push(END);
  return out.join("\n");
}

// ── 3. Guard the guard (first — everything below is vacuous without it) ──────
console.log("\n1. generator has something to generate");
check("AGENT_TOOLS has live x402 tools", LIVE.length >= 50, `${LIVE.length} tools`);
check("SKILL.md exists", existsSync(SKILL_MD), SKILL_MD.replace(REPO + "/", ""));

const current = existsSync(SKILL_MD) ? readFileSync(SKILL_MD, "utf8") : "";
const start   = current.indexOf(BEGIN);
const stop    = current.indexOf(END);
check(
  "SKILL.md carries the generated-block markers",
  start !== -1 && stop !== -1 && stop > start,
  start === -1 ? `missing "${BEGIN}"` : stop === -1 ? `missing "${END}"` : "both found",
);

// ── 1. The block matches what the catalog produces right now ─────────────────
console.log("\n2. generated block is in sync with AGENT_TOOLS");
const block = render();

if (WRITE) {
  if (start === -1 || stop === -1) {
    console.log("\n  Cannot --write: markers not found in SKILL.md. Add them first:\n");
    console.log(`  ${BEGIN} ... -->\n  ${END}\n`);
    process.exit(1);
  }
  const next = current.slice(0, start) + block + current.slice(stop + END.length);
  if (next === current) console.log("  SKILL.md already up to date.");
  else { writeFileSync(SKILL_MD, next); console.log(`  WROTE SKILL.md — ${LIVE.length} tools.`); }
} else {
  const found = start !== -1 && stop !== -1 ? current.slice(start, stop + END.length) : "";
  check(
    "SKILL.md block matches the generator byte for byte",
    found === block,
    found === block ? `${LIVE.length} tools in sync` : "stale — run: npx tsx scripts/skill-catalog-check.ts --write",
  );
}

// ── 2. Every advertised field is a field the handler reads ───────────────────
console.log("\n3. every advertised body field reaches its handler");
const deaf: string[] = [];
const missing: string[] = [];
for (const t of LIVE) {
  const fields = wireSchema(t).fields.map((f) => f.name);
  if (!fields.length) continue;              // no-input tools advertise nothing
  const read = handlerReads(t.id);
  if (read === null) { missing.push(t.id); continue; }
  // Only a TOTAL miss fails. A handler that reads 3 of 4 fields is doing
  // something with the call; a handler that reads none of them cannot be.
  if (!fields.some((f) => read.has(f))) deaf.push(`${t.id} sends[${fields.join(",")}]`);
}
check(
  "no tool advertises a body its handler cannot read",
  deaf.length === 0,
  deaf.length ? `callers would pay for an empty run: ${deaf.join("; ")}` : `${LIVE.length} tools checked`,
);
check(
  "every live tool has a handler file to check against",
  missing.length === 0,
  missing.length ? `no _handlers/<id>.ts: ${missing.join(", ")}` : "all resolved",
);

console.log(
  failures === 0
    ? `\nALL ${checks} CHECKS PASSED\n`
    : `\n${failures} of ${checks} CHECK(S) FAILED\n`,
);
process.exit(failures === 0 ? 0 : 1);
