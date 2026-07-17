/**
 * Blue Hood — arrow brief fetcher.
 *
 * Wraps A4 (`rh-stock-agent-brief`) so the rule engine can attach a
 * 1-2 sentence "why" to every newly-fired arrow. Contract with the caller:
 *
 *   • Call happens EXACTLY ONCE per arrow, at fire time. The result is
 *     persisted on the arrow record. UI reads a static field, never re-hits
 *     the LLM.
 *   • A4 failure = arrow still fires with `brief: null`. The arrow's
 *     numbers stand on their own; the brief is purely narrative context.
 *   • A4's own `warnings` (feed_abnormally_stale, thin_dex_pool,
 *     llm_context_unavailable, …) are carried through verbatim.
 */
import { callTool } from "./tool-caller";
import type { ArrowBrief } from "./types";

// Subset of A4's response we care about — kept here so a change in the
// tool trips a compile error before we start silently persisting stale
// fields.
interface A4Response {
  verdict: string;
  verdict_note?: string;
  one_line_context?: string | null;
  warnings?: string[];
  llm?: { provider?: string | null };
}

/**
 * Fetch the brief for a ticker. Never throws; returns null on any failure
 * so the caller can persist `arrow.brief = null` and move on.
 */
export async function fetchArrowBrief(ticker: string): Promise<ArrowBrief | null> {
  // A4 runs the Virtuals → Venice → Bankr LLM chain internally. Give it
  // a generous timeout — Virtuals is usually 2-5s, Bankr fallback ~10s.
  const r = await callTool<A4Response>("rh-stock-agent-brief", { ticker }, { timeoutMs: 25_000 });
  if (!r.ok) {
    console.warn(`[brief] A4 call failed for ${ticker}: ${r.status} ${r.error}`);
    return null;
  }
  const d = r.data;
  if (!d || !d.verdict_note) {
    // If the LLM chain failed but the tool still 200'd, we may not have a
    // verdict_note — treat that as "no brief" rather than an empty shell.
    return null;
  }
  return {
    verdict_note: d.verdict_note,
    one_line_context: (typeof d.one_line_context === "string" ? d.one_line_context : null),
    warnings: Array.isArray(d.warnings) ? d.warnings : [],
    llm_provider: d.llm?.provider ?? null,
    fetched_at: new Date().toISOString(),
  };
}
