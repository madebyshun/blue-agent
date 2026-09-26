/**
 * Blue Hood — SERVE-TIME withholding of a brief line that failed number
 * reconciliation.
 *
 * WHY THIS EXISTS. `detectBriefNumberDrift` (lib/blue-hood/brief.ts) already
 * compares every "X%" the LLM wrote in `one_line_context` against the measured
 * `facts_at_fire`, and appends a `brief_number_drift: …` warning when they do
 * not reconcile. That half worked. MEASURED 2026-09-26 on arrow #0603 (NVDA,
 * Robinhood Chain 4663): the one-liner claimed a DEX price of $224.78 and a
 * 0.28% gap while `facts_at_fire.dex_price_usd` recorded 227.97 — a real gap of
 * 1.13%. The response carried `warnings: brief_number_drift 1.40pp`, the brief
 * was served anyway, AND the `instruction` field told the calling agent to
 * answer the user FROM that sentence.
 *
 * So the system detected its own fabricated number, flagged it, and then
 * pointed the agent straight at it. This module is the acting-on-it half.
 *
 * THE RULE, in three parts, all of which have to hold together:
 *   1. `one_line_context` is served as `null` — the flagged prose does not
 *      reach a reader.
 *   2. `brief_status: "withheld_number_drift"` says the null is a DECISION,
 *      not an absence. A bare null is indistinguishable from "the LLM chain
 *      failed", which is a different fact.
 *   3. `warnings` is passed through UNTOUCHED. The evidence is the point.
 *      Withholding the text while also hiding the reason would convert a
 *      visible fabrication into an invisible one, which is strictly worse than
 *      the bug being fixed.
 *
 * And the fourth part, which lives at the call sites: an `instruction` that
 * still names the withheld field is the bug repeating itself one field over.
 * `answerFromClause()` below is the single source of that sentence so the two
 * agent-facing surfaces (`/api/mcp` and `/api/chat`, both `hub_hood_arrow`)
 * cannot drift into disagreeing about what an agent may quote.
 *
 * ⚠️ THIS IS A PROJECTION, NOT A CORRECTION, AND NOT A DELETION. Same law as
 * `arrow-fields.ts`: nothing here writes, nothing here regrades, and nothing
 * here touches the stored record. The arrow in KV keeps its original
 * `one_line_context` verbatim — a published number stays exactly as published,
 * wrong ones included, because rewriting history is how a public track record
 * stops being a track record. What changes is only what leaves the server from
 * this moment forward.
 *
 * ⚠️ NOT THE SAME FIELD AS `Arrow.brief_status`. That one is the PERSISTED
 * lifecycle of the async brief worker (`pending` → `attached` / `failed` /
 * `skipped`) and is untouched here: an arrow whose context line is withheld is
 * still `attached`, because the brief genuinely did attach and its
 * deterministic `verdict_note` is still good. The field added here lives on
 * `ArrowBrief`, is never persisted, and is absent on every clean response.
 */
import type { ArrowBrief } from "./types";

/**
 * The prefix `detectBriefNumberDrift` emits. Exported so the detector and this
 * consumer are pinned to one literal — `brief-drift-withhold-test.ts` feeds the
 * real detector's output through `briefHasNumberDrift` for exactly that reason.
 * A guard that recognises a string the emitter stopped producing is a comment.
 */
export const DRIFT_WARNING_PREFIX = "brief_number_drift";

/** The value `ArrowBrief.brief_status` carries when the one-liner is withheld. */
export const BRIEF_STATUS_WITHHELD = "withheld_number_drift" as const;

/**
 * True when this brief carries at least one drift warning.
 *
 * Takes `unknown` on purpose: the MCP tool re-reads arrows off the public HTTP
 * feed, where they are untyped bags, and a signature that forced a cast at that
 * call site would be a signature inviting the wrong cast.
 */
export function briefHasNumberDrift(brief: unknown): boolean {
  if (!brief || typeof brief !== "object") return false;
  const warnings = (brief as { warnings?: unknown }).warnings;
  if (!Array.isArray(warnings)) return false;
  return warnings.some(
    (w) => typeof w === "string" && w.trimStart().startsWith(DRIFT_WARNING_PREFIX),
  );
}

/**
 * The served form of a drifted brief. `one_line_context` nulled, status set,
 * EVERYTHING ELSE COPIED THROUGH — `verdict_note` (deterministic, hard-mapped
 * in code, never LLM-picked), `facts_at_fire` (measured) and `warnings` (the
 * evidence) are all still trustworthy and all still shipped.
 */
export function withheldBriefShape(brief: ArrowBrief): ArrowBrief {
  return { ...brief, one_line_context: null, brief_status: BRIEF_STATUS_WITHHELD };
}

/**
 * Serve-time projection of one arrow.
 *
 * Returns the SAME REFERENCE when the brief is clean — not a structural copy.
 * That is load-bearing twice over: `/api/hood/arrows` runs this over up to 200
 * records on a CDN-cached path, and "a clean brief is served completely
 * unchanged" is then true by identity rather than by deep-equality, which is a
 * much harder property to regress by accident.
 *
 * Never mutates. These records come straight out of the hydrated blob cache
 * (#148 ②), shared across requests in a warm lambda — an in-place edit would
 * strip the one-liner from the cache itself and leak into the grader's view of
 * the same object. A projection that corrupts its input is a deletion with
 * extra steps.
 */
export function withholdDriftedBrief<A extends { brief?: ArrowBrief | null }>(arrow: A): A {
  const brief = arrow.brief;
  if (!brief || !briefHasNumberDrift(brief)) return arrow;
  return { ...arrow, brief: withheldBriefShape(brief) };
}

/** List form. Clean arrows keep their identity; only drifted ones are copied. */
export function withholdDriftedBriefs<A extends { brief?: ArrowBrief | null }>(arrows: A[]): A[] {
  return arrows.map(withholdDriftedBrief);
}

/**
 * Loose-typed twin of `withholdDriftedBrief` for surfaces holding an arrow as
 * an untyped bag. `/api/mcp`'s `hub_hood_arrow` resolves its arrow by fetching
 * `/api/hood/arrows` over HTTP — deliberately, so it inherits that feed's
 * `isPublicArrow` trust boundary — and therefore has `Record<string, unknown>`
 * rather than `Arrow`. Same semantics, same identity-on-clean guarantee.
 */
export function withholdDriftedBriefRecord(
  arrow: Record<string, unknown>,
): Record<string, unknown> {
  const brief = arrow.brief;
  if (!briefHasNumberDrift(brief)) return arrow;
  return {
    ...arrow,
    brief: withheldBriefShape(brief as ArrowBrief),
  };
}

/**
 * What an agent may answer from. ONE definition, because the failure this
 * whole module exists to fix was an instruction pointing at flagged text.
 *
 * The withheld variant deliberately does NOT name the withheld field. Naming
 * it would tell a model there is a context line to go looking for, and a model
 * told "the context line was suppressed" is a model one step from reconstructing
 * one. It is handed the measured fields and nothing else.
 */
export const ANSWER_FROM_CLEAN =
  "Answer only from verdict_note, one_line_context and facts_at_fire.";

export const ANSWER_FROM_WITHHELD =
  "The model-written narrative line for this arrow was WITHHELD from this response: it cited a percentage that does not reconcile against the measured numbers, and `warnings` records the exact mismatch. Answer ONLY from verdict_note and facts_at_fire — those are measured, not narrated. If the user asks for colour beyond them, say it is not available rather than supplying it.";

export function answerFromClause(withheld: boolean): string {
  return withheld ? ANSWER_FROM_WITHHELD : ANSWER_FROM_CLEAN;
}

/**
 * The complete `instruction` string `hub_hood_arrow` ships with a resolved
 * arrow. Lives here rather than inline at the call site so the test exercises
 * the STRING THAT SHIPS — an assertion against a reconstructed copy of a
 * template proves only that the copy is fine.
 *
 * The chain label is first and non-negotiable (CLAUDE.md hard rule 1): Base is
 * 8453, Robinhood Chain is 4663, they share no state, and NVDA/META/GOOGL exist
 * on both as DIFFERENT tokens — so a number without its chain is unreadable.
 */
export function hoodArrowInstruction(chain: string, briefWithheld: boolean): string {
  const label = chain === "base" ? "Base 8453" : "Robinhood Chain 4663";
  return `This arrow is on ${label} — STATE THAT CHAIN in your answer. ${answerFromClause(briefWithheld)} A graded arrow is history: describe it in the past tense with its age. NEVER invent a number or a reason.`;
}
