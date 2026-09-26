/**
 * dead-tool-check — is any advertised tool name unreachable, and is any
 * reachable name unadvertised?
 *
 * Written 2026-09-26 after the MCP manifest was cut from 85 tools to 18. The
 * cut repaired 16 plugin skills but missed `agents/blue-agent.md` and the
 * plugin `README.md`, which kept listing 17 names each that resolve to nothing.
 * Nothing in CI disagreed, because nothing was comparing them.
 *
 * The name matters: run-tests.ts discovers `*-test.ts` / `*-check.ts` only. This
 * file was born `dead-tool-audit.ts` and would have sat in the directory looking
 * like a guard while never once executing — the exact failure its own subject
 * matter is about. Do not rename it out of that pattern.
 *
 * "Dead" means something different on each surface, so this checks each against
 * its own definition rather than grepping for names:
 *
 *   A  MCP advertised == MCP callable, BOTH directions. A name in HUB_MAP /
 *      CONSOLE_MAP / B20_ENCODE_TOOLS is tools/call-able even when absent from
 *      TOOLS, so the reverse direction is the one that hides a surface.
 *   B  Every HUB_MAP target is a real catalog id.
 *   C  Catalog parity — CLAUDE.md: a tool is live only if it is in BOTH
 *      HANDLERS and AGENT_TOOLS. An orphan either way is dead or invisible.
 *   D  Plugin docs advertise only names that resolve.
 *   E  Every CONSOLE_MAP target is a real CONSOLE_SYSTEMS key. This one is NOT
 *      redundant with a runtime test: /api/console line 35 is
 *      `command in CONSOLE_SYSTEMS ? command : "idea"`, so a typo'd target does
 *      not 404 — it silently returns an IDEA BRIEF to someone who asked for an
 *      audit. A dead name that still answers 200 is the only kind no user reports.
 *   F  Every toolId published by packages/skill resolves, and dist matches src.
 *      It is a separate npm artifact; nothing about fixing /api/mcp reaches it.
 *   G  Blue Chat's dispatch table, which is a DIFFERENT map in a different file
 *      from B's. Chat is allowed targets that are not catalog ids, so the
 *      invariant is reachability, not membership. See the section for why.
 *
 * Run: npx tsx scripts/dead-tool-check.ts
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MCP_TOOLS } from "../src/lib/mcp-tools";
import { AGENT_TOOLS } from "../src/lib/agent-tools";
import { HANDLERS } from "../src/app/api/x402/_handlers/index";
import { CONSOLE_SYSTEMS } from "../src/lib/console-systems";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(WEB, "..", "..");
const routeSrc = readFileSync(join(WEB, "src/app/api/mcp/route.ts"), "utf8");
const chatSrc = readFileSync(join(WEB, "src/app/api/chat/route.ts"), "utf8");

const fail: string[] = [];
const note = (s: string) => console.log(`   ${s}`);
function check(label: string, bad: string[], detail = "") {
  if (bad.length === 0) console.log(`✅ ${label}`);
  else {
    console.log(`❌ ${label} — ${bad.length}`);
    note(bad.join(" "));
    if (detail) note(detail);
    fail.push(label);
  }
}

// ── parse the dispatch surface out of route.ts ───────────────────────────────
const blockIn = (src: string, file: string) => (start: string, end: string) => {
  const i = src.indexOf(start);
  if (i < 0) throw new Error(`dispatch block not found: ${start} in ${file} — this audit's source moved, which is a loud failure by design`);
  return src.slice(i, src.indexOf(end, i));
};
const block = blockIn(routeSrc, "api/mcp/route.ts");
const chatBlock = blockIn(chatSrc, "api/chat/route.ts");
const keysOf = (src: string) => [...src.matchAll(/^\s{2}([a-z0-9_]+):\s*"/gm)].map((m) => m[1]);

const hubMap = keysOf(block("const HUB_MAP", "};"));
const consoleMap = keysOf(block("const CONSOLE_MAP", "};"));
const b20 = [...block("const B20_ENCODE_TOOLS", "]);").matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
// Tools handled by a bespoke `name === "x"` branch rather than a map.
const explicit = [...routeSrc.matchAll(/name === "([a-z0-9_]+)"/g)].map((m) => m[1]);

const advertised = MCP_TOOLS.map((t) => t.name);
const callable = [...new Set([...hubMap, ...consoleMap, ...b20, ...explicit])];

console.log(`\nMCP: ${advertised.length} advertised · ${callable.length} callable`);
console.log(`Catalog: ${AGENT_TOOLS.length} AGENT_TOOLS · ${Object.keys(HANDLERS).length} HANDLERS\n`);

// ── A. both directions ───────────────────────────────────────────────────────
check(
  "A1 every advertised MCP tool is callable",
  advertised.filter((n) => !callable.includes(n)),
  "advertised but no dispatch branch — returns -32601 to a client that can see it"
);
check(
  "A2 every callable MCP name is advertised (no hidden surface)",
  callable.filter((n) => !advertised.includes(n)),
  "callable via tools/call but absent from tools/list — undiscoverable, still invokable"
);

// ── B. HUB_MAP targets are real catalog ids ──────────────────────────────────
const catalogIds = new Set(AGENT_TOOLS.map((t) => t.id));
const hubTargets = [...block("const HUB_MAP", "};").matchAll(/^\s{2}[a-z0-9_]+:\s*"([a-z0-9-]+)"/gm)].map((m) => m[1]);
check(
  "B  every HUB_MAP target is a real catalog id",
  hubTargets.filter((id) => !catalogIds.has(id) || !(id in HANDLERS))
);

// ── C. catalog parity ────────────────────────────────────────────────────────
const handlerIds = new Set(Object.keys(HANDLERS));
check("C1 no AGENT_TOOLS entry without a handler", [...catalogIds].filter((id) => !handlerIds.has(id)));
check("C2 no handler missing from AGENT_TOOLS", [...handlerIds].filter((id) => !catalogIds.has(id)));

// ── D. plugin docs ───────────────────────────────────────────────────────────
// Prose naming a retired tool is fine and deliberate — each dead name in the
// skills sits in a "There is no `X` any more" note that redirects to blue_call.
// What must not exist is a name PRESENTED AS CALLABLE with no such note.
// This matches English prose, which is unsatisfying but errs in the safe
// direction: an unrecognised phrasing yields a FALSE POSITIVE — a real note gets
// flagged — never a false negative. When that happens the fix is to add the
// phrasing here, a one-line diff someone reads. It is NOT to loosen the matcher
// into something that would also excuse a genuine advertisement; widening this
// to, say, /\bnot\b/ would pass every dead name in the repo.
const RETIRED_NOTE = new RegExp(
  [
    "no longer", "not[a-z ]* any more", "retired", "does not exist", "does not serve",
    "there is no", "never (was|a real)", "was not real", "was the old",
    "resolves to nothing", "Do not invoke", "ship as", "are Skills", "was cut",
    "are \\*\\*not\\*\\*",
  ].join("|"),
  "i"
);
// Every .md under the plugin, discovered — not a list. A hand-written list is
// how this surface got here: the cut repaired the skills one by one and the two
// files nobody thought to open kept 17 dead names each. Discovery means a new
// skill is covered the day it is added, and dropping one is a visible diff.
const walkMd = (dir: string): string[] =>
  readdirSync(join(REPO, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walkMd(join(dir, e.name)) : e.name.endsWith(".md") ? [join(dir, e.name)] : []
  );
const pluginFiles = walkMd("packages/claude-plugin");
// Two shapes count as "presented as callable", and the second is the one that
// actually moves an agent: a backticked name reads as code, but `[Uses X tool]`
// inside an <example> is a demonstration of invocation — the thing the model
// imitates. The frontmatter here carried three dead names in that exact shape,
// and a backticks-only check waved all three through.
const ADVERTISES = [/`((?:blue|hub|b20)_[a-z0-9_]+)`/g, /\[Uses ((?:blue|hub|b20)_[a-z0-9_]+)\b/g];
const pluginBad: string[] = [];
for (const rel of pluginFiles) {
  const txt = readFileSync(join(REPO, rel), "utf8");
  const lines = txt.split("\n");
  for (const [i, line] of lines.entries()) {
    // Allow a name if this line, or the paragraph around it, explains it is gone.
    const ctx = lines.slice(Math.max(0, i - 6), i + 3).join(" ");
    for (const re of ADVERTISES) {
      for (const m of line.matchAll(re)) {
        if (advertised.includes(m[1])) continue;
        if (RETIRED_NOTE.test(ctx)) continue;
        pluginBad.push(`${rel.replace("packages/claude-plugin/", "")}:${i + 1} ${m[1]}`);
      }
    }
    // A doc that redirects to blue_call names a CATALOG id, which has its own
    // way of being dead. Retired notes do not excuse these — the whole point of
    // the redirect is that this id is the live path.
    for (const m of line.matchAll(/toolId:?\s*"([a-z0-9-]+)"/g)) {
      if (!catalogIds.has(m[1]) || !(m[1] in HANDLERS)) {
        pluginBad.push(`${rel.replace("packages/claude-plugin/", "")}:${i + 1} toolId=${m[1]}`);
      }
    }
  }
}
check(`D  plugin docs advertise no unresolvable tool (${pluginFiles.length} files)`, pluginBad);

// ── E. CONSOLE_MAP targets ───────────────────────────────────────────────────
const consoleTargets = [...block("const CONSOLE_MAP", "};").matchAll(/^\s{2}[a-z0-9_]+:\s*"([a-z0-9-]+)"/gm)].map((m) => m[1]);
check(
  "E  every CONSOLE_MAP target is a real console command",
  consoleTargets.filter((c) => !(c in CONSOLE_SYSTEMS)),
  `/api/console falls back to "idea" on an unknown command — a dead target here answers 200 with the wrong product`
);

// ── F. published npm package: packages/skill ─────────────────────────────────
// Its own MCP server, its own tool list, shipped to users as @blueagent/skill.
// Cutting /api/mcp did nothing to it. `dist/` is what npm actually runs, so a
// src-only fix is not a fix — compare both and require they agree.
const skillEntries = (rel: string) => {
  const src = readFileSync(join(REPO, rel), "utf8");
  const names = [...src.matchAll(/name:\s*"((?:blue|hub|b20)_[a-z0-9_]+)"/g)];
  const seen = new Map<string, string | undefined>();
  names.forEach((m, i) => {
    const end = i + 1 < names.length ? names[i + 1].index! : src.length;
    if (!seen.has(m[1])) seen.set(m[1], src.slice(m.index!, end).match(/toolId:\s*"([a-z0-9-]+)"/)?.[1]);
  });
  return seen;
};
const skillSrc = skillEntries("packages/skill/src/index.ts");
const skillDist = skillEntries("packages/skill/dist/index.js");
check(
  "F1 every @blueagent/skill toolId resolves",
  [...skillSrc].filter(([, id]) => id && (!catalogIds.has(id) || !(id in HANDLERS))).map(([n, id]) => `${n}->${id}`)
);
// Compare presence too, not just the toolId: a console command and an absent
// name both read as `undefined` from a Map, so a name dropped from dist would
// otherwise match a console command in src and pass.
const sig = (m: Map<string, string | undefined>, n: string) => (m.has(n) ? m.get(n) ?? "(console)" : "(absent)");
check(
  "F2 @blueagent/skill dist matches src",
  [...new Set([...skillSrc.keys(), ...skillDist.keys()])]
    .filter((n) => sig(skillSrc, n) !== sig(skillDist, n))
    .map((n) => `${n}[src:${sig(skillSrc, n)}|dist:${sig(skillDist, n)}]`),
  "dist/ is what npm runs — a src-only edit ships nothing"
);
console.log(`   (@blueagent/skill: ${skillSrc.size} tools)`);

// ── G. Blue Chat's dispatch table ────────────────────────────────────────────
// Chat dispatches through its own map, TOOL_ENDPOINT, in its own file. Check B
// never saw it: B reads api/mcp/route.ts. Two surfaces, two maps, shared
// handlers — fixing one has never touched the other.
//
// The invariant here is NOT B's. Chat deliberately carries two targets that are
// not catalog ids (`builder-score`, `crypto-rpc`), each rescued by a FREE_DIRECT
// entry naming a free first-party route. Requiring catalog membership would
// demand registering a tool that is intentionally unpriced. What must hold is
// weaker and truer: every dispatchable chat tool reaches something that answers.
//
// LOOKUP ORDER IS THE WHOLE SUBTLETY, and it runs opposite to how the file
// reads. TOOL_ENDPOINT is the ADMISSION GATE — `if (!endpoint) return "[Unknown
// tool]"` fires several lines BEFORE FREE_DIRECT is declared — and FREE_DIRECT
// then only overrides the path for a name already admitted. So the maps do not
// shadow each other, they compose, and both entries for a free tool are
// load-bearing in different ways. G1 and G3 are precisely those two deletions:
// drop `hub_builder_score` from FREE_DIRECT and chat silently falls through to
// /api/x402/builder-score, which answers 501; drop it from TOOL_ENDPOINT and
// chat answers "[Unknown tool: hub_builder_score]" having never read the
// override. Neither deletion fails to compile and neither changes a test today.
const chatEntries = [...chatBlock("const TOOL_ENDPOINT", "};").matchAll(/^\s{2}([a-z0-9_]+):\s*"([a-z0-9-]+)"/gm)];
const freeDirect = [...chatBlock("const FREE_DIRECT", "};").matchAll(/^\s{4}([a-z0-9_]+):\s*"(\/[a-z0-9/-]+)"/gm)];
const freeNames = new Set(freeDirect.map((m) => m[1]));

// Guard the guard. Both regexes are anchored to the indentation of two object
// literals — TOOL_ENDPOINT at module scope, FREE_DIRECT nested inside a function.
// A reformat empties the parse, and G1 then filters nothing and passes. That
// vacuum is the failure mode this entire file is written against.
//
// The two floors differ on purpose. An empty TOOL_ENDPOINT is silent — G1 has
// nothing left to reject — so it needs a real floor. An empty FREE_DIRECT is
// self-announcing, because G1 immediately loses the overrides that are the only
// reason two unregistered targets pass. So FREE_DIRECT is floored at 1, not at
// today's 3: a hardcoded count would fail the day a free tool is legitimately
// promoted into the catalog and its override correctly deleted, which is a
// green-to-red flip on a change that fixed something.
check(
  "G0 both chat dispatch maps parsed — G1-G3 are not vacuous",
  chatEntries.length >= 40 && freeDirect.length >= 1
    ? []
    : [`TOOL_ENDPOINT=${chatEntries.length} FREE_DIRECT=${freeDirect.length}`],
  "a reindent of either literal silently empties the match and passes everything"
);
check(
  "G1 every chat TOOL_ENDPOINT target resolves, or has a FREE_DIRECT override",
  chatEntries
    .filter(([, name, id]) => (!catalogIds.has(id) || !(id in HANDLERS)) && !freeNames.has(name))
    .map(([, name, id]) => `${name}->${id}`),
  "unresolvable id and no override — /api/x402/<id> answers 501 TOOL_UNAVAILABLE"
);
check(
  "G2 every FREE_DIRECT path is a real route on disk",
  freeDirect
    .filter(([, , p]) => !existsSync(join(WEB, "src/app", p, "route.ts")))
    .map(([, name, p]) => `${name}->${p}`),
  "an override only rescues G1 while the route it names exists"
);
check(
  "G3 every FREE_DIRECT name is admitted by TOOL_ENDPOINT",
  freeDirect.filter(([, name]) => !chatEntries.some((e) => e[1] === name)).map(([, name]) => name),
  "TOOL_ENDPOINT gates first — a name absent there returns [Unknown tool] and never reaches its override"
);
console.log(`   (chat: ${chatEntries.length} TOOL_ENDPOINT · ${freeDirect.length} FREE_DIRECT)`);

console.log(
  fail.length === 0
    ? "\n✅ ALL CHECKS PASSED — no dead tool on any checked surface\n"
    : `\n❌ ${fail.length} CHECK(S) FAILED\n`
);
process.exit(fail.length === 0 ? 0 : 1);
