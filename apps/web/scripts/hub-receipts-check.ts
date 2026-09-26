/**
 * Guard: the receipts report must never turn a failed parse into a reassuring number.
 *
 * Run: `npx tsx scripts/hub-receipts-check.ts` (from apps/web). Exit 0 = pass.
 * Hermetic — fixture strings plus two source reads. No network, no KV, no writes.
 *
 * WHY IT EXISTS
 * -------------
 * `hub-receipts-report.ts` prints one genuinely dangerous row: "MCP hidden
 * endpoints" — names reachable through `tools/call` while absent from the
 * advertised manifest, so no client can discover them and any client can invoke
 * them. 67 existed before the 2026-09-26 trim.
 *
 * 🔴 That row is a SET DIFFERENCE, and a set difference against a failed parse is
 * EMPTY. It renders as "0 hidden endpoints" — the single most reassuring wrong
 * answer this report can produce. It looks like the invariant holding. It means
 * nobody looked. Nothing throws, nothing logs, and `tsc` is perfectly happy.
 *
 * This is not hypothetical. MEASURED, and written up in the header of
 * `docs-truth-check.ts`: `MCP_COUNT` was a regex over the mcp route; the manifest
 * moved to `lib/mcp-tools.ts`; the regex matched nothing; the count silently
 * became 0; four published pins then demanded "MCP serves 0 tools". The checker
 * committed the exact fault it existed to catch.
 *
 * So the parsing was extracted into `hub-receipts-parse.ts` — pure, no fs, no
 * network — for ONE reason: so the FAILURE fixtures can actually be executed
 * here. A refusal branch that has only been read, never run, is not a guard. It
 * is a comment.
 *
 * ── WHY NOT TEST THE REPORT ITSELF ──────────────────────────────────────────
 * `hub-receipts-report.ts` fetches production and npm at module scope and calls
 * `main()` on import. Importing it from a gating suite would put the mandatory
 * gate at the mercy of a network blip. Group 6 pins that split in both
 * directions: the parse module stays pure, the report stays un-importable.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { literalKeys, setLiterals, hiddenMcpEndpoints } from "./hub-receipts-parse";
import { MCP_TOOLS } from "../src/lib/mcp-tools";

let pass = 0;
const failures: string[] = [];
function check(name: string, cond: boolean) {
  if (cond) pass++;
  else failures.push(name);
}

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
/** Collapse comment leaders and wrapping so a prose assertion survives a reflow. */
const flat = (s: string) => s.replace(/\n\s*\*?/g, " ").replace(/\s+/g, " ");
const eq = (a: string[] | null, b: string[]) => a !== null && a.join("|") === b.join("|");

// ── Fixtures ────────────────────────────────────────────────────────────────
// Shaped after the real `api/mcp/route.ts`, including its hazards: a prose
// comment that NAMES a map before the map is declared, a commented-out entry, a
// quoted key, and an unrelated object literal sitting between the two.

// ⚠ `decoy_arg_remap` is a BARE identifier on purpose. With a quoted key the
// naive parse returns [] and the decoy assertion below passes for the wrong
// reason — the bug is invisible instead of caught. A fixture has to make the
// wrong answer DISTINGUISHABLE, not merely absent.
const FULL = `
// Trimmed 2026-09-26 alongside HUB_MAP: 21 of the 22 entries keyed handlers no
// longer reachable from this surface. This comment is the DECOY — it names
// HUB_MAP in prose, and an unrelated object literal follows it.
const ARG_REMAP: Record<string, unknown> = {
  decoy_arg_remap: { limit: 10 },
};

const HUB_MAP: Record<string, string> = {
  // Safety — the ones an agent must reach for unprompted.
  hub_risk_gate:        "risk-gate",
  "hub_honeypot":       "honeypot-check",
  // hub_retired:       "retired-tool",
  blue_registry:        "blue-registry",
};

const CONSOLE_MAP: Record<string, string> = {
  blue_build: "build",
  blue_audit: "audit",
};

const B20_ENCODE_TOOLS = new Set([
  "b20_encode_payment",
]);
`;

/** Every map present and syntactically fine, but holding nothing. */
const EMPTY = `
const HUB_MAP: Record<string, string> = {
};
const CONSOLE_MAP: Record<string, string> = {};
const B20_ENCODE_TOOLS = new Set([]);
`;

const NO_HUB = FULL.replace("const HUB_MAP:", "const HUB_MAP_RENAMED:");
const NO_CONSOLE = FULL.replace("const CONSOLE_MAP:", "const CONSOLE_MAP_V2:");
const NO_B20 = FULL.replace("const B20_ENCODE_TOOLS =", "const B20_ENCODERS =");
const NONE = "export const nothing = 1;\n";

/** All six names the FULL fixture makes callable. */
const FULL_CALLABLE = [
  "hub_risk_gate", "hub_honeypot", "blue_registry",
  "blue_build", "blue_audit", "b20_encode_payment",
];

// ── Group 1: REFUSAL. The reason this file exists. ──────────────────────────
// 🔴 Every assertion here is about the difference between "found, and it is
// empty" and "not found". Collapse the two and the report starts publishing a
// clean bill of health it never measured.

{
  const r = hiddenMcpEndpoints(NO_HUB, FULL_CALLABLE);
  check("1.1 a renamed HUB_MAP REFUSES", r.ok === false);
  check("1.2 the refusal names the map that moved", !r.ok && r.missing.includes("HUB_MAP"));
  // The load-bearing one. If the refusal shape carries a `hidden` array at all,
  // a caller doing `r.hidden.length` gets 0 and prints it as a measurement.
  check(
    "1.3 a refusal carries NO hidden array — 0 must be unreachable from it",
    !("hidden" in (hiddenMcpEndpoints(NO_HUB, FULL_CALLABLE) as unknown as Record<string, unknown>)),
  );
  check(
    "1.4 a refusal carries no callable array either",
    !("callable" in (hiddenMcpEndpoints(NO_HUB, FULL_CALLABLE) as unknown as Record<string, unknown>)),
  );
}

check("1.5 a renamed CONSOLE_MAP refuses", hiddenMcpEndpoints(NO_CONSOLE, FULL_CALLABLE).ok === false);
check("1.6 a renamed B20_ENCODE_TOOLS refuses", hiddenMcpEndpoints(NO_B20, FULL_CALLABLE).ok === false);

{
  // Report ALL of them, not just the first. Someone fixing a rename should not
  // have to re-run three times to discover there were three.
  const r = hiddenMcpEndpoints(NONE, FULL_CALLABLE);
  check("1.7 a wholly unrecognisable file refuses", r.ok === false);
  check(
    "1.8 the refusal lists every missing source at once",
    !r.ok && r.missing.length === 3 &&
      ["HUB_MAP", "CONSOLE_MAP", "B20_ENCODE_TOOLS"].every((k) => r.missing.includes(k)),
  );
}

{
  // The mirror image, and just as important: maps that genuinely hold nothing
  // must still produce a VERDICT. Refusing here would make the guard cry wolf
  // the day a map is legitimately emptied.
  const r = hiddenMcpEndpoints(EMPTY, []);
  check("1.9 present-but-empty maps still answer", r.ok === true);
  check("1.10 an empty-but-parsed result is 0 hidden of 0 callable",
        r.ok && r.hidden.length === 0 && r.callable.length === 0);
}

// ── Group 2: literalKeys — null is not [] ───────────────────────────────────

{
  check("2.1 a missing declaration is null, NOT an empty list",
        literalKeys(FULL, "NOT_A_MAP") === null);
  check("2.2 an empty object is [], not null", eq(literalKeys(EMPTY, "HUB_MAP"), []));
  check("2.3 keys come back in source order",
        eq(literalKeys(FULL, "HUB_MAP"), ["hub_risk_gate", "hub_honeypot", "blue_registry"]));
  // `"hub_honeypot": "…"` is exactly as callable as the bare form. Matching only
  // bare identifiers would drop it silently — and silently is the whole problem.
  check("2.4 a quoted key is counted", literalKeys(FULL, "HUB_MAP")?.includes("hub_honeypot") === true);
  check("2.5 a commented-out entry is NOT counted",
        literalKeys(FULL, "HUB_MAP")?.includes("hub_retired") === false);

  // 🔴 The decoy, and the reason the anchor exists. `src.indexOf("HUB_MAP")`
  // lands on the PROSE COMMENT above ARG_REMAP, then parses ARG_REMAP's braces
  // and returns its keys with total confidence. MEASURED against the original
  // implementation: it answers ["decoy_arg_remap"] here.
  check("2.6 a prose mention of the name does not divert the parse to the next object",
        literalKeys(FULL, "HUB_MAP")?.includes("decoy_arg_remap") === false);
  // …and `literalKeys` must not read the decoy as a valid HUB_MAP either, which
  // is the failure that would make 2.6 pass while the answer is still wrong.
  check("2.6b the decoy object is locatable under its OWN name, proving 2.6 is not vacuous",
        eq(literalKeys(FULL, "ARG_REMAP"), ["decoy_arg_remap"]));

  const nested = `
const HUB_MAP: Record<string, unknown> = {
  outer: {
    inner_must_not_count: 1,
    deeper: { also_not: 2 },
  },
  sibling: "yes",
};
`;
  // A nested object's keys are not callable names. Counting them inflates
  // `callable` and can hide a real finding inside a bigger denominator.
  check("2.7 only depth-0 keys", eq(literalKeys(nested, "HUB_MAP"), ["outer", "sibling"]));

  check("2.8 an unbalanced brace refuses rather than guessing",
        literalKeys(`const HUB_MAP: Record<string, string> = {\n  a: "b",\n`, "HUB_MAP") === null);
  // A name that is a PREFIX of the real one must not match it. `\b` does this;
  // a bare substring test would have HUB_MAP resolve to HUB_MAP_RENAMED's body.
  check("2.9 the declaration match is word-anchored",
        literalKeys(NO_HUB, "HUB_MAP") === null);
}

// ── Group 3: setLiterals ────────────────────────────────────────────────────

{
  check("3.1 a missing Set is null", setLiterals(FULL, "NOT_A_SET") === null);
  check("3.2 an empty Set is []", eq(setLiterals(EMPTY, "B20_ENCODE_TOOLS"), []));
  check("3.3 members come back", eq(setLiterals(FULL, "B20_ENCODE_TOOLS"), ["b20_encode_payment"]));

  const multi = `const B20_ENCODE_TOOLS = new Set([
  "a_one",
  'a_two',
  // "a_retired",
]);`;
  check("3.4 single quotes count, commented-out members do not",
        eq(setLiterals(multi, "B20_ENCODE_TOOLS"), ["a_one", "a_two"]));
  // An object literal is not a Set. Matching it would return keys that are not
  // members, which is a wrong answer dressed as a right one.
  check("3.5 an object literal is not mistaken for a Set",
        setLiterals(`const B20_ENCODE_TOOLS = { a: 1 };`, "B20_ENCODE_TOOLS") === null);
}

// ── Group 4: the difference itself ──────────────────────────────────────────

{
  const clean = hiddenMcpEndpoints(FULL, FULL_CALLABLE);
  check("4.1 advertised == callable gives 0 hidden", clean.ok && clean.hidden.length === 0);
  check("4.2 callable spans all three sources", clean.ok && clean.callable.length === 6);

  // Two names callable but unadvertised. This is the finding the row exists for,
  // and it must be NAMED, not merely counted — a count cannot be acted on.
  const advertised = FULL_CALLABLE.filter((n) => n !== "hub_honeypot" && n !== "blue_audit");
  const leaky = hiddenMcpEndpoints(FULL, advertised);
  check("4.3 unadvertised callable names are found", leaky.ok && leaky.hidden.length === 2);
  check("4.4 and reported by name",
        leaky.ok && leaky.hidden.includes("hub_honeypot") && leaky.hidden.includes("blue_audit"));
  // Direction matters: advertised-but-not-callable is a broken manifest entry,
  // a different (and much louder) bug. This row must not conflate them.
  const extra = hiddenMcpEndpoints(FULL, [...FULL_CALLABLE, "hub_never_mapped"]);
  check("4.5 an advertised name with no mapping is not counted as hidden",
        extra.ok && extra.hidden.length === 0);
}

// ── Group 5: the LIVE invariant, against the real route ─────────────────────
// Groups 1–4 prove the parser. This proves the repo. Advertised set == callable
// set is the rule CLAUDE.md records; 67 names violated it before the 09-26 trim.
// Pinning it here means a HUB_MAP entry added without a matching TOOLS entry
// turns `npm test` red, instead of waiting for someone to run the report.

{
  const mcpSrc = read("src/app/api/mcp/route.ts");
  const r = hiddenMcpEndpoints(mcpSrc, MCP_TOOLS.map((t) => t.name));
  check(
    `5.1 all three maps are still locatable in api/mcp/route.ts${r.ok ? "" : ` — missing: ${r.missing.join(", ")}`}`,
    r.ok === true,
  );
  check(
    `5.2 advertised set == callable set — 0 hidden endpoints${r.ok && r.hidden.length ? ` (found: ${r.hidden.join(", ")})` : ""}`,
    r.ok && r.hidden.length === 0,
  );
  // If this ever reads 0, the parse found nothing and 5.2 passed vacuously.
  check("5.3 the difference was taken against a NON-EMPTY callable set",
        r.ok && r.callable.length > 0);
}

// ── Group 6: the purity split, which `tsc --noEmit` cannot see ──────────────
// The parse module exists to be importable by this guard. The report exists to
// touch the network. Each property is what makes the other one safe, and either
// could be undone by an edit that type-checks perfectly.

{
  const parseSrc = read("scripts/hub-receipts-parse.ts");
  const reportSrc = read("scripts/hub-receipts-report.ts");

  check("6.1 the parse module imports nothing", !/^\s*import\s/m.test(parseSrc));
  check("6.2 the parse module touches no fs and no network",
        !/\bfetch\s*\(/.test(parseSrc) && !/readFileSync|node:fs|require\(/.test(parseSrc));
  check("6.3 the parse module has no top-level side effect",
        !/^main\(/m.test(parseSrc) && !/process\.exit/.test(parseSrc));

  check("6.4 the report is the half that fetches — which is why it must never gate",
        /\bfetch\s*\(/.test(reportSrc) && /registry\.npmjs\.org/.test(reportSrc));
  check("6.5 the report self-executes, so no suite can import it by accident",
        /^main\(\)/m.test(reportSrc));
  check("6.6 the report does not re-implement the parse",
        !/function\s+literalKeys/.test(reportSrc) && !/function\s+setLiterals/.test(reportSrc));
  check("6.7 the report gets the parse from the shared module",
        /from\s+"\.\/hub-receipts-parse"/.test(reportSrc));

  // 🔴 The render site. The parser can be flawless while the caller writes
  // `String(r.hidden?.length ?? 0)` and prints a 0 it never measured.
  check("6.8 the report renders a refusal as null, never as a number",
        /if\s*\(!r\.ok\)/.test(reportSrc) && /!r\.ok[\s\S]{0,400}?value:\s*null/.test(reportSrc));
  check("6.9 the report never defaults a parse result to 0 or []",
        !/r\.hidden[\s\S]{0,40}\?\?\s*(0|\[\])/.test(reportSrc) &&
          !/r\.callable[\s\S]{0,40}\?\?\s*(0|\[\])/.test(reportSrc));

  // The report's own tier vocabulary is the thing that makes its numbers
  // receipts rather than assertions. Losing the word loses the point.
  check("6.10 the report still labels each row with how it was obtained",
        /"import"/.test(reportSrc) && /"parse"/.test(reportSrc) && /"fetch"/.test(reportSrc));
  check("6.11 unmeasured rows print as unknown, not as a value",
        /r\.value\s*\?\?\s*"unknown"/.test(reportSrc));

  // Written down where the next reader will hit it, not only here.
  check("6.12 the rule is recorded in the parse module's own header",
        /load-bearing/i.test(flat(parseSrc)) && /set difference/i.test(flat(parseSrc)));
}

console.log(`\nhub-receipts guard: ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL  ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
