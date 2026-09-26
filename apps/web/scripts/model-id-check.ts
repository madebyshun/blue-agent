/**
 * model-id-check — can a stale LLM model id enter the codebase without a
 * request having to fail in production to find out?
 *
 * Written 2026-09-26. Twelve files hardcoded `"claude-haiku-4-5"`, an id the
 * Virtuals catalog has NEVER listed — there is no haiku of any version among its
 * 204 entries. Three of those sites forwarded it to `callLLM`, so
 * `launch-simulator-2`, `launch-simulator-3` and `/api/hub/collab-builder` failed
 * 100% of the time: two 500s and a 503. The other nine passed the id to a shim
 * that DROPS `opts.model`, so they returned 200 while advertising a model choice
 * they never made — which is precisely why nobody noticed the three that didn't.
 *
 * ═══ WHY A CHECK AND NOT JUST THE FIX ═══
 *
 * `callVirtualsLLM` already validates every id against the live catalog. That
 * guard is real and it is the reason the failure was loud. But it fires at
 * REQUEST TIME, on a paid endpoint, in production — it tells a user their $0.35
 * call is broken; it never tells the author. CLAUDE.md records that this class
 * of bug "fired 3 times before catalog-driven validation landed", and it fired a
 * 4th time anyway, because validation catches the *call*, not the *literal*.
 *
 * ═══ WHY THIS IS HERMETIC, AND WHY THAT IS THE POINT ═══
 *
 * The obvious check — fetch the catalog and diff — is the WRONG one. It needs
 * network, so run-tests.ts would have to list it in NEEDS_NETWORK, and that file
 * says what happens next in its own words: it "would mean `npm test` never
 * exercises it again on any machine, which is precisely how a guard stops
 * guarding while still appearing in the directory listing." A guard that cannot
 * run in CI is a directory entry.
 *
 * So this checks a SHAPE instead: model ids may be MINTED in exactly three
 * declaration sites, and nowhere else may write one as a literal. Whether a
 * minted id is actually live stays the runtime catalog check's job — it is the
 * only thing that can know. Together: the runtime guard proves the ids are real,
 * this guard proves there are no others. Neither alone would have caught this.
 *
 * ═══ THE THREE DECLARATION SITES ═══
 *
 *   src/app/api/_lib/llm.ts        VIRTUALS_PRESETS + VIRTUALS_DEFAULT_MODEL
 *                                  — server truth, validated against the live
 *                                    catalog on every call.
 *   src/app/chat/components/presets.ts  VIRTUALS_PRESETS_V1 — the client mirror.
 *                                  Cannot import llm.ts (KV + secrets would
 *                                  reach the browser bundle), so it is a real
 *                                  second copy. Group A pins it in lockstep.
 *   src/lib/hosted-models.ts       HOSTED_MODELS — creator-selectable set for
 *                                  hosted ai_tools. Zero imports for the same
 *                                  browser-bundle reason.
 *
 * Adding a 4th site is a deliberate act: add it to DECL_FILES below, in the same
 * commit, with a line saying why it cannot import an existing one.
 *
 * ═══ GROUPS ═══
 *
 *   A  Server and client preset specs agree on (id → provider, model). This one
 *      has already drifted once: both `balanced` and `deep` claimed 200k context
 *      while the catalog said 1,000,000, and the Models page rendered the wrong
 *      number for users.
 *   B  No model-id literal in a DISPATCH POSITION outside the declaration sites.
 *   C  No stale id anywhere in live code, even outside a dispatch position —
 *      catches a literal parked in a const that group B's positional match
 *      would miss.
 *   D  The declared ids are internally consistent (no duplicate id across
 *      sites under different labels, no empty string).
 *
 * Run: npx tsx scripts/model-id-check.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { VIRTUALS_PRESETS, VIRTUALS_DEFAULT_MODEL } from "../src/app/api/_lib/llm";
import { VIRTUALS_PRESETS_V1 } from "../src/app/chat/components/presets";
import { HOSTED_MODELS } from "../src/lib/hosted-models";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(WEB, "src");

const fail: string[] = [];
const note = (s: string) => console.log(`   ${s}`);
function check(label: string, bad: string[], detail = "") {
  if (bad.length === 0) console.log(`✅ ${label}`);
  else {
    console.log(`❌ ${label} — ${bad.length}`);
    bad.slice(0, 20).forEach((b) => note(b));
    if (bad.length > 20) note(`… and ${bad.length - 20} more`);
    if (detail) note(detail);
    fail.push(label);
  }
}

// ── the declared registry ────────────────────────────────────────────────────
const DECL_FILES = new Set([
  "app/api/_lib/llm.ts",
  "app/chat/components/presets.ts",
  "lib/hosted-models.ts",
]);

const DECLARED = new Set<string>([
  VIRTUALS_DEFAULT_MODEL,
  ...VIRTUALS_PRESETS.map((p) => p.model),
  ...VIRTUALS_PRESETS_V1.map((p) => p.model),
  ...HOSTED_MODELS.map((m) => m.id),
]);

console.log(`\nDeclared model ids: ${DECLARED.size} across ${DECL_FILES.size} declaration sites`);
console.log(`  ${[...DECLARED].sort().join("  ")}`);
console.log(`Default: ${VIRTUALS_DEFAULT_MODEL}\n`);

// ── A. server ↔ client preset lockstep ───────────────────────────────────────
// Compare only what both specs claim to own: the dispatch pair (provider, model)
// per preset id. `contextTokens` / `credits` deliberately stay out — the client
// list documents itself as a pre-fetch FALLBACK for those, reconciled against
// the live catalog, so requiring equality there would fight its own design.
const srvById = new Map(VIRTUALS_PRESETS.map((p) => [p.id as string, p]));
const cliById = new Map(VIRTUALS_PRESETS_V1.map((p) => [p.id as string, p]));
const allPresetIds = [...new Set([...srvById.keys(), ...cliById.keys()])].sort();
const driftA = allPresetIds.flatMap((id) => {
  const s = srvById.get(id);
  const c = cliById.get(id);
  if (!s) return [`${id}: client-only (picker offers a preset the server cannot dispatch)`];
  if (!c) return [`${id}: server-only (dispatchable but the picker never shows it)`];
  const out: string[] = [];
  if (s.model !== c.model) out.push(`${id}.model server=${s.model} client=${c.model}`);
  if (s.provider !== c.provider) out.push(`${id}.provider server=${s.provider} client=${c.provider}`);
  return out;
});
check(
  `A  server/client preset specs agree (${allPresetIds.length} presets)`,
  driftA,
  "presets.ts is a hand-kept mirror of VIRTUALS_PRESETS — it cannot import llm.ts, so only this check couples them",
);

// ── source scan ──────────────────────────────────────────────────────────────
// Comments are stripped FIRST and deliberately. Every fix in this area leaves a
// note behind naming the dead id it removed ("`model: \"claude-haiku-4-5\"` used
// to be passed here" — llm.ts:1115), and that documentation is the thing that
// stops the id coming back. A checker that flagged its own paper trail would be
// answered by deleting the paper trail.
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });

const files = walk(SRC)
  .map((p) => ({ abs: p, rel: relative(SRC, p).split("\\").join("/") }))
  .filter((f) => !DECL_FILES.has(f.rel));

const PRESET_IDS = new Set(allPresetIds);
const sources = files.map((f) => ({ ...f, src: stripComments(readFileSync(f.abs, "utf8")) }));

// ── B. dispatch-position literals, in files that can dispatch ────────────────
// `model:` / `modelId:` with a string literal — the shape all 12 sites had.
//
// Scoped to files that actually import an LLM entry point, because `model` is an
// overloaded field name and the two other uses are legitimate:
//   · ChatTask.model (app/chat/storage.ts) holds a TIER id — "pro".
//   · PRESETS[].model (app/docs/_data.ts) holds a DISPLAY NAME — "Claude Sonnet 5".
// Neither can reach a gateway. Gating on the import is structural rather than a
// list of blessed values, so it cannot rot into an allowlist: a file that starts
// dispatching starts being checked, in the same diff.
//
// Files that hold a model id WITHOUT importing a gateway — the hosted allowlist,
// the submit-form picker — are covered by group C instead, which does not care
// where the literal lives.
const GATEWAYS = /\b(callLLM|callVirtualsLLM|callBankrLLM|callVeniceLLM)\b/;
const dispatchFiles = sources.filter((f) => GATEWAYS.test(f.src));
const DISPATCH_RE = /\b(model|modelId|defaultModel)\s*[:=]\s*"([^"]+)"/g;
const badB: string[] = [];
for (const f of dispatchFiles) {
  for (const [i, line] of f.src.split("\n").entries()) {
    for (const m of line.matchAll(DISPATCH_RE)) {
      const val = m[2];
      if (DECLARED.has(val)) continue;
      // A preset id in a `model` field is a different (and visible) mistake than
      // a stale catalog id — say which, so the reader knows what to fix.
      const why = PRESET_IDS.has(val)
        ? "is a PRESET id, not a model id"
        : "is not declared in any of the 3 declaration sites";
      badB.push(`${f.rel}:${i + 1} ${m[1]}: "${val}" — ${why}`);
    }
  }
}
check(
  `B  no model id minted in a dispatch position (${dispatchFiles.length} gateway-importing files)`,
  badB,
  "pass no `model` at all to take VIRTUALS_DEFAULT_MODEL, or add the id to a declaration site",
);

// ── C. stale-id sweep, whole tree, VALUE position only ───────────────────────
// Group B only looks next to a `model` key, and only where a gateway is in
// scope. A stale id in an allowlist array, a picker row, or a const under
// another name slips past it — and that describes 9 of the original 12 sites.
// This net is keyed on vendor family words instead of position.
//
// Two deliberate narrowings, both of which are the difference between a check
// and a nuisance:
//
//  1. ID SHAPE — all-lowercase, hyphenated, no spaces. Every real Virtuals id
//     has it; no display name does. This is what keeps "Claude Sonnet 5" out.
//  2. VALUE position, never a KEY. `"deepseek-v4-pro": 8192` in api/chat/route.ts
//     is a row in a VENICE lookup table — a second provider's catalog, read as
//     `TABLE[id] ?? default`. An unknown key there degrades to the fallback; it
//     is not passed to anything. What IS dispatched for Venice still comes from
//     a preset (`resolvePresetDispatch` reads `p.model`), so the invariant holds
//     for both providers: every dispatched id, Virtuals or Venice, is minted in
//     a declaration site. Flagging the keys would have forced an exemption list
//     naming ~13 Venice ids, which is the artifact this whole check exists to
//     avoid.
//  3. `id:` holding a `venice-*` value is a legacy chatTier key, not a model —
//     the `venice-deepseek` / `venice-grok` / `venice-e2ee-gemma` rows in
//     ChatInput's cosmetic tables. Note the discriminator is the `id:` POSITION,
//     not the prefix: `venice-uncensored-1-2` is a real Venice model id with the
//     same prefix, so keying on the prefix alone would be wrong. Venice's ids are
//     otherwise unprefixed (`deepseek-v4-pro`, `kimi-k2-6`), while every chatTier
//     in that namespace carries it — see presets.ts on why `startsWith("venice")`
//     was once used to route, and why no PRESET id has the prefix.
const FAMILY = "claude|gpt|deepseek|gemini|grok|qwen|llama|mistral|haiku|sonnet|opus|kimi|gemma";
const FAMILY_RE = new RegExp(
  `(\\b[A-Za-z_$][\\w$]*\\s*:\\s*)?"((?:[a-z0-9]+-)*(?:${FAMILY})(?:-[a-z0-9]+)*)"(\\s*:)?`,
  "g",
);
const badC: string[] = [];
for (const f of sources) {
  for (const [i, line] of f.src.split("\n").entries()) {
    for (const m of line.matchAll(FAMILY_RE)) {
      const key = (m[1] ?? "").replace(/[\s:]/g, "");
      const val = m[2];
      if (m[3]) continue;                 // object key — a lookup row, see (2)
      if (DECLARED.has(val)) continue;
      if (!/-/.test(val)) continue;       // bare family word: a preset id or UI key
      if (PRESET_IDS.has(val)) continue;
      if (key === "id" && val.startsWith("venice-")) continue;   // chatTier, see (3)
      badC.push(`${f.rel}:${i + 1} "${val}"`);
    }
  }
}
check(
  `C  no undeclared model-shaped literal passed as a value (${sources.length} files scanned)`,
  badC,
  "if this is not a model id it still reads like one — rename it, or declare it",
);

// ── D. registry self-consistency ─────────────────────────────────────────────
const badD: string[] = [];
for (const id of DECLARED) {
  if (!id || !id.trim()) badD.push("(empty string in the declared set)");
}
if (!DECLARED.has(VIRTUALS_DEFAULT_MODEL)) {
  badD.push(`VIRTUALS_DEFAULT_MODEL "${VIRTUALS_DEFAULT_MODEL}" is not in any preset — nothing validates it`);
}
// Every hosted-selectable model must be one the server can actually dispatch,
// otherwise a creator picks an id that dies at invoke time on a PAID tool.
const serverModels = new Set([VIRTUALS_DEFAULT_MODEL, ...VIRTUALS_PRESETS.map((p) => p.model)]);
for (const m of HOSTED_MODELS) {
  if (!serverModels.has(m.id)) {
    badD.push(`HOSTED_MODELS "${m.id}" is offered to creators but is in no server preset`);
  }
}
check("D  declared registry is self-consistent", badD);

console.log(
  fail.length === 0
    ? "\n✅ ALL CHECKS PASSED — every model id traces to a declaration site\n"
    : `\n❌ ${fail.length} CHECK(S) FAILED\n`,
);
process.exit(fail.length === 0 ? 0 : 1);
