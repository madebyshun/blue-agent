/**
 * Regression guard: every warning key the semantic smoke asserts on must
 * actually be emitted by the handler it tests.
 *
 * WHY THIS EXISTS
 * ---------------
 * MEASURED 2026-09-26. `rh-rwa-semantic-smoke.yml` had failed on all 7 of its
 * scheduled runs since 2026-09-24T20:59Z, always on the same single assertion
 * (`20/21 pass`), while production was behaving perfectly correctly.
 *
 * Commit 2277f3aa renamed a handler warning key — deliberately, and for a good
 * reason: the condition is a property of the Virtuals gateway (it has no web
 * search at all), not of one particular run, so `no_web_search_this_run` was
 * a lie about its own scope and became `no_web_search`.
 *
 *   rh-stock-agent-brief.ts  emits   `no_web_search: <provider> has no …`
 *   semantic-smoke.ts        asserts  w.includes("no_web_search_this_run")
 *
 * The rename did not touch the smoke. `"no_web_search: …"` does not contain
 * `"no_web_search_this_run"`, so the assertion was not merely wrong, it was
 * UNSATISFIABLE — no production behaviour could ever turn it green again.
 *
 * WHY IT WENT UNNOTICED FOR SEVEN RUNS
 * ------------------------------------
 * This is the part worth guarding. Nothing local could see it:
 *
 *   • tsc cannot — both sides are well-typed string literals, and nothing
 *     declares that they are supposed to be the SAME string.
 *   • `npm test` could not — the smoke needs network + a prod secret, so it is
 *     not a suite here. It only runs on a 6h cron and on PRs touching rh-*.
 *   • the smoke itself could not — it tests PROD, never the branch, so the
 *     renaming commit's own CI run was green; the breakage appeared hours
 *     later, on a schedule, attached to no diff.
 *
 * So the failure surfaced as a permanently-red monitor. That is the real cost:
 * a check that is always red is not a check. A genuine regression in the rh-*
 * tokenized-stock surface would have landed as the same red X that had been
 * sitting there for days, and this workflow is the only automated coverage
 * that exercises production rather than a diff.
 *
 * THE RULE
 * --------
 * A warning key asserted by the smoke is a CONTRACT between two files. It is
 * pinned here, from source, so a rename that updates only one side fails in
 * `npm test` — before it can ship, and attached to the diff that caused it.
 *
 * WHY THE TABLE CANNOT SILENTLY FALL BEHIND
 * -----------------------------------------
 * The smoke → handler mapping is a hand-written table (there is no way to
 * derive which handler a test function calls without executing it). A table
 * that is missing an entry looks exactly like a complete one, which is how
 * whitelists rot. So an unmapped smoke function that asserts warning keys is
 * itself a FAILURE, not a skip: adding warning assertions for a second tool
 * forces a line in this table.
 *
 * WHY COMMENTS ARE STRIPPED FIRST
 * -------------------------------
 * A rename usually leaves the OLD name behind in a comment explaining the
 * rename — both handlers do exactly that today. Matching against raw source
 * would therefore find `no_web_search_this_run` in the very commit that
 * removed it and pass. A guard that cannot tell code from prose would be
 * satisfied by the explanation instead of the fix.
 *
 * Source-reading, not network: these are properties of the text we ship.
 *
 * Run: npx tsx scripts/smoke-warning-contract-check.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const WEB = path.resolve(path.dirname(path.resolve(process.argv[1])), "..");
const SMOKE_REL = "scripts/semantic-smoke.ts";
const HANDLER_DIR = "src/app/api/x402/_handlers";

/** smoke test function → the handler whose warnings it asserts on. */
const CONTRACTS: Record<string, string> = {
  a4Brief: "rh-stock-agent-brief.ts",
};

let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail = "") {
  checks++;
  if (cond) console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

/**
 * Blanks `//` and block comments while preserving offsets. String and template
 * bodies are preserved — the keys we are looking for live inside them.
 */
function stripComments(src: string): string {
  const out = src.split("");
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") {
      while (i < n && src[i] !== "\n") { out[i] = " "; i++; }
    } else if (c === "/" && d === "*") {
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] !== "\n") out[i] = " ";
        i++;
      }
      out[i] = " "; out[i + 1] = " "; i += 2;
    } else if (c === '"' || c === "'" || c === "`") {
      const q = c; i++;
      while (i < n && src[i] !== q) { if (src[i] === "\\") i++; i++; }
      i++;
    } else i++;
  }
  return out.join("");
}

type Assertion = { fn: string; method: "startsWith" | "includes"; key: string };

/** `w.startsWith("key")` / `w.includes("key")` inside a warnings predicate. */
const ASSERT_RE = /\bw\.(startsWith|includes)\(\s*"([A-Za-z0-9_]+)"\s*\)/g;
/** A warning literal leading with `key: ` — the shape every handler emits. */
const EMIT_RE = /[`"']([A-Za-z0-9_]{4,}):[ ]/g;

/** Split a source file into top-level `async function <name>() { … }` blocks. */
function byFunction(src: string): { fn: string; body: string }[] {
  const starts = [...src.matchAll(/^async function (\w+)\(/gm)];
  return starts.map((m, i) => ({
    fn: m[1],
    body: src.slice(m.index!, i + 1 < starts.length ? starts[i + 1].index! : src.length),
  }));
}

function smokeAssertions(src: string): Assertion[] {
  const out: Assertion[] = [];
  for (const { fn, body } of byFunction(stripComments(src))) {
    for (const m of body.matchAll(ASSERT_RE)) {
      out.push({ fn, method: m[1] as Assertion["method"], key: m[2] });
    }
  }
  return out;
}

function emittedKeys(handlerSrc: string): string[] {
  return [...new Set([...stripComments(handlerSrc).matchAll(EMIT_RE)].map((m) => m[1]))];
}

/** Mirrors the smoke's own runtime predicate, so the two cannot disagree. */
function satisfied(a: Assertion, keys: string[]): boolean {
  return keys.some((k) => (a.method === "startsWith" ? k.startsWith(a.key) : k.includes(a.key)));
}

// ── 1. Every asserted key is mapped and emitted ──────────────────────────────
console.log("1. smoke warning keys exist in the handler under test");

const smokeSrc = readFileSync(path.join(WEB, SMOKE_REL), "utf8");
const assertions = smokeAssertions(smokeSrc);

check("the smoke asserts at least one warning key", assertions.length > 0,
  "an empty result would make every check below vacuously pass");

for (const a of assertions) {
  const handler = CONTRACTS[a.fn];
  // Unmapped is a failure, not a skip — see the header.
  if (!handler) {
    check(`${a.fn} is mapped to a handler in CONTRACTS`, false,
      `${a.fn}() asserts "${a.key}" but has no CONTRACTS entry; add one so the key is pinned`);
    continue;
  }
  const keys = emittedKeys(readFileSync(path.join(WEB, HANDLER_DIR, handler), "utf8"));
  check(
    `${handler} emits a warning satisfying ${a.fn}: w.${a.method}("${a.key}")`,
    satisfied(a, keys),
    `handler warning keys = ${JSON.stringify(keys)}`,
  );
}

// ── 2. The guard actually catches the bug it was written for ─────────────────
// Group 1's negative power is only as good as the extractor. These replay the
// exact 2026-09-24 regression from the real pre-rename text (2277f3aa^) and
// assert this file would have gone red on it.
console.log("\n2. mutation tests — the extractor catches the real regression");

const PRE_RENAME = 'llm_provider !== null && !llm_web_search_used ? `no_web_search_this_run: served by ${llm_provider} without external search — web_sources rely on training-data recall` : null,';
const POST_RENAME = 'llm_provider !== null && !llm_web_search_used ? `no_web_search: ${llm_provider} has no web-search capability — one_line_context is model recall` : null,';
const LIVE: Assertion = { fn: "a4Brief", method: "startsWith", key: "no_web_search" };
const STALE: Assertion = { fn: "a4Brief", method: "includes", key: "no_web_search_this_run" };

check("2.1 the shipped assertion passes against the shipped handler",
  satisfied(LIVE, emittedKeys(POST_RENAME)));
check("2.2 the STALE assertion fails against the renamed handler (the actual bug)",
  !satisfied(STALE, emittedKeys(POST_RENAME)),
  "this is the pair that went red for 7 scheduled runs");
check("2.3 the shipped assertion would ALSO have passed pre-rename",
  satisfied(LIVE, emittedKeys(PRE_RENAME)),
  "prefix match survives the deploy window; equality would not");
check("2.4 an unrelated rename is still caught",
  !satisfied(LIVE, emittedKeys('"websearch_absent: nope" : null,')));

check("2.5 comments are stripped, so an explanatory comment cannot satisfy the guard",
  !satisfied(STALE, emittedKeys(`// it said "no_web_search_this_run: served by x" until 2026-09-24\n${POST_RENAME}`)),
  "without stripping, the rename's own comment would pass the check it broke");
check("2.6 keys inside real string literals are still seen",
  satisfied(LIVE, emittedKeys(POST_RENAME)));

// ── 3. The smoke's own predicate is not vacuous ──────────────────────────────
// A "fix" that satisfies group 1 by weakening the smoke to `w.includes("")`
// would pass everything above while asserting nothing at all.
console.log("\n3. the assertions being pinned are non-vacuous");

for (const a of assertions) {
  check(`${a.fn}: "${a.key}" is a meaningful key`, a.key.length >= 8,
    `an empty or near-empty needle matches every warning`);
}

// ── Result ───────────────────────────────────────────────────────────────────
console.log(`\n${failures ? "FAIL" : "PASS"} — ${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
