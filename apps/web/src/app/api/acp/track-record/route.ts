/**
 * ACP: Blue Hood track record (0.2) — receipts free, headline gated.
 *
 * The 0.1 /api/acp/arrows already returns the arrow feed. This 0.2 endpoint
 * draws the line the spec asks for, in ONE machine-readable contract:
 *
 *   • receipts — every graded arrow with its outcome (HIT / MISS / VOID) and
 *     the raw graded_breakdown counts. Returned FREELY and always. This is the
 *     product: the evidence. Anyone may recompute a hit-rate from it — that's
 *     their right. VOID stays visible (honest evidence, never filtered out).
 *
 *   • headline — the CALCULATED numbers that bear our name: hit_rate %, per-type
 *     %, and the record curve. These pass through hit-rate-gate.ts. Below the
 *     sample threshold they return {ready:false, graded:N, needed:M} and NO
 *     percentage. We don't publish a headline our sample hasn't earned.
 *
 *   • meta — version + machine-readable grading rules (+ their doc URL) so an
 *     agent can understand exactly how each outcome was decided.
 *
 * The receipts/headline/meta assembly (and the sanitize that strips the
 * internal pct + gates the curve) lives in `track-record-public.ts` so this
 * endpoint and the public /track page + OG cards are byte-identical — the same
 * anti-drift discipline hit-rate-gate.ts enforces on the aggregation itself.
 *
 * ⚠ AN UNREADABLE FEED IS A 503, NOT AN EMPTY RECEIPT BOOK (#264). This used to
 * call `getPublicTrackRecord`, which answered a dead KV with `arrows: []` and
 * `total_graded: 0` — a 200 telling an agent, in the machine-readable contract
 * it is meant to trust, that Blue Hood has never fired a signal. Same shape and
 * same fix as `/api/hood/cohorts` (see cohort-read.ts ②): the failure path is
 * `no-store`, because the one thing worse than publishing an outage as a fact is
 * having a CDN keep publishing it after the outage ends.
 */
import { NextRequest } from "next/server";
import { acpEnvelope, clientIp, corsHeaders, preflight, rateLimit } from "@/lib/acp";
import {
  getPublicTrackRecordProbe,
  TRACK_RECORD_MAX_LIMIT,
} from "@/lib/blue-hood/track-record-public";

export const runtime = "nodejs";

export async function OPTIONS() {
  return preflight();
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(clientIp(req));
  if (!rl.ok) {
    return Response.json(
      { error: "rate_limited", retry_after_s: rl.retry_after_s },
      { status: 429, headers: { ...corsHeaders(), "Retry-After": String(rl.retry_after_s) } },
    );
  }

  const url = new URL(req.url);
  const limit = Math.min(
    TRACK_RECORD_MAX_LIMIT,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? "100", 10) || 100),
  );

  const read = await getPublicTrackRecordProbe(limit);

  if (read.status !== "ok") {
    return Response.json(
      { error: "arrow_feed_unavailable", detail: read.reason },
      {
        status: 503,
        headers: { ...corsHeaders(), "Cache-Control": "no-store" },
      },
    );
  }

  return Response.json(
    acpEnvelope(
      {
        ...read.record,
        // The window travels WITH the receipts, never in a separate doc. An
        // agent that recomputes a hit-rate from `arrows` is doing the right
        // thing; it needs to know the list it was handed is the newest N of a
        // longer record, or its denominator is silently wrong.
        window: {
          shown: read.shown,
          truncated: read.truncated,
          feed_capped: read.feed_capped,
          limit_capped: read.limit_capped,
          feed_built_at: read.built_at,
          ...(read.truncated
            ? {
                note:
                  `These are the newest ${read.shown} public arrows, not the whole record — ` +
                  `older arrows exist and were not returned. The window also SLIDES as new ` +
                  `arrows fire, so counts can fall between two reads even though the record ` +
                  `only ever grows. Compare two snapshots only when \`shown\` matches.`,
              }
            : {}),
        },
      },
      "https://blueagent.dev/docs/blue-hood#grading",
    ),
    { status: 200, headers: corsHeaders() },
  );
}
