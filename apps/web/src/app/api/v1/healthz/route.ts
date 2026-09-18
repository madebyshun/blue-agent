/**
 * /api/v1/healthz — liveness probe read by monitors and other agents.
 *
 * Two fields here were lying, and a health check is the worst place for it:
 * it is the endpoint whose entire job is to be trusted about the system's own
 * state, so a wrong answer here poisons every decision made downstream of it.
 *
 *  • `tools: 41` was a hardcoded literal, frozen at whatever the count was
 *    when this file was written. The real catalog is TOOL_COUNT — derived now,
 *    so it cannot go stale again. (This sentence used to name the number "112"
 *    in prose and had itself drifted one past the catalog by 2026-09-18, which
 *    is the joke the whole file is about: a literal goes stale even inside the
 *    comment explaining why literals go stale. Count it; don't quote it.)
 *
 *  • `upstreamLlm` was `!!process.env.BANKR_API_KEY` — the wrong key for this
 *    question. Bankr's LLM endpoint was 403-banned 2026-07-20, so inference
 *    moved to Virtuals and no LLM call reads that variable any more, while
 *    inference was in fact healthy on Virtuals the whole time. That is a
 *    false NEGATIVE in a health check: it invites someone to go debug, rotate
 *    keys, or redeploy in response to an outage that isn't happening, which is
 *    exactly the failure mode CLAUDE.md's "READ THE CODE before blaming infra"
 *    rule exists to prevent. Now keyed to VIRTUALS_API_KEY, the credential the
 *    gateway actually reads (`_lib/llm.ts:219`).
 *
 *    ⚠️ BANKR_API_KEY now has ZERO live consumers that send it anywhere, and
 *    the "reads still work" carve-out below is DEAD. Timeline of measurements:
 *
 *      2026-09-06 — POST /token-launches/deploy → 403 "Account suspended".
 *                   Concluded: the ban is on the ACCOUNT, not on one hostname,
 *                   but GET /token-launches still answered 200, so reads lived.
 *      2026-09-18 — GET https://llm.bankr.bot/v1/usage?days={7,30,90} → 403
 *                   {"error":{"message":"This account has been banned",
 *                    "type":"auth_error"}} on all three. The read surface is
 *                   gone too. `lib/bankr-usage.ts` and the /stats panel it fed
 *                   were deleted the same day (see StatsView.tsx).
 *
 *    The one remaining reference, `/badge/[type]/[handle]`, never SENDS the key
 *    — it used it as a presence gate in front of compute that runs on Virtuals,
 *    so a dead credential was gating a live endpoint. That gate is removed too.
 *    BANKR_API_KEY is therefore a dead env var; unsetting it is now safe.
 *
 *    The lesson the 12-day gap teaches: "dead for writes ≠ dead for reads" was
 *    TRUE when measured and FALSE twelve days later. A carve-out earned by one
 *    measurement expires; re-measure the specific verb before relying on it.
 *
 * Note this stays a CONFIGURATION check, not a reachability check — it says a
 * key is present, not that Virtuals answered. Naming it `llmKeyConfigured`
 * rather than `upstreamLlm` keeps that boundary visible instead of implying a
 * live upstream ping we never make.
 */
import { NextResponse } from "next/server";
import { TOOL_COUNT }   from "@/lib/agent-tools";

export async function GET() {
  return NextResponse.json(
    {
      ok:        true,
      service:   "blueagent-api",
      version:   "v1",
      timestamp: new Date().toISOString(),
      tools:     TOOL_COUNT,
      llmKeyConfigured: !!process.env.VIRTUALS_API_KEY,
      llmProvider:      "virtuals",
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
  });
}
