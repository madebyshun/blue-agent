/**
 * A catalog tool id must only produce output by running its implementation.
 *
 * `/api/tool-runner` was retired 2026-09-27 for violating that. It took
 * `{ toolId, input }`, looked the id up in AGENT_TOOLS, and then — instead of
 * dispatching to the handler that id names — built a system prompt out of the
 * catalog entry's own metadata and asked the LLM to improvise:
 *
 *     system: `You are an AI agent assistant. Run the "${tool.name}" skill.
 *              ${tool.description}`
 *
 * So it answered for all 115 ids while reading none of the data sources any of
 * them are built on. Its sibling `/api/x402/<id>` served the same ids from
 * DexScreener, DefiLlama, Moralis and Base RPC, for $0.05–$1.00. A caller could
 * not tell the two apart from the response: same id, same tool name, one of
 * them invented. That is CLAUDE.md's tool-quality rule stated as a mechanism —
 * "a tool with no real data source WILL fabricate, no matter how good the
 * prompt is" — and the route was the mechanism.
 *
 * Two details worth keeping, because both argue against a narrower guard:
 *
 *   • It had a grounded branch, and the branch was DEAD. `runSingleTool` began
 *     `if (tool.agentType === "blue" && tool.skillFiles)`, which reads as "most
 *     tools are grounded, a few improvise". Measured at deletion: `skillFiles`
 *     appeared in agent-tools.ts exactly twice, both in TYPE DECLARATIONS, and
 *     zero of 115 entries set it. The guarded path could never execute. Reading
 *     the file honestly required running the data, not reading the branch.
 *
 *   • Nothing caught it for 123 days. `git log` said "touched today" — three
 *     mechanical sweeps (maxDuration 2026-06-09, callLLM migration 2026-07-20,
 *     the Aeon/MiroShark retirement hours before deletion) had walked through
 *     it. Its last FEATURE commit was 2026-05-27. This is the Blue Sentinel
 *     pattern exactly, and it is why CLAUDE.md says a commit date is not
 *     evidence a surface is alive.
 *
 * WHAT THIS ASSERTS, AND WHAT IT DELIBERATELY DOES NOT
 * ----------------------------------------------------
 * It asserts PROVENANCE, not metering: a file that reaches for AGENT_TOOLS and
 * an LLM in the same breath must delegate to the real implementation rather
 * than synthesize. It does not assert that such a route charges, because the
 * repo has a deliberate free surface — every /api/mcp tool except `blue_call`
 * runs on the internal bypass by design. A metering assertion would have to
 * exempt MCP, and an exemption list is what hid the last one of these: the
 * second x402 door was IN x402-payee-check.ts, under a heading naming its own
 * defect, and being listed read as having been reviewed.
 *
 * Which is also why this is a property and not a path. Restoring the deleted
 * file verbatim at any path under src/app/api/ trips it, because what trips it
 * is the shape — catalog + LLM + no delegation — and the only way to satisfy
 * the rule is to actually dispatch, which is the fix rather than an evasion.
 * Moving it under api/x402/ satisfies it honestly: that directory IS the door.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import * as path from "node:path";

const WEB = path.resolve(path.dirname(process.argv[1]), "..");
const SRC = path.join(WEB, "src");
const API = path.join(SRC, "app/api");

let failures = 0;
let checks = 0;

function check(label: string, ok: boolean, detail: string) {
  checks++;
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        ${detail}`}`);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") walk(p, out); }
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * Drop comments, keep string and template bodies.
 *
 * Comments have to go or this file's own prose would trip it, and so would the
 * header of any route that explains why it does NOT do this. Strings have to
 * stay: a dispatcher that builds its target URL as `/api/x402/${id}` is
 * delegating, and that evidence lives inside a template literal.
 */
function stripComments(s: string): string {
  let out = "", i = 0;
  let mode: "code" | "line" | "block" | "sq" | "dq" | "tpl" = "code";
  while (i < s.length) {
    const c = s[i], n = s[i + 1];
    if (mode === "code") {
      if (c === "/" && n === "/") { mode = "line"; i += 2; continue; }
      if (c === "/" && n === "*") { mode = "block"; i += 2; continue; }
      if (c === "'") mode = "sq"; else if (c === '"') mode = "dq"; else if (c === "`") mode = "tpl";
      out += c; i++; continue;
    }
    if (mode === "line")  { if (c === "\n") { mode = "code"; out += c; } i++; continue; }
    if (mode === "block") { if (c === "*" && n === "/") { mode = "code"; i += 2; } else { if (c === "\n") out += c; i++; } continue; }
    if (c === "\\") { out += c + (n ?? ""); i += 2; continue; }
    if ((mode === "sq" && c === "'") || (mode === "dq" && c === '"') || (mode === "tpl" && c === "`")) mode = "code";
    out += c; i++;
  }
  return out;
}

/**
 * Every synthesis entrypoint in api/_lib/llm.ts. NOT the catalog/probe/preset
 * readers (getVirtualsCatalog, probeVirtuals, getAvailablePresets…) — those
 * return model lists, they do not generate prose, so a route using one is not
 * answering anything on the catalog's behalf.
 *
 * callBankrLLM and callVeniceLLM are listed despite naming vendors this repo no
 * longer uses: both are live shims delegating to callVirtualsLLM, and the
 * deleted route reached the LLM through exactly one of them (runBlueSkill →
 * callBankrLLM). Dropping the legacy names because "Bankr is gone" would have
 * opened the hole this guard exists to close.
 */
const SYNTHESIZES =
  /\b(callLLM|callVirtualsLLM|callBankrLLM|callVeniceLLM|runBlueSkill|runAeonSkill|runMiroSharkSkill)\s*\(/;

/** Evidence the file hands the id to its real implementation instead of answering itself. */
const DELEGATES = /\bHANDLERS\b|\binternalX402Headers\b/;

const READS_CATALOG = /\bAGENT_TOOLS\b/;

/**
 * `relPath` is relative to src/app/api. Split out from the walk so the fixtures
 * at the bottom can run the real predicate rather than a paraphrase of it — a
 * self-test against a reworded copy of the rule proves only that the copy works.
 */
function synthesizesFromCatalog(relPath: string, rawSrc: string): boolean {
  const src = stripComments(rawSrc);
  return (
    READS_CATALOG.test(src) &&
    SYNTHESIZES.test(src) &&
    // Files under api/x402/ ARE the implementation — a handler composing other
    // handlers (blue-compose, blue-monitor) is the intended shape, and the
    // whole directory sits behind the paid door by construction.
    !relPath.startsWith("x402" + path.sep) &&
    !DELEGATES.test(src)
  );
}

console.log("A catalog tool id may only be answered by its implementation\n");

const files = walk(API).map((f) => ({
  f,
  rel: path.relative(API, f),
  src: stripComments(readFileSync(f, "utf8")),
}));

const offenders = files.filter(({ rel, f }) =>
  synthesizesFromCatalog(rel, readFileSync(f, "utf8")),
);

check(
  "no route outside api/x402 turns an AGENT_TOOLS entry into LLM output itself",
  offenders.length === 0,
  offenders.map((o) => path.relative(WEB, o.f)).join("\n        ") +
    "\n        Dispatch to the id's handler (HANDLERS, or fetch /api/x402/<id>" +
    "\n        with internalX402Headers) instead of prompting from tool metadata.",
);

// ── the pairing ─────────────────────────────────────────────────────────────
// The steady state of the rule above is ZERO offenders, which is also what it
// reports if the walk path is wrong or either pattern has rotted. A passing
// absence proves nothing on its own, so the two halves of the predicate are
// asserted to still match real code independently, and then the whole predicate
// is run against the shape it was written for.

const readsCatalog = files.filter((x) => READS_CATALOG.test(x.src)).length;
const callsLlm     = files.filter((x) => SYNTHESIZES.test(x.src)).length;
console.log(
  `\n  scanned ${files.length} files under src/app/api — ` +
    `${readsCatalog} read AGENT_TOOLS, ${callsLlm} call a synthesis entrypoint\n`,
);

check(
  "both halves of the predicate still match real code",
  files.length > 100 && readsCatalog >= 6 && callsLlm >= 20,
  `walked ${files.length} files: ${readsCatalog} catalog readers, ${callsLlm} LLM callers. ` +
    "A collapse here means the walk path or a pattern broke — the empty result " +
    "above would then be silence, not safety.",
);

// The deleted route, reduced to the four things that made it wrong. If this
// stops tripping, the rule has stopped covering the case it was written for.
const DELETED_SHAPE = `
  import { callLLM } from "@/app/api/_lib/llm";
  import { AGENT_TOOLS } from "@/lib/agent-tools";
  export async function POST(req: NextRequest) {
    const tool = AGENT_TOOLS.find(t => t.id === toolId);
    const r = await callLLM({
      system: \`You are an AI agent assistant. Run the "\${tool.name}" skill. \${tool.description}\`,
      messages: [{ role: "user", content: userInput }],
    });
    return NextResponse.json({ result: r.text });
  }`;

// The near-miss that must stay legal: same ingredients, but it dispatches.
// Without this the rule is satisfiable by banning AGENT_TOOLS near an LLM
// outright, which would outlaw /api/chat and the MCP door.
const DELEGATING_SHAPE = `
  import { callLLM } from "@/app/api/_lib/llm";
  import { AGENT_TOOLS } from "@/lib/agent-tools";
  import { HANDLERS } from "@/app/api/x402/_handlers";
  export async function POST(req: NextRequest) {
    const tool = AGENT_TOOLS.find(t => t.id === toolId);
    const out = await HANDLERS[tool.id](input);
    const r = await callLLM({ system: "summarise this tool output", messages: [] });
    return NextResponse.json({ out, summary: r.text });
  }`;

check(
  "the rule still trips on the shape it was written for",
  synthesizesFromCatalog("tool-runner/route.ts", DELETED_SHAPE),
  "a fixture reproducing the retired /api/tool-runner no longer matches — " +
    "the predicate has drifted off the case it exists to catch",
);

check(
  "…and still permits a route that dispatches instead of improvising",
  !synthesizesFromCatalog("some-route/route.ts", DELEGATING_SHAPE),
  "a route that reads the catalog, calls a handler, and summarises the REAL " +
    "output is the intended shape; banning it would outlaw /api/chat",
);

const door = path.join(API, "x402/[tool]/route.ts");
check(
  "the real door still exists for a caller to be sent to",
  existsSync(door) && /\bHANDLERS\b/.test(readFileSync(door, "utf8")),
  "api/x402/[tool]/route.ts is the implementation every id resolves to; " +
    "without it 'delegate instead of synthesize' has no target",
);

console.log("");
if (failures > 0) {
  console.log(`${failures} of ${checks} CHECK(S) FAILED`);
  process.exit(1);
}
console.log(`ALL ${checks} CHECKS PASSED`);
