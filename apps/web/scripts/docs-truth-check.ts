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
import { MCP_TOOLS } from "../src/lib/mcp-tools";

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

// Both public blurbs said "N **paid** tools" while six of the N were $0.00.
// Counted here for the same reason every other number in this file is: the
// adjective is a claim about all N rows, and it had already been false for four
// tools before the two Blue Hood readers made it six. Interpolating the split
// means the sentence cannot outlive the pricing it describes — price a free
// tool, or free a paid one, and these pins fail until the copy agrees.
const FREE_COUNT = AGENT_TOOLS.filter((t) => (t.priceUSDC ?? -1) === 0).length;
const PAID_COUNT = TOOL_COUNT - FREE_COUNT;

// The price RANGE, derived for exactly the reason the counts above are. A first
// draft of the group-11 pin below tested the literal `$0.005 to $5.00` — which
// is the same defect as the old README pin it was written to replace: it freezes
// the checker to today's prices, so the day someone reprices a tool the guard
// keeps passing while the prompt it guards goes stale. Anything a sentence
// claims must be computed, including the numbers inside a range.
//
// `priceUSDC` is USDC micro-units (6 dp) and a free tool holds `0`, so the free
// six are filtered out FIRST — otherwise the floor of the "paid" range is $0.00,
// which is not a price a caller can ever be charged.
const PAID_MICROS = AGENT_TOOLS.map((t) => t.priceUSDC ?? 0)
  .filter((p) => p > 0)
  .sort((a, b) => a - b);
/** Micro-units → the `$0.005` / `$0.10` / `$5.00` shape the prose actually uses. */
const usd = (micros: number) => {
  const n = micros / 1e6;
  // Sub-cent prices need 3 dp ($0.005); everything else reads as plain money.
  return `$${n.toFixed(Number.isInteger(n * 100) ? 2 : 3)}`;
};
const PRICE_LO = usd(PAID_MICROS[0]);
const PRICE_HI = usd(PAID_MICROS[PAID_MICROS.length - 1]);
const PRICE_MED = usd(PAID_MICROS[Math.floor(PAID_MICROS.length / 2)]);

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
const OG_HUB_RESULT = read("src/app/api/og/hub-result/route.tsx");

// ── the MCP surface, measured from the manifest rather than remembered ────
// SKILL.md and CLAUDE.md both quote this number, and it is NOT TOOL_COUNT.
// Deriving it here means those two files stay pinned to something real
// instead of being waved through by an exemption. The route header itself
// said 87 for months while the array held 86 — off by one, and nothing in CI
// disagreed, because nothing was comparing them.
//
// ⚠️ This was a REGEX over `app/api/mcp/route.ts` until 2026-09-18, when the
// manifest moved to `lib/mcp-tools.ts` so `/docs/mcp` could render the same
// object the route serves. The regex then matched nothing, MCP_COUNT silently
// became 0, and four pins started demanding "MCP serves 0 tools". That is the
// checker committing the exact fault it exists to catch: a derivation whose
// SOURCE moved degrades to a confident wrong answer, not to an error. Importing
// the array cannot fail that way — if the module moves, this file does not
// compile, which is the loud failure a silent 0 was not.
const mcpNames = [...new Set(MCP_TOOLS.map((t) => t.name))];
const MCP_COUNT = mcpNames.length;
const mcpPrefix = (p: string) => mcpNames.filter((n) => n.startsWith(`${p}_`)).length;
/** A tool's own description string — prompt text, and pinnable like any file. */
const mcpDesc = (name: string) =>
  MCP_TOOLS.find((t) => t.name === name)?.description ??
  `!! no MCP tool named ${name} — the pin below cannot go vacuous`;

/** `skills/` ships grounding files; README.md there is an index, not a skill. */
const SKILL_FILES = readdirSync(join(REPO, "skills")).filter(
  (f) => f.endsWith(".md") && f !== "README.md",
);

// ── 1. the pinned sentences ───────────────────────────────────────────────
console.log(`\n1. published counts equal TOOL_COUNT (${TOOL_COUNT})`);
const pinned: [string, string, string][] = [
  ["README heading", README, `## Blue Hub — ${TOOL_COUNT} AI Tools on Base`],
  // This pin USED TO READ `marketplace of ${TOOL_COUNT} pay-per-call AI tools`,
  // which is the checker enforcing the bug: it held the count to the catalog
  // while holding "pay-per-call" over all 115, six of which are $0.00. A pin is
  // an assertion about the whole sentence — pinning only the number inside it
  // freezes the adjective beside it and makes the wrong claim harder to change
  // than to keep. Interpolate every quantity the sentence makes a claim about.
  ["README lead", README,
   `marketplace of ${TOOL_COUNT} AI tools built on Base — ${PAID_COUNT} pay-per-call, ${FREE_COUNT} free`],
  [
    "README category line",
    README,
    `**${TOOL_COUNT} tools across ${CATEGORIES.length} categories** — ${CATEGORIES.join(" · ")}`,
  ],
  ["README chat section", README, `all ${TOOL_COUNT} Hub tools`],
  ["README cli example", README, `# list all ${TOOL_COUNT} tools`],
  ["llms.txt", LLMS, `Blue Hub exposes ${TOOL_COUNT} tools: ${PAID_COUNT} paid and ${FREE_COUNT} free.`],
  // The operative half. The count is trivia; "these never answer 402" is the
  // sentence that stops an agent signing an EIP-3009 authorization for zero
  // USDC — the exact 2026-09-26 finding that `x402-free-and-validation-test.ts`
  // was written for. Pinned so the number here cannot drift from the price.
  ["llms.txt free-tool line", LLMS,
   `The ${FREE_COUNT} free tools are priced $0.00 in the catalog and never answer 402.`],
  // An agent reads llms.txt, connects to /api/mcp, and counts 18 against the 110
  // it was just told. Until 2026-09-26 nothing public reconciled those, so the
  // only available conclusion was that the catalog number was inflated. Both
  // numbers are interpolated, so the sentence cannot drift away from either
  // surface — which is the point: it is the one place the gap is EXPLAINED, and
  // an explanation with a stale number in it is worse than none.
  ["llms.txt MCP subset line", LLMS,
   `advertises ${MCP_COUNT} tools, a curated subset of the ${TOOL_COUNT} tools above.`],
  // Said "for Base builders" until 2026-09-26. The pin only ever guarded the
  // NUMBER, so it held the one-chain audience framing in place as a side effect
  // — an editor fixing the chain wording got a CI failure that read like they
  // had broken a count. Keep the interpolation, not the prose.
  ["plugin.md", PLUGIN, `${TOOL_COUNT} AI tools for onchain builders`],
  ["farcaster.json (static copy)", FARCASTER_STATIC, `"${TOOL_COUNT} AI tools.`],
  // SKILL.md is the agent-facing brief — the one that was 79 tools stale.
  ["SKILL.md catalog line", SKILL, `Blue Hub exposes **${TOOL_COUNT} tools** across ${CATEGORIES.length} categories — ${PAID_COUNT} paid, ${FREE_COUNT} free.`],
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
  // ...and the CATALOG total the same header quotes, eight lines below it.
  // MEASURED 2026-09-26: that sentence said 111 while AGENT_TOOLS held 110.
  // The pin above had already caught the MCP number drifting by one; this one
  // then drifted by one in the identical way, in the same comment block, and
  // nothing fired. Two reasons it was invisible, both worth knowing before
  // trusting any other "it's covered" instinct in this file:
  //   1. a `pinned` entry asserts ONE substring. Proximity buys nothing —
  //      neighbouring lines are as unchecked as a different file's.
  //   2. group 2's scanner cannot reach it either, twice over: MCP_ROUTE is
  //      not in `scanned`, and even if it were, COUNT_RE needs the word
  //      "tools" AFTER the digits, while this sentence writes the count after
  //      `AGENT_TOOLS`. Adding the file to `scanned` would NOT have caught it.
  // Hence an explicit pin rather than widening the scan.
  ["mcp/route.ts catalog aside", MCP_ROUTE, `\`AGENT_TOOLS\` holds ${TOOL_COUNT};`],
  // CLAUDE.md is what every future session reads first; a stale number there
  // propagates into work before anyone thinks to measure.
  [
    "CLAUDE.md MCP line",
    CLAUDE_MD,
    `\`/api/mcp\` serves **${MCP_COUNT}** (${mcpPrefix("blue")} \`blue_\` + ${mcpPrefix("hub")} \`hub_\` + ${mcpPrefix("b20")} \`b20_\`)`,
  ],
  // The same paragraph states the CATALOG size twice, and both were 110 while
  // AGENT_TOOLS held 115. They escaped the group-2 scanner because COUNT_RE
  // only fires on a number adjacent to the word "tools", and neither sentence
  // says it — "is **110**." and "All 110 stay live at". A scanner keyed on one
  // noun cannot guard a claim that omits the noun, which is precisely why
  // these need explicit pins rather than a wider regex.
  ["CLAUDE.md catalog count", CLAUDE_MD, `in prod) is **${TOOL_COUNT}**`],
  ["CLAUDE.md — the cut removed no capability", CLAUDE_MD,
   `All ${TOOL_COUNT} stay live at \`/api/x402/<id>\``],

  // ── The manifest's own DESCRIPTIONS — the strings an agent actually reads ──
  // Every pin above guards a count in a file *about* the MCP surface. Nothing
  // guarded the surface itself, and the two are not the same artefact: llms.txt
  // is documentation, a description is prompt text that ships to the model.
  //
  // MEASURED 2026-09-27. `blue_registry` advertised "110+ callable x402 tools"
  // when the catalog was 115 and six of them are not x402 at all. Worse,
  // `blue_call` — the only tool that can reach those six — promised "this is an
  // x402 endpoint. The first call returns HTTP 402", unconditionally, while
  // `api/x402/[tool]/route.ts` handles `priceUnits === 0` BEFORE the `!xPayment`
  // branch and answers 200. An agent following that description on a $0.00 id
  // waits for requirements that never arrive, or refuses for want of a wallet.
  // That is the plugin.md defect fixed in 8f5ecf20, surviving in the one surface
  // that sweep never touched — and the 5-commit sweep that closed every other
  // manifest did not touch a single MCP file.
  //
  // Three pins, not one: the paid and free halves of blue_call are separate
  // assertions, because a single needle spanning both would let a future edit
  // delete the free sentence and keep passing on the paid one.
  ["blue_registry description", mcpDesc("blue_registry"),
   `catalog of ${TOOL_COUNT} callable tools — ${PAID_COUNT} x402-paid and ${FREE_COUNT} free`],
  ["blue_call description — the paid half", mcpDesc("blue_call"),
   `${PAID_COUNT} ids are x402-paid`],
  ["blue_call description — the free half", mcpDesc("blue_call"),
   `The other ${FREE_COUNT} are priced $0.00 and NEVER answer 402`],
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
// The lookbehind was `[\d.xX]` — `x` specifically, so that "## x402 Tools" did
// not read as a claim of 402 tools. Widened to `\w` on 2026-09-18 when group 10
// started scanning /docs: "B20 token tools" and "exposes B20 as MCP tools" both
// parsed as a claim of 20 tools, i.e. OUR OWN PRODUCT NAME read as a count. The
// general rule behind both cases: a digit glued to a letter is an identifier
// (x402, B20, v2, ERC20), never a quantity — a real count claim always has a
// space or a line start in front of it. Widening only ever drops matches that
// were false, and the vacuity floor below would catch it if it dropped real ones.
const COUNT_RE = /(?<![\w.])(\d+)(\+?)(?![\d.])(?=[\w -]{0,24}?\btools\b)/gi;
/** "111 tools" must be exact. "100+ tools" is a floor — true while we have at
 *  least that many, which is the point of writing it that way.
 *
 *  `alts` is for files that legitimately describe a DIFFERENT surface in the
 *  same breath — SKILL.md and CLAUDE.md both explain how the MCP subset
 *  relates to the catalog, and refusing them that sentence would push the
 *  explanation out of the two documents that most need it. Every alternate is
 *  itself derived from the surface it names (MCP_COUNT is counted out of the
 *  MCP_TOOLS manifest), so this widens what is true, not what goes unchecked. */
const claimHolds = (n: number, plus: boolean, alts: number[] = []) =>
  (plus ? TOOL_COUNT >= n : TOOL_COUNT === n) || (!plus && alts.includes(n));

const scanned: [string, string, number[]?][] = [
  ["README.md", README],
  // MCP_COUNT joins SKILL.md and CLAUDE.md as an accepted alternate here for the
  // same reason they have it: llms.txt now explains how the MCP subset relates to
  // the catalog, and refusing it that sentence would push the explanation out of
  // the one file agents actually fetch. The alternate is itself derived from
  // MCP_TOOLS, so this widens what is TRUE, not what goes unchecked.
  // FREE_COUNT joins MCP_COUNT for the same reason and with the same caveat:
  // "the 6 free tools" is a claim about a real, derived subset, and COUNT_RE
  // cannot tell a subset claim from a catalog claim. Both alternates are counted
  // out of AGENT_TOOLS, so price a free tool and this line stops being accepted
  // rather than quietly staying whitelisted.
  ["public/llms.txt", LLMS, [MCP_COUNT, FREE_COUNT]],
  ["public/plugin.md", PLUGIN],
  ["public/.well-known/farcaster.json", FARCASTER_STATIC],
  ["src/app/waitlist/page.tsx", WAITLIST],
  ["src/app/app/dashboard/_views/OverviewView.tsx", OVERVIEW],
  ["SKILL.md", SKILL, [MCP_COUNT]],
  ["CLAUDE.md", CLAUDE_MD, [MCP_COUNT]],
  // NOTE: the Hub share card (api/og/hub-result) is deliberately NOT here. It
  // belongs in group 5, but `scanned` reads raw source, and a .tsx file — unlike
  // the prose files above — carries comments that quote the very strings these
  // scans ban. Adding it made the file fail on its own history note (which
  // names the retired phrase) and on "63 of 110 tools" inside that note, which
  // COUNT_RE read as a live claim of 63 tools. It is checked on
  // comment-stripped source in group 5 instead.
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
// substring test would read that explanation as the bug itself. This matters
// far beyond one route — the honest record of what we retired lives almost
// entirely in comments, so a checker that cannot tell a comment from a claim
// punishes exactly the files that documented themselves best.
//
// Block comments are removed as a unit (2026-09-18). The line filter alone
// only caught lines that BEGIN with a comment marker, which silently missed
// every JSX `{/* … */}` block — the dominant form in .tsx, and the form the
// /docs retirement notices use. `app/docs/develop/page.tsx` quotes the old
// "Virtuals / Venice LLM gateway" copy inside one to explain why it went away;
// read as rendered text, the explanation looks identical to the bug.
const stripComments = (src: string) =>
  src
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "")
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

// /api/catalog publishes `count` as a number an indexer will quote verbatim, so
// it also publishes the two figures that make it re-computable: `integrity.listed`
// (catalog entries) and `integrity.withHandler` (handlers that exist). Equal ⟹ no
// orphan either way. This is the only place a CALLER can verify the count rather
// than trust it, so the shape is pinned here.
//
// 🔴 The failure mode is self-derivation, not absence. `listed: tools.length`
// type-checks, reads fine, and makes `noOrphans` true forever — the check would
// then be comparing the published list against itself. Both fields must come off
// the imported symbols, which is what these two assertions actually test.
{
  const catalogCode = stripComments(read("src/app/api/catalog/route.ts"));
  check(
    "/api/catalog publishes the integrity block that backs `count`",
    /integrity:\s*\{/.test(catalogCode) && /noOrphans/.test(catalogCode),
    "count without listed/withHandler beside it is an assertion, not a receipt",
  );
  check(
    "…and derives it from the symbols, not from the response it just built",
    /listed:\s*AGENT_TOOLS\.length/.test(catalogCode) &&
      /withHandler:\s*Object\.keys\(HANDLERS\)\.length/.test(catalogCode),
    "`listed: tools.length` would compare the published list against itself",
  );
}

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

// The Hub share card is the copy that LEAVES the site — it is what embeds in a
// feed when someone shares a result — and it printed "3-agent consensus · Base"
// on any tool that returned a verdict, including the 76 that run Blue alone.
// Checked on comment-stripped source, reusing the helper above — the fix's own
// history note quotes the banned phrase, so scanning raw source would fail on
// the explanation forever. That is the same trap the note above stripComments
// already records for the Venice retirement notice: read as rendered text, an
// explanation of a bug looks identical to the bug.
const OG_CODE = stripComments(read("src/app/api/og/hub-result/route.tsx"));
check(
  "og/hub-result renders no '3-agent' claim",
  !/3-agent/i.test(OG_CODE),
  "share card, 76 of 110 tools run Blue alone",
);
// Vacuity floor: if the strip ever eats the whole file (or the path moves), the
// test above goes green on an empty string. Anchored to STRUCTURE, not copy —
// an earlier draft anchored on the tagline it was guarding, so rewording that
// tagline would have failed the vacuity check instead of the claim check and
// pointed the next reader at the wrong problem.
//
// Anchor changed 2026-09-27: `agentsOf` → `AGENT_BADGES`. Aeon and MiroShark
// were retired (ShunTr), so the per-tool badge lookup collapsed to a constant
// and the old symbol stopped existing — the check failed on its VACUITY arm
// while the claim arm it protects still passed. Worth noting how that reads
// from a CI log: "scan is not vacuous — 4898 bytes" sounds like the file went
// missing, when in fact the file was fine and only the anchor had moved. An
// anchor on a symbol is only as durable as the symbol; when you re-point one,
// re-point it at whatever now carries the thing being guarded (here: the
// agent badge list), never at something merely nearby and stable.
check(
  "og/hub-result scan is not vacuous",
  OG_CODE.includes("ImageResponse") && OG_CODE.includes("AGENT_BADGES") && OG_CODE.length > 1500,
  `${OG_CODE.length} bytes after stripping comments`,
);

// The phrasing scan above could not have caught the longest-lived instance of
// this claim: the /docs STATS grid rendered `{ value: "3", label: "Agents" }`,
// which contains neither the word "consensus" nor a hyphen, in a file the scan
// does not read. It sat at the top of /docs framing every number below it.
// So this pins the SHAPE instead of the prose — every stat in that grid must be
// a derived String(...) expression. A literal is how the count drifts (this same
// grid held "MCP Tools: 57" while the real surface reached 86), and a literal is
// also the only way an uncountable claim like "3 Agents" gets in at all.
const DOCS_DATA = read("src/app/docs/_data.ts");
const statsBlock = DOCS_DATA.match(/export const STATS = \[([\s\S]*?)\n\];/)?.[1] ?? "";
// Asserted separately so the literal check below cannot pass by matching
// nothing: if the regex ever stops finding the block, `statLiterals` is empty
// and "every stat is derived" would go green on a file it never read.
check(
  "docs STATS grid is readable",
  statsBlock.length > 0,
  statsBlock.length > 0 ? `${statsBlock.trim().split("\n").length} lines` : "REGEX MATCHED NOTHING",
);
const statLiterals = [...statsBlock.matchAll(/value:\s*"([^"]*)"/g)].map((m) => m[1]);
check(
  "every /docs stat is derived, not typed",
  statLiterals.length === 0,
  statLiterals.length ? `hard-typed: ${statLiterals.join(", ")}` : "all String(...)",
);
// STATS reads CORE_COMMANDS and SKILLS_DOCS, so it must stay BELOW them — a
// `const` is in the temporal dead zone until its initialiser runs, and hoisting
// the block back to the top of the file throws at module load rather than at
// render. Cheap to assert, and the failure it prevents is a blank page.
for (const dep of ["CORE_COMMANDS", "SKILLS_DOCS"]) {
  check(
    `STATS is declared after ${dep} (TDZ)`,
    DOCS_DATA.indexOf(`export const ${dep}`) < DOCS_DATA.indexOf("export const STATS"),
  );
}

// ── 6. SKILL.md never HAND-TYPES a tool list ──────────────────────────────
// Superseded in part on 2026-09-24. SKILL.md does carry a tool list again, but
// it is generated from AGENT_TOOLS and diffed byte-for-byte by
// scripts/skill-catalog-check.ts, so it cannot drift. That check owns the block;
// this group keeps owning what a generator cannot catch — an id that never
// existed can only get back in by being typed in by hand, which is exactly what
// NEVER_EXISTED below tests for. Both still hold: no phantom id, and the real
// catalog is still linked.
console.log("\n6. SKILL.md does not hand-type a tool list");
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
// published @blueagent/skill package carried 7 of these when this was written;
// all 7 are gone as of 2026-09-26 and `dead-tool-check.ts` (F1) now holds that
// package to the same rule, so this line is history, not a live count.
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
// a 404 it cannot diagnose. MEASURED 2026-09-18 — @blueagent/skill 0.4.0 shipped
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
// 2026-09-18 — that id is in neither map, so it failed on every call (501 then,
// 404 UNKNOWN_TOOL_ID since 2026-09-28), while
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

// ── 9b. …and neither file says the paid tools are ALL of them ──────────────
/* MEASURED 2026-09-27. Six of the 115 are priced $0.00 — blue-doctor,
   hood-live, hood-track-record, picks-check, rh-rwa-verify, rh-token-scan — and
   both of these agent-facing files asserted the opposite in prose while their
   COUNTS were correct. That combination is the hard one to spot: a number that
   checks out makes the sentence around it look checked too.

     plugin.md   "Every tool is a paid HTTP endpoint", and worse, §1 was a
                 blocking gate reading "Before invoking ANY Blue Hub tool: call
                 get_wallets … confirm USDC balance ≥ the tool's price … obtain
                 explicit approval for the spend". Five of the six free tools
                 are safety checks and a diagnostic. An MCP client following
                 that instruction literally cannot verify a contract before
                 trading it unless a wallet is already connected and funded.
     agent.json  `x402.tools: 115` beside a top-level `payTo` and a note
                 beginning "Any x402-capable agent can call a tool endpoint and
                 pay per call" — 115 tools, one payee, no exceptions stated.

   So the counts here are DERIVED and the prose is pinned by its absence. The
   free ids are enumerated from the catalog, never typed, so a seventh free tool
   fails these until the published files name it. */
const FREE_TOOLS  = AGENT_TOOLS.filter((t) => (t.priceUSDC ?? -1) === 0);
const PAID_TOOLS  = TOOL_COUNT - FREE_TOOLS.length;
check(
  "the free set is non-empty, so the pins below are not vacuous",
  FREE_TOOLS.length > 0,
  `${FREE_TOOLS.length} free / ${PAID_TOOLS} paid`,
);
check(
  "plugin.md no longer claims every tool is paid",
  !/Every tool is a paid/i.test(PLUGIN) && !/invoking any Blue Hub tool/i.test(PLUGIN),
  "both the blurb and the §1 spend gate must scope themselves to paid tools",
);
check(
  "plugin.md counts the paid and free split",
  PLUGIN.includes(`${PAID_TOOLS} are paid`) && PLUGIN.includes(`other ${FREE_TOOLS.length} are priced $0.00`),
  `expected "${PAID_TOOLS} are paid" and "other ${FREE_TOOLS.length} are priced $0.00"`,
);
/**
 * THREE published files enumerate the free ids BY NAME — llms.txt, plugin.md and
 * agent.json — and until 2026-09-28 only agent.json was pinned in both
 * directions. plugin.md's pin was "every free tool is named", which is
 * one-directional, and llms.txt's list had no pin at all. That asymmetry is not
 * hypothetical: on 2026-09-28 `picks-check` was retired, this suite went green
 * with 214/214, and **both** llms.txt and plugin.md were still advertising it to
 * agents as a callable $0.00 id. A "nothing is missing" assertion cannot see a
 * dead entry, and a dead entry is the worse failure — a missing id costs a
 * caller one discovery round-trip, a dead one costs a 404 it cannot diagnose.
 *
 * So the invariant asserted is the full RENDERING, derived from the catalog:
 * exact members, exact order, one delimiter per file. That is bidirectional by
 * construction — extra, missing and reordered all fail the same way, with no
 * exemption list to go stale.
 *
 * Whitespace is normalised first because both files hard-wrap prose, so the list
 * straddles a line break in each; without this the pin would fail on a reflow
 * and teach the next reader to weaken it. The `>` is stripped for the same
 * reason and is not cosmetic — plugin.md keeps its list inside a blockquote, so
 * the wrap injects a `> ` into the middle of the run. Collapsing whitespace
 * alone leaves that marker behind and the pin fails for a reason that has
 * nothing to do with the ids. Strip the line-prefix decoration, not just the
 * newline.
 */
{
  const squash = (s: string) => s.replace(/^[ \t]*>[ \t]?/gm, " ").replace(/\s+/g, " ");
  const ids = FREE_TOOLS.map((t) => t.id);
  for (const [label, text, expected] of [
    ["llms.txt", LLMS, ids.join(", ")],
    ["plugin.md", PLUGIN, ids.map((id) => `\`${id}\``).join(" · ")],
  ] as const) {
    check(
      `${label} — the free-id list is exactly the $0.00 set, in catalog order`,
      squash(text).includes(squash(expected)),
      squash(text).includes(squash(expected))
        ? `${ids.length} ids match`
        : `expected the run "${expected}" — a stale id here is advertised as callable`,
    );
  }
}
check(
  "agent.json — x402.paid_tools equals the catalog's paid count",
  AGENT_JSON.x402?.paid_tools === PAID_TOOLS,
  `${AGENT_JSON.x402?.paid_tools} vs ${PAID_TOOLS}`,
);
{
  const declared = AGENT_JSON.x402?.free_tools;
  const missing  = FREE_TOOLS.filter((t) => !(declared ?? []).includes(t.id));
  const extra    = (declared ?? []).filter(
    (id: string) => !FREE_TOOLS.some((t) => t.id === id),
  );
  check(
    "agent.json — x402.free_tools is exactly the $0.00 set",
    Array.isArray(declared) && missing.length === 0 && extra.length === 0,
    [
      missing.length ? `missing ${missing.map((t) => t.id).join(", ")}` : "",
      extra.length ? `stale ${extra.join(", ")}` : "",
    ].filter(Boolean).join(" | ") || `${(declared ?? []).length} ids match`,
  );
}

// Every advertised skill must name a tool that exists AND quote its real price.
// `blue_score` advertised `price_usdc: "0.00"` / `payment: "free"` for an id in
// neither map — the worst shape available, because an agent reads "free", skips
// its own spend-approval step, and gets a 404 it cannot diagnose.
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

// One payee, stated twice in this static file and once per 402 response.
// agent.json cannot import, so this pin is the only thing keeping it in step,
// and an agent indexing us reads it before it touches any route.
//
// Read from lib/x402-payee — the definition — NOT scraped out of x402-cdp.ts,
// which now derives its PAY_TO from that module and holds no literal to find.
const PAY_TO = read("src/lib/x402-payee.ts").match(
  /X402_PAY_TO\s*=\s*["'](0x[a-fA-F0-9]{40})["']/,
)?.[1];
check(
  "agent.json — payTo matches the constant that settles",
  !!PAY_TO &&
    AGENT_JSON.x402?.payTo?.toLowerCase() === PAY_TO.toLowerCase() &&
    AGENT_JSON.agent?.payTo?.toLowerCase() === PAY_TO.toLowerCase(),
  PAY_TO ? `both fields = ${PAY_TO}` : "could not read X402_PAY_TO from lib/x402-payee.ts",
);
// …and the settling route really derives from it, so the pin above cannot pass
// vacuously by having been aimed at a constant that nothing reads.
const CDP_SRC = read("src/app/api/_lib/x402-cdp.ts");
check(
  "…and the settling route derives PAY_TO from that same constant",
  /from\s+["']@\/lib\/x402-payee["']/.test(CDP_SRC) &&
    /PAY_TO\s*=\s*X402_PAY_TO\b/.test(CDP_SRC),
  "api/_lib/x402-cdp.ts imports X402_PAY_TO",
);

// Dead providers, named as live. Bankr was 403-banned 2026-07-20 and Venice was
// dropped from the x402 chain 2026-07-25; every TOOL call goes to Virtuals.
// agent.json said "Powered by Bankr LLM" for ~2 months after the ban.
//
// "Venice" is banned HERE and not repo-wide, and the distinction is load-bearing
// (measured 2026-09-18): agent.json describes the x402 tool surface, where
// callLLM is Virtuals-only. Venice is NOT dead generally — `api/chat/route.ts`
// has its own branch that really does POST api.venice.ai/api/v1/chat/completions
// with VENICE_INFERENCE_KEY, and `api/crypto-rpc` really does call Venice's RPC.
// So Blue Chat's "routed through Virtuals + Venice" is TRUE and must stay. A
// repo-wide Venice ban would force a page to deny a provider it genuinely uses,
// which is the same fault as advertising a dead one, pointed the other way.
for (const dead of ["Bankr LLM", "Venice"]) {
  check(
    `agent.json does not name ${dead} as the inference provider`,
    !AGENT_JSON_RAW.includes(dead),
    `"${dead}" is not in the x402 tool path — that is callLLM → Virtuals only`,
  );
}

// ── 10. the public site — /about and every /docs page ─────────────────────
// Groups 1–9 pin the files agents read (README, SKILL.md, llms.txt, agent.json,
// the npm packages). None of them looked at the pages a HUMAN reads first. That
// is how `/about` sat at "57 tools" while the MCP manifest grew to 86: not one
// check was pointed at it, so the number had nothing to be wrong against.
//
// The page list is READ FROM DISK, never typed. A hand-kept list is the same
// failure one level up — a new /docs page would ship unscanned and nobody would
// see the gap, because a whitelist that is missing an entry looks exactly like
// a whitelist that is complete.
console.log("\n10. /about and /docs tell the truth");
const DOCS_DIR = join(WEB, "src/app/docs");
const docsPages = readdirSync(DOCS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => `src/app/docs/${d.name}/page.tsx`);
const PUBLIC_PAGES: [string, string][] = [
  ["src/app/about/page.tsx", read("src/app/about/page.tsx")],
  ["src/app/docs/page.tsx", read("src/app/docs/page.tsx")],
  ["src/app/docs/_data.ts", read("src/app/docs/_data.ts")],
  ...docsPages.map((p) => [p, read(p)] as [string, string]),
];
check(
  "the public-page list was discovered, not typed",
  docsPages.length >= 15,
  `${PUBLIC_PAGES.length} pages scanned, ${docsPages.length} of them enumerated from src/app/docs/`,
);

// 10a — same scanner as group 2. MCP_COUNT is an accepted alternate for the
// same reason SKILL.md gets one: /docs/mcp legitimately describes that surface.
//
// ⚠️ MEASURED 2026-09-18: this finds ZERO matches across all 19 pages, and that
// is the state we want, not a bug. Every public page interpolates —
// `{TOOL_COUNT} tools`, `{MCP_TOOL_COUNT} tools` — so there is no literal digit
// for the scanner to land on. This is therefore a REGRESSION GUARD, not a
// verifier: it has nothing to verify until someone types a number, and it fires
// the moment they do (mutation-tested: "Blue Hub has 120 tools today." pasted
// into /docs/quickstart fails it).
//
// So it gets NO vacuity floor, unlike group 2. A floor here would assert that
// at least one page hardcodes a count — demanding the exact thing the pages are
// right not to do. The failure a floor normally protects against (COUNT_RE
// silently stops matching, so every scan passes empty) is already covered:
// group 2 runs the same regex over files that DO carry literals and holds it to
// a derived floor. If COUNT_RE dies, group 2 fails first and loudly.
//
// One check, not one per page: 19 lines of permanently-green output would read
// as 19 numbers being checked. The failure message still names file and line.
const publicBad: string[] = [];
for (const [name, src] of PUBLIC_PAGES) {
  stripComments(src)
    .split("\n")
    .forEach((line, i) => {
      COUNT_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = COUNT_RE.exec(line))) {
        if (!claimHolds(Number(m[1]), m[2] === "+", [MCP_COUNT])) {
          publicBad.push(`${name}:${i + 1} — ${m[1]}${m[2]} in "${line.trim().slice(0, 60)}"`);
        }
      }
    });
}
check(
  "no public page hardcodes a tool count that has gone stale",
  publicBad.length === 0,
  publicBad.join(" | ") ||
    `${PUBLIC_PAGES.length} pages scanned; they interpolate the count rather than typing it, which is why there is nothing here to be wrong`,
);

// 10b — /about is "use client", so it cannot import the manifest to derive the
// number (that ships ~86 full JSON schemas to the browser to render one
// integer; measured precedent is +16 kB gzipped First Load). The literal is the
// right call there — but a literal with nothing watching it is precisely what
// rotted to 57, so it is pinned here instead, character for character.
const ABOUT = read("src/app/about/page.tsx");
const aboutCode = stripComments(ABOUT);
check(
  "/about's pinned MCP_TOOL_COUNT equals the real manifest",
  aboutCode.includes(`const MCP_TOOL_COUNT = ${MCP_COUNT};`),
  `expected "const MCP_TOOL_COUNT = ${MCP_COUNT};"`,
);
check(
  "/about's prefix breakdown equals the real manifest",
  aboutCode.includes(
    `(${mcpPrefix("blue")} blue_ + ${mcpPrefix("hub")} hub_ + ${mcpPrefix("b20")} b20_)`,
  ),
  `expected "(${mcpPrefix("blue")} blue_ + ${mcpPrefix("hub")} hub_ + ${mcpPrefix("b20")} b20_)" — a correct total can still hide three wrong parts`,
);
check(
  "/about does not pull the MCP manifest into its client bundle",
  !/from "@\/lib\/mcp-tools"/.test(aboutCode),
  "that is what the pin above exists to avoid; derive it only on a server page",
);
check(
  "/about names the script that pins it",
  ABOUT.includes("docs-truth-check.ts"),
  "a reader who edits the literal needs to know what will stop them",
);

// 10c — dead providers on public pages.
//
// Bankr only. Venice is deliberately NOT here: it is live on the chat path
// (api/chat/route.ts posts api.venice.ai directly) and in api/crypto-rpc, so
// banning the word would force /docs to deny a provider we really do call. The
// x402-path claim is already pinned in group 9 against agent.json, where it is
// the exact and only thing being asserted.
//
// `BankrBot` is carved out: the Aeon skills genuinely came from the BankrBot
// GitHub org, and that repo is still there. The org name is provenance; the
// bare product name is what gets read as a live integration.
const BANKR_RE = /\bBankr(?!Bot)\b/;
// A page may name Bankr as long as it says, in the same breath, that it is
// closed. Three /docs pages do exactly that and are right to.
const DISAVOWED =
  /\b(cannot run|can't run|suspended|banned|403|is gone|no longer|retired|closed|not runnable)\b/i;
for (const [name, src] of PUBLIC_PAGES) {
  const code = stripComments(src);
  if (!BANKR_RE.test(code)) continue;
  check(
    `${name} — names Bankr only alongside the fact that it is dead`,
    DISAVOWED.test(code),
    "every Bankr verb returns 403 (account-level, measured 2026-09-06 and re-measured 2026-09-18); naming it without saying so reads as a live integration",
  );
}
// The allowance above is per-file, so a page could in principle disavow in one
// paragraph and still advertise in another. These phrases close that door: each
// asserts a dead provider is IN the tool call path, which no wording makes true.
// They are checked with no allowance — but after comment-stripping, because two
// /docs pages quote them verbatim to record what was removed.
const NEVER_TRUE = ["Powered by Bankr", "Virtuals / Venice", "Virtuals → Venice", "Venice → Bankr"];
for (const phrase of NEVER_TRUE) {
  const offenders = PUBLIC_PAGES.filter(([, src]) => stripComments(src).includes(phrase)).map(
    ([n]) => n,
  );
  check(
    `no public page claims "${phrase}"`,
    offenders.length === 0,
    offenders.join(", ") || "callLLM is Virtuals-only — there is no chain and no Bankr",
  );
}
check(
  "the dead-provider scan is not vacuous",
  PUBLIC_PAGES.some(([, src]) => BANKR_RE.test(stripComments(src))),
  "no page mentions Bankr at all — if that is real the check is dead weight, not passing",
);

// ── 11. the grounding files, which are PROMPTS and not pages ───────────────
/* MEASURED 2026-09-27. Everything above scans what a human browses or what an
   agent fetches. `skills/*.md` is neither: `api/_lib/llm.ts` pulls these over
   raw.githubusercontent.com and PREPENDS them to the system prompt, so they are
   the most authoritative text in the system and they sat outside every scan in
   this file. Count the callers, do not trust this number:
     grep -rl 'You are Blue Agent' src/app/api/ | wc -l
   It was 41 on the day this group was written — 40 handlers plus llm.ts itself.

   What that cost, in `blue-agent-identity.md` specifically:
     • a live `bankr.bot/agent/blue-agent` link, ~2 days after the repo declared
       Bankr "fully removed". Group 10's sweep is scoped to PUBLIC_PAGES, so the
       one file that feeds a dead storefront straight into a model's context was
       the one file it could not see. A stricter consumer got the laxer scan.
     • "31 pay-per-use tools ... Each tool costs fractions of a cent" against a
       measured 115 / $0.005–$5.00, median $0.10. Exactly ONE of 109 paid tools
       is under a cent. A pricing-adjacent prompt grounded on that is wrong by
       three orders of magnitude at the top of the range.
     • "Base-native. Everything is on Base." — flatly against hard rule 1, and
       injected into `rh-stock-report` and `rh-stock-agent-brief`, which are RH
       Chain 4663 tools. The grounding told them the wrong chain.
     • the Telegram bot as "The public face of Blue Agent", retired 2026-06.

   None of it threw, none of it changed a status code, and no error rate moved:
   a stale prompt is a silent output regression, which is why it ran for months.

   These files cannot carry their own warning comments — every byte becomes
   prompt text — so the guard has to live out here. That asymmetry is the whole
   reason this group exists. */
const IDENTITY_REL = "skills/blue-agent-identity.md";
const IDENTITY     = readRepo(IDENTITY_REL);
const IDENTITY_PKG = readRepo(`packages/builder/${IDENTITY_REL}`);
const SKILL_BODIES = SKILL_FILES.map(
  (f) => [f, readRepo(`skills/${f}`)] as [string, string],
);

/* How many of these are genuinely injected, counted rather than asserted. Only
   the handful named in llm.ts's SKILL_URLS reach a system prompt; the rest ship
   in @blueagent/builder and are read to write code. Both matter and they are not
   the same risk, so the header says which is which instead of implying all 36
   are prompts — the first draft of this line did imply that, which is the same
   overclaim the group exists to catch. */
const LLM_SRC       = read("src/app/api/_lib/llm.ts");
const INJECTED      = SKILL_FILES.filter((f) => LLM_SRC.includes(`/skills/${f}`));
console.log(
  `\n11. skills/*.md — ${SKILL_FILES.length} shipped in @blueagent/builder, ` +
    `${INJECTED.length} injected into system prompts by api/_lib/llm.ts`,
);
check(
  "at least one skill file is actually injected",
  INJECTED.length > 0,
  "SKILL_URLS in llm.ts no longer points at skills/ — the prompt-grounding claim above would be fiction",
);

check(
  "the identity file is actually loaded by the LLM path",
  read("src/app/api/_lib/llm.ts").includes(IDENTITY_REL),
  `llm.ts no longer references ${IDENTITY_REL} — if the injection moved, this whole group is guarding a file nobody reads`,
);
check(
  "the identity file is non-trivial, so the pins below are not vacuous",
  IDENTITY.length > 500,
  `${IDENTITY.length} bytes`,
);
check(
  "@blueagent/builder ships the SAME identity, byte for byte",
  IDENTITY === IDENTITY_PKG,
  "packages/builder/skills/ is inside that package's `files` array, so a drift publishes a second, different Blue Agent to npm",
);

/* Bankr in a skill file: forbid the LINK, allow the warning.

   This check first shipped as a flat "no Bankr reference" and immediately failed
   on `llm-and-x402.md` and `reputation-engine.md` — both of which name Bankr for
   the sole purpose of telling a reader not to call it, one of them opening with
   the reason it was renamed from `bankr-tools.md`. Those are the guard working,
   not the bug: per the /docs/blue-chat precedent, deleting the word removes the
   warning and not the dependency. A skill file is read to WRITE CODE, so "do not
   use callBankrLLM" is the single most load-bearing sentence in it.

   The identity file's actual defect was different in kind and the distinction is
   the whole check: it carried
     Bankr profile: [bankr.bot/agent/blue-agent](https://bankr.bot/agent/blue-agent)
   — a markdown link, under "Who is Blue Agent", offered as a way to REACH us. A
   link is an invitation to a destination; a code span inside "this endpoint
   403s" is a citation. So the URL form is banned with no allowance, and a plain
   mention inherits group 10's disavowal rule. */
const BANKR_LINK_RE = /\]\(\s*(?:https?:\/\/)?(?:[\w-]+\.)*bankr\.bot/i;
for (const [f, body] of SKILL_BODIES) {
  check(
    `skills/${f} — no markdown link pointing at bankr.bot`,
    !BANKR_LINK_RE.test(body),
    "every Bankr verb 403s at the account level; a link is a destination, which no surrounding prose makes reachable",
  );
  if (!BANKR_RE.test(body)) continue;
  check(
    `skills/${f} — names Bankr only alongside the fact that it is dead`,
    DISAVOWED.test(body),
    "a skill file is read in order to write code, so an undisavowed provider name ships dead calls into whatever is scaffolded from it",
  );
}
check(
  "the bankr.bot link ban is not vacuous — some skill file still names Bankr",
  SKILL_BODIES.some(([, b]) => BANKR_RE.test(b)),
  "if no skill file mentions Bankr at all, the disavowal arm above never runs and is dead weight rather than passing",
);

check(
  "the identity file counts the catalog, and splits paid from free",
  IDENTITY.includes(`${TOOL_COUNT} tools`) &&
    IDENTITY.includes(`${PAID_COUNT} are paid per call`) &&
    IDENTITY.includes(`other ${FREE_COUNT}`),
  `must state ${TOOL_COUNT} tools, ${PAID_COUNT} paid per call, ${FREE_COUNT} free — it said "31 pay-per-use tools" for long enough that nobody remembered writing it`,
);
check(
  "the identity file quotes the REAL price range, not 'fractions of a cent'",
  IDENTITY.includes(`${PRICE_LO} to ${PRICE_HI}`) &&
    IDENTITY.includes(`median ${PRICE_MED}`) &&
    !/fractions of a cent/i.test(IDENTITY),
  `must say "${PRICE_LO} to ${PRICE_HI}, median ${PRICE_MED}" — all three derived from AGENT_TOOLS, ` +
    `so a repricing fails this pin until the prompt agrees. Only ${
      PAID_MICROS.filter((p) => p < 10_000).length
    } of ${PAID_COUNT} paid tools is under $0.01, which is what made "fractions of a cent" false`,
);
check(
  "the identity file names both live chains",
  IDENTITY.includes("8453") && IDENTITY.includes("4663"),
  "hard rule 1 — Base 8453 and Robinhood Chain 4663 share no state, and ~30 rh-* handlers read this file",
);
check(
  "…and never claims there is only one",
  !/Everything is on Base/i.test(IDENTITY),
  "this exact sentence was injected into rh-stock-report and rh-stock-agent-brief, both RH Chain 4663",
);
check(
  "the identity file does not present the old $BLUEAGENT as live",
  !IDENTITY.includes("0xf895783b2931c919955e18b5e3343e7c7c456ba3") ||
    /relaunch|not\*\* the live|pre-migration/i.test(IDENTITY),
  "the token is mid-relaunch; the old contract may appear only with that stated beside it",
);
check(
  "the identity file does not hand the model a treasury address",
  !/^\s*[-|]\s*\**Treasury/im.test(IDENTITY),
  "an address labelled Treasury in a prompt is one hop from output telling a user where to send funds",
);

// ── The ecosystem table lists SHIPPED products, not roadmap phases ───────────
// Removed 2026-09-27. Neither name appears anywhere else in this repo as a
// built thing: "Blocky Echo NFT" is nowhere at all, and "Community kit" exists
// only as roadmap Phase 9 (docs/roadmap.md), whose own bullets still bill it
// through Bankr subscriptions. A table headed "Product | Details" states that
// the row shipped — the model has no way to read it as a plan.
//
// This is the same failure as "31 pay-per-use tools" above, in the harder
// direction: a wrong count is at least checkable against the catalog, whereas a
// wholly invented product has nothing to reconcile against and so survives
// every count-based pin. Delete a line here only when the product genuinely
// ships, which makes that a deliberate act rather than a drift.
for (const ghost of ["Blocky Echo", "Community Kit"]) {
  check(
    `the identity file does not advertise "${ghost}" as a shipped product`,
    !new RegExp(ghost.replace(/ /g, "\\s+"), "i").test(IDENTITY),
    "unshipped roadmap items may not sit in the ecosystem table; 40 call sites inject this file as prompt text",
  );
}

// ── The README's free-call example names a tool id, and an id is a promise ───
// The counts above are interpolated, but this one line spells a tool out:
//
//     # Call a free tool — no header, no signature, nothing to settle
//     POST https://blueagent.dev/api/x402/blue-doctor
//
// It is true today and nothing made it stay true. Price that tool and the README
// still reads fine to a human while teaching every caller to POST with no
// X-Payment and collect a 402 — the failure lands on the reader, not on us, which
// is why it would go unreported. Same shape as the counts: a literal that is
// correct on the day it is written and unowned every day after.
const README_FREE_EG = README.match(/api\/x402\/([a-z0-9-]+)\s*\n```/i)?.[1];
const FREE_IDS = AGENT_TOOLS.filter((t) => (t.priceUSDC ?? -1) === 0).map((t) => t.id);
check(
  "README's free-tool example names a tool that is genuinely $0.00",
  !!README_FREE_EG && FREE_IDS.includes(README_FREE_EG),
  README_FREE_EG
    ? `the demoed id ("${README_FREE_EG}") must be one of the ${FREE_COUNT} genuinely-free tools [${FREE_IDS.join(", ")}] — price a demoed tool and the docs start handing out 402s`
    : "could not find the free-call example in README — the block moved, so this pin went vacuous rather than false",
);

// ══ 12. The published manifests — the third surface the Bankr sweep missed ═══
//
// Group 10 bans "Powered by Bankr" across PUBLIC_PAGES, and PUBLIC_PAGES is the
// about page plus src/app/docs/. That is every surface a HUMAN reads and not one
// surface an AGENT reads. Measured on 2026-09-27, the gap had caught two files:
//
//   • skills/blue-agent-identity.md    → a live bankr.bot markdown link, fixed in
//                                        46b56360 and now pinned by group 11.
//   • public/.well-known/agent.json    → `mcp.registry: "https://skills.bankr.bot"`
//                                        and `registry.bankr_skills: ".../pull/432"`.
//
// Both survived ~2 days past "Bankr is fully removed" for the same reason: the
// scan was scoped by who reads the file, and the machine-readable surfaces were
// nobody's idea of a "page". An agent-facing manifest is the one place a dead
// storefront does real damage, because nothing between it and a tool call reads
// prose that says the account is 403-banned.
//
// Discovered, not typed — same discipline as group 10's docsPages. A hand-written
// list is exactly how agent.json escaped in the first place.
const WELL_KNOWN_SRC = join(WEB, "src/app/.well-known");
const MANIFEST_FILES = [
  ...readdirSync(join(WEB, "public/.well-known")).map((f) => `public/.well-known/${f}`),
  ...readdirSync(join(WEB, "public"))
    .filter((f) => /\.(md|txt|json)$/.test(f))
    .map((f) => `public/${f}`),
  // One level of nesting covers `ai-tool/[tool]/route.ts`; the dynamic segment is
  // a directory, so a flat readdir would miss the only route that takes a param.
  ...readdirSync(WELL_KNOWN_SRC, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) =>
      readdirSync(join(WELL_KNOWN_SRC, d.name), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? [`src/app/.well-known/${d.name}/${e.name}/route.ts`]
          : e.name === "route.ts"
            ? [`src/app/.well-known/${d.name}/route.ts`]
            : [],
      ),
    ),
];
console.log(`\n12. published agent-facing manifests — ${MANIFEST_FILES.length} scanned for Bankr`);

check(
  "the manifest list was discovered, not typed",
  MANIFEST_FILES.length >= 8,
  `${MANIFEST_FILES.length} enumerated from public/ and src/app/.well-known/ — a floor of 8, because if discovery collapses the ban below passes by scanning nothing`,
);

// The LINK ban, not a word ban — identical reasoning to group 11. A manifest is
// consumed by machines, so a bankr.bot URL in one is strictly a destination;
// there is no "this endpoint 403s" context a parser could read.
for (const rel of MANIFEST_FILES) {
  const body = read(rel);
  check(
    `${rel} — no bankr.bot reference`,
    !/bankr\.bot|BankrBot\/skills/i.test(body),
    "every Bankr verb 403s at the account level; an agent reading this manifest has no prose telling it so",
  );
}

// ── 13. docs/ — the internal plans, which are read to decide what to BUILD ──
/* MEASURED 2026-09-27. Groups 10-12 cover what a human browses, what an agent
   fetches, and what gets injected as a prompt. `docs/` is the fourth audience and
   was outside all of them: it is what a contributor (or an agent given this repo)
   reads to decide what to do next. On the day this group was written it still
   described Bankr as the live inference provider and the live marketplace, 66 days
   after Bankr 403-banned this project and 2 days after the repo declared it "fully
   removed". What that looked like:
     • `next-steps.md` → "Set BANKR_API_KEY in .env … All commands that call Bankr
       LLM require this env var." Not a stale description — an INSTRUCTION to wire
       up a dependency that cannot authenticate.
     • `status.md` → "All backed by Bankr LLM", under a heading marked ✅, in a file
       that already carried a "packages/bankr DELETED 2026-09-18" row nine lines
       later. Half-updated is worse than untouched: the deletion note is exactly
       what makes a reader trust the rest of the file.
     • `quickstart.md` → `BANKR_API_KEY` listed as a required env var, and
       `npm run build` as the happy path, which is the command CLAUDE.md bans for
       corrupting a running dev server's `.next/` (seen four times).
     • two `template-specs/*.md` → "Bankr LLM optional" / "optional Bankr/x402".
       `blue new` scaffolds from these, so the reach is generated projects.

   This is the retiring law's real gap restated: the payment path and the prose died
   on schedule, and the PLANS kept pointing at the corpse. Nothing here throws, so
   only a reader catches it — which is why it ran for two months.

   A WORD ban is wrong for this directory, unlike group 12's manifests. These files
   must be able to say "Bankr was removed, do not re-add it" — that sentence is the
   whole point of the record CLAUDE.md keeps. So this bans the LIVE-CLAIM shapes and
   requires a removal marker nearby, which is the same assertion-plus-context
   pattern as the $BLUEAGENT token check in group 11. */
const DOC_FILES = readdirSync(join(REPO, "docs"), { recursive: true })
  .map(String)
  .filter((f) => f.endsWith(".md"))
  .sort();
console.log(`\n13. docs/ — ${DOC_FILES.length} internal plan files scanned for live Bankr claims`);

check(
  "the docs list was discovered, not typed",
  DOC_FILES.length >= 20,
  `${DOC_FILES.length} enumerated from docs/ — a floor of 20, because if discovery collapses the ban below passes by scanning nothing`,
);

/** Shapes that can only be a live claim. `BANKR_API_KEY` is included because the
 *  var has zero readers: naming it at all is either an instruction or a warning,
 *  and the marker below is what separates the two. */
const BANKR_LIVE_RE =
  /BANKR_API_KEY|Bankr[- ]native|Bankr LLM|\bon Bankr\b|Bankr marketplace|Bankr subscriptions|Bankr\/x402/i;
/** The block must carry one of these, or the claim reads as current. Deliberately
 *  broad: the cost of a false PASS here is a contributor wiring a banned vendor,
 *  the cost of a false FAIL is rewording one sentence. */
const REMOVED_RE =
  /remov|delet|retir|dead|gone|banned|403|no longer|died|~~|must not|do not|legacy|GONE/i;

/* The unit is the enclosing BLOCK, not the line. MEASURED: the first run of this
   group failed on two lines that were already correct — markdown hard-wraps at ~80
   cols, so "`BANKR_API_KEY` used to be" ended a line and "gone and must not return"
   began two lines later. A per-line window reports honest prose as a live claim,
   and the next reader to hit that loosens the regex rather than the window.
   A block is still only a few lines: a blank line, heading, bullet or table row
   opens a new one, so adding "- `BANKR_API_KEY` — the LLM gateway" to an env list
   still fails even when a sibling bullet says "removed". The residual hole is a
   prose paragraph that mixes a live instruction with an unrelated removal note;
   that is the price of any window wider than zero, and it is the right trade
   against a check nobody trusts. */
const opensBlock = (line: string) =>
  line.trim() === "" || /^\s*(#|[-*+]\s|\d+\.\s|\|)/.test(line);

for (const rel of DOC_FILES) {
  const blocks: { start: number; text: string }[] = [];
  readRepo(`docs/${rel}`)
    .split("\n")
    .forEach((line, i) => {
      if (opensBlock(line) || blocks.length === 0) blocks.push({ start: i, text: line });
      else blocks[blocks.length - 1].text += ` ${line}`;
    });
  const bad = blocks
    .filter((b) => BANKR_LIVE_RE.test(b.text) && !REMOVED_RE.test(b.text))
    .map((b) => `L${b.start + 1}: ${b.text.trim().slice(0, 78)}`);
  check(
    `docs/${rel} — Bankr named only as removed`,
    bad.length === 0,
    bad.join(" | ") ||
      "no live Bankr claim; historical mentions carry a removal marker",
  );
}

console.log(
  failures === 0
    ? `\nALL ${checks} CHECKS PASSED\n`
    : `\n${failures} of ${checks} CHECK(S) FAILED\n`,
);
process.exit(failures === 0 ? 0 : 1);
