/**
 * Docs truth — the numbers we publish are the numbers we measure.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every tool count on a public surface was hand-typed and then left behind.
 * At the time this was written the repo simultaneously told the world it had
 * 30+, 34, 69, 74 and 112 tools — README, llms.txt, plugin.md and the two
 * farcaster manifests each froze whatever the total happened to be the day
 * someone touched them. The real number is `TOOL_COUNT`, and it moves every
 * time a tool ships.
 *
 * Server-rendered TS can just interpolate `${TOOL_COUNT}`, and the route in
 * group 3 does. Static files cannot — a .md, .txt or .json served straight
 * off disk has no way to read a TypeScript constant. So they get the next
 * best thing: the number is written once and pinned here, which turns an
 * unowned literal into one CI compares against the source of truth.
 *
 * WHAT IT CHECKS
 * --------------
 * 1. Pinned sentences — each must appear VERBATIM, with the count (and the
 *    category list) built from the live catalog. Exact-match, because a
 *    reworded sentence should fail loudly rather than silently stop being
 *    covered.
 * 2. Scanner — anything shaped like "<n> … tools" must still be true. A bare
 *    "112 tools" must equal TOOL_COUNT; a floor claim like "100+ tools" only
 *    has to stay <= TOOL_COUNT, which is what makes it a cheap honest option
 *    for a page that should not import the catalog at all (see group 3).
 *    This is the net for claims added later that group 1 does not know about.
 *    It is deliberately narrow — only word characters, spaces and hyphens may
 *    sit between the digits and "tools" — so chain ids like "Robinhood Chain
 *    (4663) — the `rh-*` tools" are not misread as counts.
 * 3. Where the number may be derived, and where deriving it costs too much.
 *    `agent-tools.ts` is the whole 112-entry catalog; importing it into a
 *    "use client" tree pulls all of it into that page's bundle. Measured on
 *    this branch: doing so added 16 kB gzipped to First Load on BOTH
 *    /waitlist (106 → 122 kB) and /app/dashboard (527 → 543 kB), to render
 *    one decorative number. So the server route derives, and the two client
 *    pages are held to a floor claim or no claim at all.
 * 4. The Blue Hood cron table is pinned to vercel.json. Three of its
 *    schedules had drifted from the deployed value and two jobs were missing
 *    from the table entirely, so the doc described a cadence nothing ran at.
 * 5. The retired "3-agent consensus" claim stays retired.
 *
 * NOT EVERY COUNT IN THE REPO IS TOOL_COUNT, and this check deliberately does
 * not sweep for them. The MCP surface is a curated subset, the skill bundle
 * ships a different set again, and the on-chain ToolRegistry holds more than
 * this catalog. A blanket sync-everything-to-TOOL_COUNT would replace stale
 * numbers with wrong ones. Hence a whitelist — and, for the files that must
 * legitimately quote a second surface, the alternate is DERIVED from that
 * surface (see `MCP_COUNT`) rather than exempted. An exemption stops checking;
 * a derivation keeps checking against a different source of truth.
 *
 * 6. SKILL.md names no tool ids. MEASURED 2026-09-17: it advertised 32 tools
 *    while the catalog held 111, and 20 of the 32 ids had NEVER existed in
 *    either HANDLERS or AGENT_TOOLS — four of them priced $1.50–$3.00, and one
 *    real tool listed at a quarter of its actual price. It is the agent-facing
 *    brief, so the reader it misled was another agent, which cannot shrug and
 *    click something else. The fix was structural: link the generated catalog
 *    instead of retyping it. Group 6 keeps the retyped list from coming back,
 *    and — because an absence assertion alone would pass by deleting the whole
 *    file — pairs it with a presence assertion on the catalog URL.
 * 7. Every /api/x402/<id> named in a doc resolves to a real tool. This is the
 *    check that would have caught the 20 at the time they were written.
 * 8. The two PUBLISHED npm packages are held to the same catalog. Group 6 fixed
 *    the markdown; the same fiction was also shipping on npm. MEASURED
 *    2026-09-18: @blueagent/skill 0.4.0 carried 7 toolIds that resolve to
 *    neither HANDLERS nor AGENT_TOOLS, and @blueagent/agentkit 1.2.0 carried 20
 *    — the identical NEVER_EXISTED set, so the .md and the package were copying
 *    the same imaginary source. agentkit also understated 7 of its 12 real
 *    prices (risk_gate 4× low, key_exposure 5× low) and posted every call to
 *    `/api/tools/{id}`, a path that has never existed on any branch and 404s,
 *    which means not one of its 32 actions could ever run. A package is the
 *    worst place for this: the reader is an agent executing the call, and a
 *    stale .md at least has a human in front of it.
 *
 * Run: npx tsx scripts/docs-truth-check.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { AGENT_TOOLS, TOOL_COUNT } from "../src/lib/agent-tools";

const WEB = join(__dirname, "..");
const REPO = join(__dirname, "..", "..", ".."); // scripts → web → apps → repo root
const read = (p: string) => readFileSync(join(WEB, p), "utf8");
const readRepo = (p: string) => readFileSync(join(REPO, p), "utf8");

let failures = 0;
/** Counted, never hardcoded — a hand-maintained total goes stale the first
 *  time someone adds a check and forgets to bump it. */
let checks = 0;

function check(name: string, cond: boolean, detail = "") {
  checks++;
  if (cond) {
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// Order matters: the README prints the categories as a list, so this pins the
// names and their order too, not merely how many there are.
const CATEGORIES = [...new Set(AGENT_TOOLS.map((t) => t.category))];

const README = readRepo("README.md");
const LLMS = read("public/llms.txt");
const PLUGIN = read("public/plugin.md");
const FARCASTER_STATIC = read("public/.well-known/farcaster.json");
const WAITLIST = read("src/app/waitlist/page.tsx");
const OVERVIEW = read("src/app/app/dashboard/_views/OverviewView.tsx");
const FARCASTER_ROUTE = read("src/app/.well-known/farcaster.json/route.ts");
const SKILL = readRepo("SKILL.md");
const CLAUDE_MD = readRepo("CLAUDE.md");
const MCP_ROUTE = read("src/app/api/mcp/route.ts");

// ── the MCP surface, measured from the route rather than remembered ───────
// SKILL.md and CLAUDE.md both quote this number, and it is NOT TOOL_COUNT.
// Deriving it here means those two files stay pinned to something real
// instead of being waved through by an exemption. The route header itself
// said 87 for months while the array held 86 — off by one, and nothing in CI
// disagreed, because nothing was comparing them.
const mcpNames = [
  ...new Set(
    [...MCP_ROUTE.matchAll(/name: "((?:blue|hub|b20)_[a-z0-9_]+)"/g)].map((m) => m[1]),
  ),
];
const MCP_COUNT = mcpNames.length;
const mcpPrefix = (p: string) => mcpNames.filter((n) => n.startsWith(`${p}_`)).length;

/** `skills/` ships grounding files; README.md there is an index, not a skill. */
const SKILL_FILES = readdirSync(join(REPO, "skills")).filter(
  (f) => f.endsWith(".md") && f !== "README.md",
);

// ── 1. the pinned sentences ───────────────────────────────────────────────
console.log(`\n1. published counts equal TOOL_COUNT (${TOOL_COUNT})`);
const pinned: [string, string, string][] = [
  ["README heading", README, `## Blue Hub — ${TOOL_COUNT} AI Tools on Base`],
  ["README lead", README, `marketplace of ${TOOL_COUNT} pay-per-call AI tools`],
  [
    "README category line",
    README,
    `**${TOOL_COUNT} tools across ${CATEGORIES.length} categories** — ${CATEGORIES.join(" · ")}`,
  ],
  ["README chat section", README, `all ${TOOL_COUNT} Hub tools`],
  ["README cli example", README, `# list all ${TOOL_COUNT} tools`],
  ["llms.txt", LLMS, `Blue Hub exposes ${TOOL_COUNT} paid tools.`],
  ["plugin.md", PLUGIN, `${TOOL_COUNT} AI tools for Base builders`],
  ["farcaster.json (static copy)", FARCASTER_STATIC, `"${TOOL_COUNT} AI tools.`],
  // SKILL.md is the agent-facing brief — the one that was 79 tools stale.
  ["SKILL.md catalog line", SKILL, `Blue Hub exposes **${TOOL_COUNT} paid tools** across ${CATEGORIES.length} categories.`],
  ["SKILL.md category list", SKILL, `Categories: ${CATEGORIES.join(" · ")}`],
  [
    "SKILL.md MCP line",
    SKILL,
    `MCP serves ${MCP_COUNT} tools — ${mcpPrefix("blue")} \`blue_\` + ${mcpPrefix("hub")} \`hub_\` + ${mcpPrefix("b20")} \`b20_\`.`,
  ],
  ["SKILL.md grounding-file count", SKILL, `${SKILL_FILES.length} grounding files live in \`skills/\``],
  // The MCP route's own header. Pinned because it drifted by one, unnoticed.
  [
    "mcp/route.ts header",
    MCP_ROUTE,
    `Tools: ${MCP_COUNT} — ${mcpPrefix("blue")} blue_* + ${mcpPrefix("hub")} hub_* + ${mcpPrefix("b20")} b20_*`,
  ],
  // CLAUDE.md is what every future session reads first; a stale number there
  // propagates into work before anyone thinks to measure.
  [
    "CLAUDE.md MCP line",
    CLAUDE_MD,
    `\`/api/mcp\` serves **${MCP_COUNT}** (${mcpPrefix("blue")} \`blue_\` + ${mcpPrefix("hub")} \`hub_\` + ${mcpPrefix("b20")} \`b20_\`)`,
  ],
];
for (const [name, haystack, needle] of pinned) {
  check(name, haystack.includes(needle), `expected "${needle}"`);
}
for (const [name, src] of [
  ["README", README],
  ["SKILL.md", SKILL],
  ["CLAUDE.md", CLAUDE_MD],
  ["mcp/route.ts", MCP_ROUTE],
] as const) {
  check(
    `${name} names the script that pins it`,
    src.includes("apps/web/scripts/docs-truth-check.ts"),
    "a reader who edits the number needs to know what will stop them",
  );
}

// ── 2. the scanner, for claims added after this whitelist ─────────────────
console.log("\n2. every '<n> … tools' claim is still true");
// Negative lookbehind/lookahead on a dot keeps version strings ("0.1.0") out.
// `x` is in the lookbehind because "## x402 Tools" otherwise reads as a claim of
// 402 tools — found the first time SKILL.md was scanned, and it would have fired
// on any file carrying that heading.
const COUNT_RE = /(?<![\d.xX])(\d+)(\+?)(?![\d.])(?=[\w -]{0,24}?\btools\b)/gi;
/** "111 tools" must be exact. "100+ tools" is a floor — true while we have at
 *  least that many, which is the point of writing it that way.
 *
 *  `alts` is for files that legitimately describe a DIFFERENT surface in the
 *  same breath — SKILL.md and CLAUDE.md both explain how the MCP subset
 *  relates to the catalog, and refusing them that sentence would push the
 *  explanation out of the two documents that most need it. Every alternate is
 *  itself derived from the surface it names (MCP_COUNT is counted out of
 *  mcp/route.ts), so this widens what is true, not what goes unchecked. */
const claimHolds = (n: number, plus: boolean, alts: number[] = []) =>
  (plus ? TOOL_COUNT >= n : TOOL_COUNT === n) || (!plus && alts.includes(n));

const scanned: [string, string, number[]?][] = [
  ["README.md", README],
  ["public/llms.txt", LLMS],
  ["public/plugin.md", PLUGIN],
  ["public/.well-known/farcaster.json", FARCASTER_STATIC],
  ["src/app/waitlist/page.tsx", WAITLIST],
  ["src/app/app/dashboard/_views/OverviewView.tsx", OVERVIEW],
  ["SKILL.md", SKILL, [MCP_COUNT]],
  ["CLAUDE.md", CLAUDE_MD, [MCP_COUNT]],
];
let scannedClaims = 0;
for (const [name, text, alts] of scanned) {
  const bad: string[] = [];
  text.split("\n").forEach((line, i) => {
    COUNT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = COUNT_RE.exec(line))) {
      scannedClaims++;
      if (!claimHolds(Number(m[1]), m[2] === "+", alts)) {
        bad.push(`L${i + 1}: ${m[1]}${m[2]} — ${line.trim().slice(0, 70)}`);
      }
    }
  });
  check(`${name}`, bad.length === 0, bad.join(" | ") || "all claims hold");
}
// The floor is DERIVED, not typed: count the pinned sentences that are
// themselves "<n> … tools" shaped, since only those are guaranteed to be
// visible to the scanner. Group 1 also pins category lists and other-surface
// counts, which are not count-shaped — comparing against `pinned.length`
// made this fire the moment those were added, for no real reason.
COUNT_RE.lastIndex = 0;
const countShapedPins = pinned.filter(([, , needle]) => {
  COUNT_RE.lastIndex = 0;
  return COUNT_RE.test(needle);
}).length;
check(
  "the scanner actually found claims to check",
  scannedClaims >= countShapedPins,
  `${scannedClaims} matched vs ${countShapedPins} count-shaped pins — a regex that silently stops matching passes vacuously`,
);

// ── 3. derived where it is free, floor-claimed where it is not ────────────
console.log("\n3. TOOL_COUNT is imported only where it costs nothing to ship");
// Comments are stripped before the literal scan: the farcaster route's header
// quotes the retired "stale 69" to explain what was removed, and a bare
// substring test would read that explanation as the bug itself.
const stripComments = (src: string) =>
  src
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
    })
    .join("\n");

const routeCode = stripComments(FARCASTER_ROUTE);
check("farcaster route imports TOOL_COUNT", /TOOL_COUNT/.test(routeCode));
COUNT_RE.lastIndex = 0;
check("farcaster route has no hardcoded count", !COUNT_RE.test(routeCode));
check(
  "the farcaster route explains why a second copy exists",
  FARCASTER_ROUTE.includes("docs-truth-check.ts"),
  "the two paths collide; whoever finds that needs to know which one is pinned",
);

// The bundle cost is the whole reason these two are held to group 2 instead.
// Re-adding the import is the regression this guards.
for (const [name, src] of [
  ["src/app/waitlist/page.tsx", WAITLIST],
  ["src/app/app/dashboard/_views/OverviewView.tsx", OVERVIEW],
] as const) {
  const code = stripComments(src);
  check(
    `${name} does not pull the catalog into its client bundle`,
    !/from "@\/lib\/agent-tools"/.test(code),
    "measured +16 kB gzipped First Load; use a floor claim or no number",
  );
}

// ── 4. the cron table is the deployed schedule ────────────────────────────
console.log("\n4. docs/blue-hood/crons.md matches vercel.json");
const vercel = JSON.parse(read("vercel.json")) as { crons?: { path: string; schedule: string }[] };
const deployed = new Map((vercel.crons ?? []).map((c) => [c.path, c.schedule]));
const cronsDoc = readRepo("docs/blue-hood/crons.md");
// Only the Vercel Cron section — the manual-only table below it lists paths
// that deliberately have no schedule, and must not be read as missing rows.
const section = cronsDoc.split("## Automatic (Vercel Cron)")[1]?.split("\n## ")[0] ?? "";
const documented = new Map<string, string>();
for (const line of section.split("\n")) {
  const m = /^\|\s*`(\/api\/[^`]+)`\s*\|\s*`([^`]+)`\s*\|/.exec(line);
  if (m) documented.set(m[1], m[2]);
}
check("the doc table was parsed at all", documented.size > 0, `${documented.size} rows`);
check(
  "every deployed cron is documented",
  [...deployed.keys()].every((p) => documented.has(p)),
  [...deployed.keys()].filter((p) => !documented.has(p)).join(", ") || "none missing",
);
check(
  "no documented cron is absent from vercel.json",
  [...documented.keys()].every((p) => deployed.has(p)),
  [...documented.keys()].filter((p) => !deployed.has(p)).join(", ") || "no phantom rows",
);
for (const [path, schedule] of deployed) {
  const doc = documented.get(path);
  check(`${path} schedule`, doc === schedule, `vercel.json \`${schedule}\` vs doc \`${doc ?? "—"}\``);
}
check(
  "the doc names the script that pins it",
  cronsDoc.includes("apps/web/scripts/docs-truth-check.ts"),
);

// ── 5. the retired blanket claim stays retired ────────────────────────────
console.log("\n5. no surface re-asserts Hub-wide '3-agent consensus'");
// api/catalog/route.ts already retired this with a counted figure: the three
// "agents" are system-prompt personas on ONE Virtuals endpoint, and 78 of 112
// tools run a single Blue persona. Per-tool multi-persona claims are fine and
// deliberately not matched here — only the Hub-wide phrasing is.
for (const [name, src] of scanned) {
  check(`${name}`, !/3-agent consensus/i.test(src), "personas on one endpoint, not agents");
}

// ── 6. SKILL.md links the catalog instead of retyping it ──────────────────
console.log("\n6. SKILL.md does not hardcode a tool list");
// The 20 ids SKILL.md sold that had never existed in HANDLERS or AGENT_TOOLS
// (measured 2026-09-17). Four were priced $1.50–$3.00. They are listed by name
// rather than derived because the point is historical: these specific strings
// were published, and re-adding any of them is the regression. The trailing
// (?!-) stops `token-launch` from matching the real `token-launch-readiness`.
const NEVER_EXISTED = [
  "allowance-audit", "phishing-scan", "mev-shield", "circuit-breaker",
  "quantum-premium", "quantum-batch", "quantum-migrate", "quantum-timeline",
  "token-launch", "launch-advisor", "x402-readiness", "base-deploy-check",
  "tokenomics-score", "whitepaper-tldr", "vc-tracker", "wallet-pnl",
  "yield-optimizer", "tax-report", "alert-subscribe", "alert-check",
];
const resurrected = NEVER_EXISTED.filter((id) =>
  new RegExp(`\\b${id}\\b(?!-)`).test(SKILL),
);
check(
  "no phantom tool id is back in SKILL.md",
  resurrected.length === 0,
  resurrected.join(", ") || `${NEVER_EXISTED.length} known-fictional ids stay gone`,
);
// Absence alone would pass by emptying the file. This is the paired presence.
check(
  "SKILL.md still points at the generated catalog",
  SKILL.includes("https://blueagent.dev/api/catalog"),
  "deleting the list is only honest if the real source replaces it",
);
check(
  "SKILL.md does not sell the retired Telegram bot as a live surface",
  !/\*\*Telegram bot\*\* —/.test(SKILL),
  "discontinued 2026-06; naming it as retired is fine, listing it as a surface is not",
);

// ── 7. every tool id a doc names actually exists ──────────────────────────
console.log("\n7. every /api/x402/<id> reference resolves");
const IDS = new Set(AGENT_TOOLS.map((t) => t.id));
// `{tool-id}` placeholders do not match: the class requires a leading a–z0–9.
const X402_RE = /\/api\/x402\/([a-z0-9][a-z0-9-]*)/g;
let x402Refs = 0;
for (const [name, text] of [...scanned, ["src/app/api/mcp/route.ts", MCP_ROUTE] as const]) {
  const bad = new Set<string>();
  for (const m of text.matchAll(X402_RE)) {
    x402Refs++;
    if (!IDS.has(m[1])) bad.add(m[1]);
  }
  check(`${name}`, bad.size === 0, [...bad].join(", ") || "all ids in catalog");
}
check("the x402 scan found references at all", x402Refs > 0, `${x402Refs} matched`);

// The same failure one layer in: an MCP tool whose toolId 404s is a dead end an
// agent cannot diagnose — it gets a payment error, not "no such tool". The
// published @blueagent/skill package has 7 of these today (see CLAUDE.md); this
// keeps the surface we control from growing an eighth.
const mcpToolIds = [
  ...new Set([...MCP_ROUTE.matchAll(/^\s+hub_[a-z0-9_]+:\s+"([a-z0-9-]+)",/gm)].map((m) => m[1])),
];
const phantomMcp = mcpToolIds.filter((id) => !IDS.has(id));
check(
  "every hub_* → toolId in mcp/route.ts is a real catalog tool",
  mcpToolIds.length > 0 && phantomMcp.length === 0,
  phantomMcp.join(", ") || `${mcpToolIds.length} mappings resolve`,
);

// ── 8. the two published npm packages resolve to the same catalog ─────────
console.log("\n8. @blueagent/skill and @blueagent/agentkit name only real tools");
// Groups 6 and 7 covered the markdown. The packages are the same bug one layer
// out and strictly worse: a wrong count in a .md is read by a human who can go
// look, while a wrong toolId in an npm package is executed by an agent that gets
// a 501 it cannot diagnose. MEASURED 2026-09-18 — @blueagent/skill 0.4.0 shipped
// 7 such ids and agentkit 1.2.0 shipped 20, the exact NEVER_EXISTED set above.
//
// Derivation, not a whitelist: the names come from the package source and the
// truth comes from AGENT_TOOLS, so a phantom added tomorrow fails the same way.
const SKILL_SRC = readRepo("packages/skill/src/index.ts");
const SKILL_PKG = JSON.parse(readRepo("packages/skill/package.json"));
const AK_SRC = readRepo("packages/agentkit/src/provider.ts");
const AK_CLIENT = readRepo("packages/agentkit/src/client.ts");
const AK_README = readRepo("packages/agentkit/README.md");
const AK_PKG = JSON.parse(readRepo("packages/agentkit/package.json"));

const priceById = new Map(AGENT_TOOLS.map((t) => [t.id, String(t.price)]));

// -- @blueagent/skill --
const skillNames = [
  ...new Set([...SKILL_SRC.matchAll(/^\s*name: "([a-z0-9_]+)",$/gm)].map((m) => m[1])),
];
const skillToolIds = [...SKILL_SRC.matchAll(/toolId:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]);
const skillTasks = [...SKILL_SRC.matchAll(/task:\s*"([a-z0-9_-]+)"/g)].map((m) => m[1]);
const skillPhantom = [...new Set(skillToolIds.filter((id) => !IDS.has(id)))];
check(
  "every @blueagent/skill toolId is a real catalog tool",
  skillToolIds.length > 0 && skillPhantom.length === 0,
  skillPhantom.join(", ") || `${skillToolIds.length} mappings resolve`,
);
// The published description is the surface npm search renders, and it was the
// last thing to be updated when tools moved. Derived, so it cannot drift again.
check(
  "@blueagent/skill description matches its own tool list",
  SKILL_PKG.description ===
    `MCP server for Blue Agent — ${skillNames.length} tools: ${skillTasks.length} console commands + ` +
      `${skillToolIds.length} Hub tools + blue_score + blue_new`,
  SKILL_PKG.description,
);
// Vacuity floor: the two regexes above must keep finding things. If a refactor
// changes the literal shape they match, every check here would pass on zero.
check(
  "the @blueagent/skill scan is not vacuous",
  skillNames.length > 0 && skillTasks.length === 5,
  `${skillNames.length} names, ${skillTasks.length} console commands`,
);

// -- @blueagent/agentkit --
// Tempered dot: an unanchored lazy span would pair one action's name with the
// NEXT action's callTool id, which silently mislabels every row by one.
const akPairs = [
  ...AK_SRC.matchAll(
    /name: "([a-z0-9_]+)",(?:(?!name: ")[\s\S])*?callTool\(\s*"([a-z0-9-]+)"/g,
  ),
].map((m) => ({ name: m[1], toolId: m[2] }));
const akPhantom = akPairs.filter((p) => !IDS.has(p.toolId)).map((p) => p.toolId);
check(
  "every @blueagent/agentkit action resolves to a real catalog tool",
  akPairs.length > 0 && akPhantom.length === 0,
  akPhantom.join(", ") || `${akPairs.length} actions resolve`,
);
check(
  "@blueagent/agentkit description matches its action count",
  AK_PKG.description === `Coinbase AgentKit plugin for Blue Agent — ${akPairs.length} x402 tools on Base`,
  AK_PKG.description,
);
check(
  "@blueagent/agentkit README headline matches its action count",
  AK_README.includes(`— ${akPairs.length} x402-powered AI tools on Base`),
  `${akPairs.length} actions`,
);
// Prices are the money-facing half. agentkit understated 7 of its 12 — risk_gate
// by 4× and key_exposure by 5× — in BOTH the README table and the `description`
// string the LLM reads when deciding whether a call is worth making.
const akReadmeRows = [...AK_README.matchAll(/^\| `([a-z0-9_]+)` \|[^|]*\| (\$[\d.]+) \|$/gm)].map(
  (m) => ({ name: m[1], price: m[2] }),
);
check(
  "the agentkit README table lists exactly the actions the provider ships",
  akReadmeRows.length === akPairs.length &&
    akReadmeRows.every((r) => akPairs.some((p) => p.name === r.name)),
  `${akReadmeRows.length} rows vs ${akPairs.length} actions`,
);
const wrongPrice: string[] = [];
for (const { name, toolId } of akPairs) {
  const real = priceById.get(toolId);
  const inDesc = AK_SRC.match(
    new RegExp(`name: "${name}",(?:(?!name: ")[\\s\\S])*?Price: (\\$[\\d.]+) USDC\\.`),
  )?.[1];
  const inRow = akReadmeRows.find((r) => r.name === name)?.price;
  if (inDesc !== real) wrongPrice.push(`${name} desc ${inDesc} != ${real}`);
  if (inRow !== real) wrongPrice.push(`${name} README ${inRow} != ${real}`);
}
check(
  "every agentkit price matches the catalog",
  wrongPrice.length === 0,
  wrongPrice.join("; ") || `${akPairs.length} actions priced from AGENT_TOOLS`,
);
// The path bug that made all 32 actions unreachable: `/api/tools/{id}` has never
// existed on any branch and 404s in production. Pin the live path so a future
// edit cannot quietly point the client at a route again without one.
check(
  "the agentkit client posts to the live x402 path",
  AK_CLIENT.includes("/api/x402/${toolName}") && !AK_CLIENT.includes("/api/tools/${toolName}"),
  "/api/x402/{id} — /api/tools/{id} 404s and never existed",
);

// Group 7 scans a fixed file list that never included the packages, which is how
// blue_score kept calling `/api/x402/builder-score` for months: a *hardcoded* id
// in a URL rather than a `toolId:` field, in a file nothing checked. MEASURED
// 2026-09-18 — that id is in neither map, so it answered 501 on every call, while
// the free `/api/builder-score` (guarded only by a browser-only Sec-Fetch-Site
// check, which no Node caller trips) had been returning 200 the whole time.
// Any literal tool id baked into an /api/x402/ or /api/v1/ path here must resolve.
//
// Comments are stripped first, and that is semantic rather than a workaround: the
// invariant is "no dead id is ever FETCHED", while a comment naming a dead id is
// how the history above stays readable. Only line comments anchored at the start
// of a line are removed, so the `//` inside a `https://…` literal survives.
for (const [label, raw] of [
  ["packages/skill/src/index.ts", SKILL_SRC],
  ["packages/agentkit/src/client.ts", AK_CLIENT],
  ["packages/agentkit/src/provider.ts", AK_SRC],
] as const) {
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  const hardcoded = [...src.matchAll(/\/api\/(?:x402|v1)\/([a-z0-9][a-z0-9-]*)/g)].map((m) => m[1]);
  const dead = [...new Set(hardcoded.filter((id) => !IDS.has(id)))];
  check(
    `${label} — every hardcoded /api/x402|v1/<id> resolves`,
    dead.length === 0,
    dead.length ? `dead ids: ${dead.join(", ")}` : `${hardcoded.length} literal id(s)`,
  );
}

// ── 9. the two manifests an AGENT reads, not a human ──────────────────────
console.log("\n9. agent.json and plugin.md's price table agree with the catalog");
// Groups 1–8 grew around files a person browses. These two are different in
// kind: /.well-known/agent.json and /plugin.md are fetched by software that
// then ACTS on what it reads. Nothing here was checked before, and everything
// here was wrong — MEASURED 2026-09-18, with this file reporting ALL 77 CHECKS
// PASSED on the same commit:
//
//   agent.json   "40 tools" (×2) · "Powered by Bankr LLM" (403-banned since
//                2026-07-20) · endpoints /console and /simulate, both 404 ·
//                a `treasury` belonging to the RETIRED microtask product ·
//                `agentic.market/blueagent-dev`, 404 (the live path is
//                /services/…) · a free skill `blue_score` whose only id,
//                builder-score, is in neither map · "tools_registered: 13"
//                for a registry our own Hub labelled "64 tools".
//   plugin.md    8 of 18 table rows priced ABOVE the real price, plus a row
//                for `wallet-strategy-analyzer`, which does not exist.
//
// The price direction matters and is not reassuring: overstating means an
// agent told "confirm USDC balance ≥ the tool's price" (plugin.md §1) can
// refuse a call it could afford. Nobody is overcharged — the 402 quotes the
// catalog — but the doc still steers the caller wrong.
//
// WHY THESE ESCAPED: group 2's scanner is line-scoped, and in JSON the count
// sits on its own line (`"count": 34,` above `"tools": [`), so "34" and
// "tools" never met. Group 7 matches only /api/x402/<id> URLs, and the price
// table names bare ids in backticks. Both files were in `scanned` the whole
// time. Being listed is not the same as being covered.
const AGENT_JSON_RAW = read("public/.well-known/agent.json");
const AGENT_JSON = JSON.parse(AGENT_JSON_RAW);

// The table is hand-written prose with a machine-checkable spine. Deriving it
// (generating plugin.md from AGENT_TOOLS) would have cost the surrounding
// explanation, which is the reason the file exists; pinning it keeps the prose
// editable and still fails the moment a price drifts.
const PRICE_ROWS = [...PLUGIN.matchAll(/^\|\s*`([a-z0-9-]+)`\s*\|\s*(\$[\d.]+)\s*\|/gm)];
const priceByIdEntry = new Map(AGENT_TOOLS.map((t) => [t.id, t.price]));
const rowErrors = PRICE_ROWS.flatMap(([, id, price]) => {
  if (!priceByIdEntry.has(id)) return [`${id} — not in catalog`];
  const real = priceByIdEntry.get(id);
  return real === price ? [] : [`${id} — doc ${price}, catalog ${real}`];
});
check(
  "plugin.md price table — every row resolves and is priced correctly",
  PRICE_ROWS.length > 10 && rowErrors.length === 0,
  rowErrors.join(" | ") || `${PRICE_ROWS.length} rows match the catalog`,
);

// The count inside the sample /api/catalog response. It is illustrative, but an
// agent has no way to know that, and it sat at 34 while the endpoint served 111.
check(
  "plugin.md sample catalog response quotes the real count",
  PLUGIN.includes(`"count": ${TOOL_COUNT},`),
  `expected "count": ${TOOL_COUNT}`,
);

check(
  "agent.json — x402.tools equals the catalog",
  AGENT_JSON.x402?.tools === TOOL_COUNT,
  `${AGENT_JSON.x402?.tools} vs ${TOOL_COUNT}`,
);
check(
  "agent.json — the prose description quotes the same count",
  typeof AGENT_JSON.agent?.description === "string" &&
    AGENT_JSON.agent.description.includes(`${TOOL_COUNT} tools on Blue Hub`),
  `expected "${TOOL_COUNT} tools on Blue Hub" in agent.description`,
);

// Every advertised skill must name a tool that exists AND quote its real price.
// `blue_score` advertised `price_usdc: "0.00"` / `payment: "free"` for an id in
// neither map — the worst shape available, because an agent reads "free", skips
// its own spend-approval step, and gets a 501 it cannot diagnose.
const skillErrors = (AGENT_JSON.skills ?? []).flatMap((s: Record<string, unknown>) => {
  const id = String(s.tool_id ?? "");
  const tool = AGENT_TOOLS.find((t) => t.id === id);
  if (!tool) return [`${s.name} → ${id || "(no tool_id)"} not in catalog`];
  const want = `$${s.price_usdc}`;
  return tool.price === want ? [] : [`${s.name} — says ${want}, catalog ${tool.price}`];
});
check(
  "agent.json — every skill names a real tool at its real price",
  (AGENT_JSON.skills ?? []).length > 0 && skillErrors.length === 0,
  skillErrors.join(" | ") || `${AGENT_JSON.skills.length} skills resolve`,
);

// One payee, stated three times in this file and once per 402 response. The
// server constant is the one that moves money (api/_lib/x402-cdp.ts PAY_TO);
// these are copies, and a copy that drifts sends an agent's USDC elsewhere.
const PAY_TO = read("src/app/api/_lib/x402-cdp.ts").match(
  /PAY_TO\s*=\s*["'](0x[a-fA-F0-9]{40})["']/,
)?.[1];
check(
  "agent.json — payTo matches the server constant that settles",
  !!PAY_TO &&
    AGENT_JSON.x402?.payTo?.toLowerCase() === PAY_TO.toLowerCase() &&
    AGENT_JSON.agent?.payTo?.toLowerCase() === PAY_TO.toLowerCase(),
  PAY_TO ? `both fields = ${PAY_TO}` : "could not read PAY_TO from x402-cdp.ts",
);

// Dead providers, named as live. Bankr was 403-banned 2026-07-20 and Venice was
// dropped from the chain 2026-07-25; every LLM call goes to Virtuals. agent.json
// said "Powered by Bankr LLM" for ~2 months after the ban.
for (const dead of ["Bankr LLM", "Venice"]) {
  check(
    `agent.json does not name ${dead} as the inference provider`,
    !AGENT_JSON_RAW.includes(dead),
    `"${dead}" is not a provider this repo calls — see CLAUDE.md`,
  );
}

console.log(
  failures === 0
    ? `\nALL ${checks} CHECKS PASSED\n`
    : `\n${failures} of ${checks} CHECK(S) FAILED\n`,
);
process.exit(failures === 0 ? 0 : 1);
