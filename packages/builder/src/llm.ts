/**
 * Builder-side LLM helper — a thin wrapper over the ONE client in
 * `@blueagent/core`, plus a lenient JSON extractor.
 *
 * ⚠️ This file replaces `src/bankr.ts`, which POSTed to
 * `https://llm.bankr.bot/v1/messages` with a `BANKR_API_KEY`. Bankr 403-banned
 * this project at the ACCOUNT level (2026-07-20, re-measured 2026-09-06 and
 * 2026-09-18 — a different key does not help), so every command that imported
 * it — `blue history|watch|search|launch|trending|market` — was dead in the
 * published `@blueagent/builder`, not merely deprecated.
 *
 * The call itself lives in `@blueagent/core` (`callVirtuals`) rather than being
 * re-implemented here. A second copy is how a package drifts back onto a
 * different provider without anyone noticing; there is now exactly one place
 * that knows the gateway URL, the auth header and the model id.
 */

import { callVirtuals } from "@blueagent/core";

/**
 * One-shot LLM call for builder utility commands (discovery/analytics).
 * These don't need the skill-grounding system that the core workflow commands
 * (`idea|build|audit|ship|raise`) use, so they call the gateway directly.
 *
 * Throws on a missing key or a non-2xx — it never falls back to another
 * provider, because a caller that cannot tell which model answered cannot
 * trust the answer.
 */
export async function callLLM(
  system: string,
  user: string,
  opts: { maxTokens?: number; temperature?: number } = {}
): Promise<string> {
  return callVirtuals({
    system,
    messages: [{ role: "user", content: user }],
    temperature: opts.temperature ?? 0.4,
    maxTokens: opts.maxTokens ?? 1500,
  });
}

/**
 * Pull a JSON value out of an LLM reply.
 * LLMs wrap JSON in ``` fences and add preamble, so never `JSON.parse` the raw
 * text — slice from the first brace to the last instead.
 */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end   = text.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
  const aStart = text.indexOf("[");
  const aEnd   = text.lastIndexOf("]");
  if (aStart >= 0 && aEnd > aStart) return JSON.parse(text.slice(aStart, aEnd + 1));
  throw new Error("No JSON found in LLM response");
}
