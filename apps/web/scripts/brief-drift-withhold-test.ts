/**
 * Control test — a Blue Hood brief flagged `brief_number_drift` must not be
 * SERVED, and the instruction must stop pointing at it.
 *
 * Run: `npx tsx scripts/brief-drift-withhold-test.ts` from `apps/web/`.
 * Hermetic — pure functions over synthetic briefs. No KV, no network, no LLM.
 *
 * THE BUG THIS PINS. MEASURED 2026-09-26, arrow #0603 (NVDA, ROBINHOOD CHAIN
 * 4663 — not the Base 8453 NVDA, which is a different token): the LLM-written
 * `one_line_context` cited a DEX price of $224.78 and a 0.28% gap, while the
 * recorded `facts_at_fire.dex_price_usd` was 227.97, making the real gap 1.13%.
 * `detectBriefNumberDrift` CAUGHT IT — the response carried
 * `warnings: brief_number_drift 1.40pp`. And the brief was served anyway, with
 * an `instruction` telling the calling agent to answer the user from it.
 *
 * Detected, flagged, then ignored. The detection half was already done; this
 * file guards the acting-on-it half.
 *
 * WHAT MAKES THIS A CONTROL TEST AND NOT A COMMENT — Section E.
 *
 * "The withheld response has `one_line_context: null`" is trivially satisfied
 * by a build that nulls the field for EVERY arrow, and equally by one that
 * never populates it at all. So every withholding assertion is paired against a
 * clean brief that must survive byte-identical, and the whole battery is then
 * re-run in Section E against a deliberately broken pass-through — the exact
 * pre-fix behaviour — which it MUST fail. A guard that has never once gone red
 * is not a guard. Section E makes it go red on demand, in-process, every run.
 */

import {
  BRIEF_STATUS_WITHHELD,
  DRIFT_WARNING_PREFIX,
  briefHasNumberDrift,
  withholdDriftedBrief,
  withholdDriftedBriefs,
  withholdDriftedBriefRecord,
  hoodArrowInstruction,
  answerFromClause,
} from "../src/lib/blue-hood/brief-serving";
import { detectBriefNumberDrift } from "../src/lib/blue-hood/brief";
import type { Arrow, ArrowBrief } from "../src/lib/blue-hood/types";

let failures = 0;
function check(label: string, pass: boolean, detail: string) {
  console.log(`${pass ? "  ✓" : "  ✗"} ${label} — ${detail}`);
  if (!pass) failures++;
}

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

// ── Fixtures ───────────────────────────────────────────────────────────────
//
// The drift warning is produced by the REAL detector, never hand-written. A
// fixture carrying a hand-typed `"brief_number_drift: …"` string would keep
// passing after someone renamed the prefix in the emitter, which is precisely
// the coupling Section A exists to hold.

/** #0603's numbers: cited 0.28%, measured -1.68% → the 1.40pp that was logged. */
const DRIFTED_CONTEXT = "NVDA trading at $224.78 on the DEX, a 0.28% gap to the oracle.";
const FACTS_0603 = {
  dex_price_usd: 227.97,
  oracle_price_usd: 225.42,
  dex_tvl_usd: 412_000,
  dex_volume_24h_usd: 88_400,
  dex_change_24h_pct: -1.68,
  chainlink_age_seconds: 42,
};

function makeBrief(opts: { context: string | null; extraWarnings?: string[] }): ArrowBrief {
  const warnings = [
    "thin_dex_pool: primary pool TVL under $500k",
    ...detectBriefNumberDrift(opts.context, FACTS_0603),
    ...(opts.extraWarnings ?? []),
  ];
  return {
    verdict_note: "DEX is trading below the Chainlink feed; drift expected to close upward.",
    one_line_context: opts.context,
    warnings,
    llm_provider: "virtuals",
    llm_attempts: [{ provider: "virtuals", status: "success", duration_ms: 1840 }],
    facts_at_fire: FACTS_0603,
    fetched_at: "2026-09-26T14:02:11.000Z",
  };
}

/** Robinhood Chain 4663 — the chain #0603 actually fired on. */
function makeArrow(brief: ArrowBrief, serial = "#0603"): Arrow {
  return {
    id: `arrow-${serial}`,
    serial,
    ticker: "NVDA",
    chain: "robinhood",
    type: "drift",
    expected_direction: "up",
    grading_window_h: 2,
    reference_price: 227.97,
    snapshot_refs: [101, 102],
    fired_at: "2026-09-26T14:02:09.000Z",
    status: "graded",
    outcome: "hit",
    graded_at: "2026-09-26T16:02:09.000Z",
    outcome_detail: "gap closed 71% (1.13% → 0.33%)",
    origin: "engine",
    brief_status: "attached",
    brief,
  };
}

const driftedBrief = makeBrief({ context: DRIFTED_CONTEXT });
const cleanBrief = makeBrief({ context: "Earnings land after the close on 2026-11-19." });

// ── The battery, parameterised over an implementation ──────────────────────
//
// Section E feeds a broken implementation through this same function and
// asserts it comes back RED. That is only possible if the battery is a value,
// not a pile of inline `check()` calls, so it is written as one.

interface Impl {
  withholdArrow: (a: Arrow) => Arrow;
  instruction: (chain: string, withheld: boolean) => string;
}

const REAL: Impl = { withholdArrow: withholdDriftedBrief, instruction: hoodArrowInstruction };

/** The pre-fix behaviour, verbatim: detect, flag, serve it anyway. */
const PASSTHROUGH: Impl = {
  withholdArrow: (a) => a,
  instruction: (chain) =>
    `This arrow is on ${chain === "base" ? "Base 8453" : "Robinhood Chain 4663"} — STATE THAT CHAIN in your answer. Answer only from verdict_note, one_line_context and facts_at_fire.`,
};

/** Returns the list of assertion labels that FAILED under `impl`. */
function runBattery(impl: Impl): string[] {
  const failed: string[] = [];
  const t = (label: string, pass: boolean) => { if (!pass) failed.push(label); };

  const served = impl.withholdArrow(makeArrow(driftedBrief));
  const instruction = impl.instruction("robinhood", briefHasNumberDrift(driftedBrief));

  t("one_line_context nulled", served.brief?.one_line_context === null);
  t("brief_status set", served.brief?.brief_status === BRIEF_STATUS_WITHHELD);
  t("instruction omits one_line_context", !instruction.includes("one_line_context"));
  t("instruction names facts_at_fire", instruction.includes("facts_at_fire"));
  t("warnings survive", (served.brief?.warnings ?? []).some((w) => w.startsWith(DRIFT_WARNING_PREFIX)));
  t("verdict_note survives", (served.brief?.verdict_note ?? "").length > 0);

  // Clean side — the half that stops "null everything" from passing.
  const cleanServed = impl.withholdArrow(makeArrow(cleanBrief, "#0604"));
  t("clean context preserved", cleanServed.brief?.one_line_context === cleanBrief.one_line_context);
  t("clean brief_status absent", !has(cleanServed.brief as object, "brief_status"));

  return failed;
}

function main() {
  console.log("\nbrief_number_drift — detected, flagged, and now ACTED ON (arrow #0603, Robinhood Chain 4663)\n");

  // ── A. the detector and this consumer are pinned to one literal ──────────
  console.log("A. COUPLING — the guard recognises what the detector actually emits:");
  const realWarnings = detectBriefNumberDrift(DRIFTED_CONTEXT, FACTS_0603);
  check("#0603's text trips the real detector", realWarnings.length === 1, `${realWarnings.length} warning(s)`);
  check("and it is the 1.40pp that production logged",
    /drift 1\.40pp/.test(realWarnings[0] ?? ""), realWarnings[0] ?? "(none)");
  check("briefHasNumberDrift recognises the detector's own output",
    briefHasNumberDrift(driftedBrief), `warnings=${JSON.stringify(driftedBrief.warnings)}`);
  check("a clean brief is not flagged", !briefHasNumberDrift(cleanBrief),
    `warnings=${cleanBrief.warnings.length}`);
  check("a brief with unrelated warnings only is not flagged",
    !briefHasNumberDrift({ warnings: ["thin_dex_pool: x", "feed_abnormally_stale"] }), "2 unrelated warnings");
  check("a null/absent brief is not flagged",
    !briefHasNumberDrift(null) && !briefHasNumberDrift(undefined), "null + undefined");

  // ── B. the drifted brief is withheld ─────────────────────────────────────
  console.log("\nB. WITHHELD — the flagged sentence does not reach a reader:");
  const served = withholdDriftedBrief(makeArrow(driftedBrief));
  check("one_line_context served as null", served.brief?.one_line_context === null,
    String(served.brief?.one_line_context));
  check("the field still EXISTS as a key (consumers read it)",
    has(served.brief as object, "one_line_context"), "present");
  check(`brief.brief_status = ${BRIEF_STATUS_WITHHELD}`,
    served.brief?.brief_status === BRIEF_STATUS_WITHHELD, String(served.brief?.brief_status));
  check("the literal in types.ts matches the exported constant",
    BRIEF_STATUS_WITHHELD === "withheld_number_drift", BRIEF_STATUS_WITHHELD);

  // ── C. the evidence survives, and so does everything measured ───────────
  // Withholding the text while hiding the reason converts a VISIBLE
  // fabrication into an invisible one — strictly worse than the bug.
  console.log("\nC. EVIDENCE — warnings and every measured field pass through untouched:");
  check("the drift warning is still in warnings",
    (served.brief?.warnings ?? []).some((w) => w.startsWith(DRIFT_WARNING_PREFIX)),
    (served.brief?.warnings ?? []).find((w) => w.startsWith(DRIFT_WARNING_PREFIX)) ?? "MISSING");
  check("warnings array is value-identical to the source",
    JSON.stringify(served.brief?.warnings) === JSON.stringify(driftedBrief.warnings),
    `${served.brief?.warnings.length} entries`);
  check("facts_at_fire untouched (dex 227.97 on RH 4663)",
    JSON.stringify(served.brief?.facts_at_fire) === JSON.stringify(FACTS_0603),
    `dex=${served.brief?.facts_at_fire.dex_price_usd}`);
  check("verdict_note survives — it is code-mapped, not LLM-written",
    served.brief?.verdict_note === driftedBrief.verdict_note, "identical");
  check("llm provenance survives for audit",
    served.brief?.llm_provider === "virtuals" && served.brief?.llm_attempts.length === 1, "virtuals ×1");
  check("Arrow.brief_status (the PERSISTED lifecycle) is NOT repurposed",
    served.brief_status === "attached", String(served.brief_status));

  // ── D. a clean brief is served completely unchanged ─────────────────────
  console.log("\nD. NO REGRESSION — a clean brief is untouched, by identity:");
  const cleanArrow = makeArrow(cleanBrief, "#0604");
  const cleanServed = withholdDriftedBrief(cleanArrow);
  check("same object reference returned (not even copied)", cleanServed === cleanArrow, "identity");
  check("one_line_context preserved verbatim",
    cleanServed.brief?.one_line_context === cleanBrief.one_line_context,
    String(cleanServed.brief?.one_line_context));
  check("brief_status absent on a clean brief",
    !has(cleanServed.brief as object, "brief_status"), "absent");
  check("deep-equal to the source record",
    JSON.stringify(cleanServed) === JSON.stringify(cleanArrow), "deep-equal");
  check("clean instruction still names one_line_context (unchanged behaviour)",
    hoodArrowInstruction("robinhood", false).includes("one_line_context"),
    answerFromClause(false));

  console.log("\n   …and the source record is never mutated (shared warm-lambda cache):");
  const source = makeArrow(driftedBrief, "#0605");
  const before = JSON.stringify(source);
  withholdDriftedBrief(source);
  withholdDriftedBriefs([source]);
  withholdDriftedBriefRecord(source as unknown as Record<string, unknown>);
  check("source arrow unchanged after three projections",
    JSON.stringify(source) === before,
    JSON.stringify(source) === before ? "identical" : "SOURCE WAS MUTATED");
  check("stored one_line_context still carries the original text verbatim",
    source.brief?.one_line_context === DRIFTED_CONTEXT,
    "forward-only: a published arrow is never rewritten");

  // ── E. NEGATIVE CONTROL — prove the battery can go red ──────────────────
  console.log("\nE. NEGATIVE CONTROL — the pre-fix pass-through MUST fail this battery:");
  const realFailures = runBattery(REAL);
  check("the real implementation passes every assertion",
    realFailures.length === 0, realFailures.length ? `RED: ${realFailures.join(", ")}` : "8/8 green");
  const brokenFailures = runBattery(PASSTHROUGH);
  check("the pass-through implementation FAILS",
    brokenFailures.length > 0, brokenFailures.length ? `red on: ${brokenFailures.join(", ")}` : "PASSED — the battery proves nothing");
  // Name the three the revert must break, so a future battery that only
  // detects the break by accident still fails loudly and specifically.
  for (const required of ["one_line_context nulled", "brief_status set", "instruction omits one_line_context"]) {
    check(`  revert is caught by: "${required}"`, brokenFailures.includes(required),
      brokenFailures.includes(required) ? "caught" : "NOT CAUGHT — this assertion is decorative");
  }
  check("and the pass-through still passes the CLEAN assertions",
    !brokenFailures.includes("clean context preserved") && !brokenFailures.includes("clean brief_status absent"),
    "confirms the battery goes red on the withhold, not on noise");

  // ── F. the untyped twin behaves identically ─────────────────────────────
  // /api/mcp resolves its arrow off the public HTTP feed, so it holds a
  // Record<string, unknown>. Two code paths, one contract.
  console.log("\nF. MCP PARITY — the loose-typed twin agrees with the typed one:");
  const rec = withholdDriftedBriefRecord(makeArrow(driftedBrief) as unknown as Record<string, unknown>);
  const recBrief = rec.brief as ArrowBrief;
  check("record path nulls one_line_context", recBrief.one_line_context === null, String(recBrief.one_line_context));
  check("record path sets brief_status", recBrief.brief_status === BRIEF_STATUS_WITHHELD, String(recBrief.brief_status));
  check("record path keeps the drift warning",
    recBrief.warnings.some((w) => w.startsWith(DRIFT_WARNING_PREFIX)), `${recBrief.warnings.length} warnings`);
  const cleanRec = makeArrow(cleanBrief) as unknown as Record<string, unknown>;
  check("record path returns identity on a clean brief",
    withholdDriftedBriefRecord(cleanRec) === cleanRec, "identity");
  check("a record with no brief at all is passed straight through",
    withholdDriftedBriefRecord({ serial: "#0001" }).serial === "#0001", "no brief → no throw");

  // The MCP path applies this to an arrow the FEED already withheld — it reads
  // /api/hood/arrows over HTTP. That only works because `warnings` survives the
  // first pass, so the second pass can still tell the brief was flagged and
  // pick the right `instruction`. If withholding ever started stripping its own
  // warning, this is the assertion that would catch it: the double application
  // would go quiet and the MCP instruction would silently revert to the clean
  // one, pointing an agent at a field that is null.
  const twice = withholdDriftedBriefRecord(rec);
  const twiceBrief = twice.brief as ArrowBrief;
  check("re-applying to an already-withheld brief is idempotent",
    twiceBrief.one_line_context === null && twiceBrief.brief_status === BRIEF_STATUS_WITHHELD,
    `context=${twiceBrief.one_line_context} status=${twiceBrief.brief_status}`);
  check("and the second pass STILL detects the drift (MCP depends on this)",
    briefHasNumberDrift(twice.brief), "warning survived the first pass");

  // ── G. chain labelling (CLAUDE.md hard rule 1) ──────────────────────────
  console.log("\nG. CHAIN — every instruction states its chain; 4663 and 8453 never blur:");
  const rhWithheld = hoodArrowInstruction("robinhood", true);
  const baseWithheld = hoodArrowInstruction("base", true);
  check("RH instruction says Robinhood Chain 4663",
    rhWithheld.includes("Robinhood Chain 4663") && !rhWithheld.includes("8453"), "4663 only");
  check("Base instruction says Base 8453",
    baseWithheld.includes("Base 8453") && !baseWithheld.includes("4663"), "8453 only");
  check("withheld instruction never names the withheld field",
    !rhWithheld.includes("one_line_context") && !baseWithheld.includes("one_line_context"), "absent on both");
  check("withheld instruction points at the measured fields instead",
    rhWithheld.includes("facts_at_fire") && rhWithheld.includes("verdict_note"), "both named");

  console.log(failures === 0
    ? "\n✓ all brief-drift withholding assertions passed\n"
    : `\n✗ ${failures} assertion(s) failed\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
