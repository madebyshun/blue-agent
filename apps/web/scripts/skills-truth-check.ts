/**
 * Skills truth — the grounding we ship must resolve, must agree with itself,
 * and must not teach code that cannot run.
 *
 * WHY THIS EXISTS
 * ---------------
 * `skills/*.md` is not documentation. Every file named in `SKILL_REGISTRY` is
 * concatenated into the SYSTEM PROMPT of `blue idea|build|audit|ship|raise`, and
 * that path is the only inference path in THREE published packages —
 * `@blueagent/builder`, `@blueagent/skill` and `@blueagent/sdk`. A wrong sentence
 * in one of those files is not a stale doc; it is an instruction the model follows.
 *
 * MEASURED 2026-09-18, all four on `main`, all four shipped to npm:
 *
 *   1. `bankr-tools.md` — injected into `build` — described `llm.bankr.bot` as the
 *      LLM gateway, `BANKR_API_KEY` as the credential, and told readers to install
 *      `@blue-agent/bankr` and `@blue-agent/payments`. Bankr has been 403-banned
 *      for writes since 2026-07-20 (account-level, re-measured 2026-09-06), the
 *      env var is dead as an inference credential, and both packages are
 *      `private: true` in this monorepo — `npm i` returns E404. So `blue build`
 *      was reliably emitting code that cannot install and could not authenticate
 *      if it did. Renamed to `blue-agent-platform.md`; see registry.ts for why a
 *      rename rather than a rewrite was the only fix that reaches existing users.
 *
 *   2. `SKILL_REGISTRY` named `base-4337-aa` for idea/build/audit. No file of that
 *      name has ever existed. It did not throw: `loadSkill` warns and returns "",
 *      so three commands quietly shipped 4–5 skills while the registry advertised
 *      5–6. A silent-partial is exactly the failure a human reader cannot catch,
 *      which is the argument for putting this in CI rather than in a checklist.
 *
 *   3. `x402-escrow-patterns.md` had drifted 108 lines between `skills/` and
 *      `packages/builder/skills/` — two copies of the same shipped file saying
 *      different things, with the STALE one being the copy the npm package ships.
 *      Nothing in the repo compared them.
 *
 *   4. `agent-transaction-verification.md` carried a TypeScript fence importing
 *      `callBankrLLM` from `@blueagent/bankr` (a package that does not exist at
 *      all — the private workspace one is `@blue-agent/bankr`), calling it with
 *      `model: "claude-opus-4-5"` and reading `.content[0].text` off the result.
 *      Four independent faults in nine lines, in a file `blue init` copies to
 *      every user's machine.
 *
 * WHAT WOULD ROT SILENTLY, AND WHY EACH NEEDS A TEST
 * -------------------------------------------------
 * 1. A registry name with no file. Warns and continues (fault 2) — invisible.
 * 2. The two skill trees drifting apart. Invisible until a user reads the copy
 *    you weren't looking at (fault 3).
 * 3. `doctor.ts`'s hardcoded SKILL_FILES list. This one is the opposite of
 *    silent and that is its own hazard: any mismatch makes `blue doctor` print
 *    a red ✗ and `process.exit(1)` on a HEALTHY install. Renaming a skill
 *    without editing that list breaks the tool whose entire job is to tell the
 *    user nothing is broken.
 * 4. Dead hosts / phantom packages / stale model ids inside CODE — fences in
 *    skills, and template sources verbatim. Prose may and should name a dead
 *    thing (that is how the history above stays legible); code may not, because
 *    code gets copied.
 * 5. `/api/x402/<id>` paths in that same code. A price and a call site that
 *    resolve to a 404 are worse than none — the caller budgets against them.
 * 6. A published package depending on a `private: true` workspace package.
 *    It resolves locally forever and E404s for every user.
 *
 * SCOPE, STATED HONESTLY
 * ----------------------
 * Checks 4 and 5 scan the SHIPPED set only: `packages/builder/skills/**` (the
 * files in builder's `files[]`, which `blue init` copies) plus
 * `packages/builder/templates/**` (scaffolded verbatim by `blue new`), plus any
 * root `skills/` file named in `SKILL_REGISTRY`. Root-only files that are
 * neither shipped by builder nor injected by the registry are deliberately out
 * of scope here. That carve-out existed for `skills/aeon-distribute-tokens.md`,
 * which named the banned Bankr write path on purpose; it and the other four
 * `aeon-*.md` files were deleted on 2026-09-25, so the exemption now protects
 * nothing in particular and is kept only as a statement of where the scope
 * line sits. Widening it later is a one-line change to SHIPPED_DOCS; leaving
 * it undeclared would be the dishonest option.
 *
 * Every absence assertion below is paired with a presence assertion on the
 * thing it parsed. An "assert absence" test that silently parses nothing is
 * a test that passes by deleting the subject, which is the failure mode of
 * every check of this shape.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { AGENT_TOOLS } from "../src/lib/agent-tools";

const REPO = join(__dirname, "..", "..", ".."); // scripts → web → apps → repo root
const ROOT_SKILLS = join(REPO, "skills");
const PKG_SKILLS = join(REPO, "packages", "builder", "skills");
const TEMPLATES = join(REPO, "packages", "builder", "templates");

let checks = 0;
let failures = 0;

function check(name: string, cond: boolean, detail = "") {
  checks++;
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

function read(p: string) {
  return readFileSync(p, "utf8");
}

function mdFiles(dir: string) {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort();
}

/** Every file under `dir`, recursively, as repo-relative paths. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * Concatenate only the fenced code blocks of a markdown file.
 *
 * This distinction is the whole point of checks 4 and 5: `blue-agent-platform.md`
 * has to be able to SAY "llm.bankr.bot is not the gateway" without that sentence
 * tripping the rule that exists to stop anyone CALLING llm.bankr.bot.
 */
function fencedCode(md: string): string {
  const blocks: string[] = [];
  let inside = false;
  for (const line of md.split("\n")) {
    if (/^\s*```/.test(line)) {
      inside = !inside;
      continue;
    }
    if (inside) blocks.push(line);
  }
  return blocks.join("\n");
}

console.log("\nskills truth check\n");

// ─────────────────────────────────────────────────────────────────────────────
// 1. Every SKILL_REGISTRY name resolves — in BOTH trees.
//
// apps/web does not depend on @blueagent/core, so the registry is parsed
// textually rather than imported. That makes a silent parse failure the obvious
// risk, hence the non-empty assertion first.
// ─────────────────────────────────────────────────────────────────────────────
const registrySrc = read(join(REPO, "packages", "core", "src", "registry.ts"));
const registryBody = registrySrc.slice(
  registrySrc.indexOf("export const SKILL_REGISTRY"),
  registrySrc.indexOf("};", registrySrc.indexOf("export const SKILL_REGISTRY")),
);
const registryEntries = [...registryBody.matchAll(/^\s*(\w+):\s*\[([^\]]*)\]/gm)].map(
  ([, task, names]) => ({
    task,
    names: [...names.matchAll(/"([^"]+)"/g)].map((m) => m[1]),
  }),
);
const registryNames = [...new Set(registryEntries.flatMap((e) => e.names))].sort();

check(
  "SKILL_REGISTRY parsed (guard is not vacuous)",
  registryEntries.length === 5 && registryNames.length > 0,
  `${registryEntries.length} task(s), ${registryNames.length} distinct skill(s)`,
);

for (const { task, names } of registryEntries) {
  const missing = names.filter(
    (n) => !existsSync(join(ROOT_SKILLS, `${n}.md`)) || !existsSync(join(PKG_SKILLS, `${n}.md`)),
  );
  check(
    `SKILL_REGISTRY.${task} — all ${names.length} names resolve in both trees`,
    missing.length === 0,
    missing.length ? `unresolvable: ${missing.join(", ")}` : names.join(", "),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. The two skill trees agree.
//
// Subset, not equality: `skills/` legitimately holds files builder does not ship
// (the launch guides, a README). The invariant is that anything builder DOES
// ship is byte-identical to the root copy, and that builder never carries a
// file the root tree has never seen.
//
// This used to open the parenthetical with "the five Aeon skills"; those were
// deleted 2026-09-25 with the Bankr purge. The subset relation is unchanged —
// it was never load-bearing on them — but naming a deleted file as the reason
// for a rule is how a rule outlives its reason.
// ─────────────────────────────────────────────────────────────────────────────
const pkgSkillFiles = mdFiles(PKG_SKILLS);
check("packages/builder/skills is non-empty", pkgSkillFiles.length > 0, `${pkgSkillFiles.length} files`);

const orphaned = pkgSkillFiles.filter((f) => !existsSync(join(ROOT_SKILLS, f)));
check(
  "every shipped skill exists in skills/",
  orphaned.length === 0,
  orphaned.length ? `builder-only: ${orphaned.join(", ")}` : `${pkgSkillFiles.length} files`,
);

const drifted = pkgSkillFiles.filter(
  (f) => existsSync(join(ROOT_SKILLS, f)) && read(join(PKG_SKILLS, f)) !== read(join(ROOT_SKILLS, f)),
);
check(
  "skills/ and packages/builder/skills/ are byte-identical",
  drifted.length === 0,
  drifted.length ? `drifted: ${drifted.join(", ")}` : `${pkgSkillFiles.length} files compared`,
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. `blue doctor` agrees with what is actually on disk.
// A mismatch here fails a HEALTHY install, loudly, in the diagnostic tool.
// ─────────────────────────────────────────────────────────────────────────────
const doctorSrc = read(join(REPO, "packages", "builder", "src", "commands", "doctor.ts"));
const doctorBody = doctorSrc.slice(
  doctorSrc.indexOf("const SKILL_FILES"),
  doctorSrc.indexOf("];", doctorSrc.indexOf("const SKILL_FILES")),
);
const doctorFiles = [...doctorBody.matchAll(/"([^"]+\.md)"/g)].map((m) => m[1]).sort();

check("doctor.ts SKILL_FILES parsed", doctorFiles.length > 0, `${doctorFiles.length} entries`);

const doctorGhosts = doctorFiles.filter((f) => !pkgSkillFiles.includes(f));
const doctorMissing = pkgSkillFiles.filter((f) => !doctorFiles.includes(f));
check(
  "doctor.ts SKILL_FILES == packages/builder/skills/*.md",
  doctorGhosts.length === 0 && doctorMissing.length === 0,
  doctorGhosts.length || doctorMissing.length
    ? `checks-for-but-absent: [${doctorGhosts.join(", ")}] · on-disk-but-unchecked: [${doctorMissing.join(", ")}]`
    : `${doctorFiles.length} entries match`,
);

// ─────────────────────────────────────────────────────────────────────────────
// 4 + 5. Nothing dead inside shipped CODE.
//
// SHIPPED_DOCS = what `blue init` copies + what the registry injects.
// SHIPPED_CODE = what `blue new` scaffolds, taken verbatim (a template's own
// comments get copied into the user's repo, so they are code here too).
// ─────────────────────────────────────────────────────────────────────────────
// An unresolvable registry name is already a FAIL in check 1; filtering here keeps
// checks 4+5 running on the rest instead of dying at the first missing file.
const SHIPPED_DOCS = [
  ...pkgSkillFiles.map((f) => join(PKG_SKILLS, f)),
  ...registryNames.map((n) => join(ROOT_SKILLS, `${n}.md`)),
].filter((f) => existsSync(f));
const SHIPPED_CODE = walk(TEMPLATES).filter((f) => !f.endsWith(".md"));
const TEMPLATE_DOCS = walk(TEMPLATES).filter((f) => f.endsWith(".md"));

check(
  "shipped surface located",
  SHIPPED_DOCS.length > 0 && SHIPPED_CODE.length > 0,
  `${SHIPPED_DOCS.length} skill docs, ${SHIPPED_CODE.length} template sources, ${TEMPLATE_DOCS.length} template docs`,
);

/** Each entry: [pattern, why it must never appear in runnable code]. */
const BANNED: Array<[RegExp, string]> = [
  [/llm\.bankr\.bot/, "403-banned host — account-level, measured 2026-09-06"],
  [/@blue-?agent\/bankr/, "private: true in this monorepo — npm i returns E404"],
  [/@blue-?agent\/payments/, "private: true in this monorepo — npm i returns E404"],
  [/blueagent\.xyz/, "domain we do not serve; the product domain is blueagent.dev"],
  [/api\.venice\.ai/, "no request has reached Venice since 2026-07-25"],
  [/["']claude-[a-z0-9-]+["']/, "Anthropic model id — not in the Virtuals catalog, returns 400"],
  [/["']gpt-[0-9][a-z0-9.-]*["']/, "OpenAI model id — not in the Virtuals catalog, returns 400"],
];

for (const [label, sources] of [
  ["shipped skill fences", SHIPPED_DOCS.map((f) => [f, fencedCode(read(f))] as const)],
  ["template docs fences", TEMPLATE_DOCS.map((f) => [f, fencedCode(read(f))] as const)],
  ["template sources", SHIPPED_CODE.map((f) => [f, read(f)] as const)],
] as const) {
  const hits: string[] = [];
  for (const [file, code] of sources) {
    for (const [pattern, why] of BANNED) {
      const m = code.match(pattern);
      if (m) hits.push(`${relative(REPO, file)}: ${m[0]} (${why})`);
    }
  }
  check(`${label} — no dead host / phantom package / stale model id`, hits.length === 0, hits.join(" · "));
}

const IDS = new Set(AGENT_TOOLS.map((t) => t.id));
check("catalog loaded", IDS.size > 0, `${IDS.size} live tool ids`);

const deadIds: string[] = [];
for (const [file, code] of [
  ...SHIPPED_DOCS.map((f) => [f, fencedCode(read(f))] as const),
  ...TEMPLATE_DOCS.map((f) => [f, fencedCode(read(f))] as const),
  ...SHIPPED_CODE.map((f) => [f, read(f)] as const),
]) {
  for (const m of code.matchAll(/\/api\/x402\/([a-z0-9][a-z0-9-]*)/g)) {
    if (!IDS.has(m[1])) deadIds.push(`${relative(REPO, file)}: ${m[1]}`);
  }
}
check(
  "every /api/x402/<id> in shipped code resolves to a live tool",
  deadIds.length === 0,
  deadIds.length ? deadIds.join(" · ") : "all resolve",
);

// ─────────────────────────────────────────────────────────────────────────────
// 6. No published package depends on one we never publish.
// ─────────────────────────────────────────────────────────────────────────────
const pkgDirs = readdirSync(join(REPO, "packages")).filter((d) =>
  existsSync(join(REPO, "packages", d, "package.json")),
);
const manifests = pkgDirs.map(
  (d) => JSON.parse(read(join(REPO, "packages", d, "package.json"))) as {
    name: string;
    private?: boolean;
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  },
);
const privateNames = new Set(manifests.filter((m) => m.private).map((m) => m.name));
const workspaceNames = new Set(manifests.map((m) => m.name));

check("workspace manifests loaded", manifests.length > 0, `${manifests.length} packages, ${privateNames.size} private`);

const badDeps: string[] = [];
for (const m of manifests) {
  if (m.private) continue; // a private package may depend on another private one
  for (const field of ["dependencies", "peerDependencies"] as const) {
    for (const dep of Object.keys(m[field] ?? {})) {
      if (!workspaceNames.has(dep)) continue; // external dep — npm's problem, not ours
      if (privateNames.has(dep)) badDeps.push(`${m.name} → ${dep} (private: true)`);
    }
  }
}
check(
  "no published package depends on a private workspace package",
  badDeps.length === 0,
  badDeps.length ? badDeps.join(" · ") : "clean",
);

console.log(
  failures === 0 ? `\nALL ${checks} CHECKS PASSED\n` : `\n${failures} of ${checks} CHECK(S) FAILED\n`,
);
process.exit(failures === 0 ? 0 : 1);
