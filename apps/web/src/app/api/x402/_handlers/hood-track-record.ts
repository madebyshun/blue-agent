// x402/hood-track-record — Blue Hood's own scoreboard: every public arrow with
// its graded outcome, plus the hit-rate we are allowed to publish.
//
// Price: free, and for a sharper reason than the other free tools. `rh-rwa-verify`
// and `rh-token-scan` are free because charging for a safety check is charging
// people not to run it. This one is free because it is the EVIDENCE FOR OUR OWN
// CLAIMS. A track record behind a paywall is a track record nobody can check, and
// an unchecked track record is marketing. The paid tools are the product; this is
// the receipt that says the product works, so it cannot cost anything to read.
//
// ── Why a wrapper and not an implementation ────────────────────────────────
// `lib/blue-hood/track-record-public.ts` is, in its own header, "the ONE assembly
// of the public, gated track record" — /track, the /track OG card, the /share/arrow
// card and /api/acp/track-record all call `buildPublicTrackRecord()`. The whole
// file exists because four surfaces re-implementing the same sanitize WOULD drift.
// Adding a fifth re-implementation here would be the exact regression that file
// was created to prevent, so this handler owns no aggregation logic at all: it
// calls `getPublicTrackRecordProbe`, shapes the x402 envelope, and stops.
//
// ── The gate is inherited, never re-decided ────────────────────────────────
// Below `HIT_RATE_MIN_SAMPLE_AGGREGATE` the shared gate emits `{ready:false,
// graded, needed}` and NO percentage — not `pct`, not `pct_internal`. This handler
// never reads around that. Two consequences worth stating because both are easy to
// "fix" wrongly:
//
//   • The 95% CI below is emitted ONLY when `ready` is true. A Wilson interval for
//     n=2 is mathematically honest and still forbidden here: the gate's rule is
//     that a sample this thin buys no published percentage AT ALL, and a CI is an
//     attribute of a percentage, not a loophole around one.
//   • `pct` stays the gate's integer. It is rounded upstream and shared with every
//     other surface, so re-deriving a more precise one here would put two
//     different hit-rates on two pages of the same site. The CI carries the
//     precision instead, at full 4dp, which is where precision actually helps.
//
// ── An unreadable feed is 503, never an empty record (#264) ────────────────
// `getPublicTrackRecordProbe` is the ONLY KV entry point for this data precisely
// so that this mistake is unavailable. Its predecessor called `readPublicArrows`,
// which answers a dead KV with `[]`, and `[]` assembles into a complete,
// well-formed, confident track record asserting `arrows: []` and `total_graded: 0`
// — i.e. BLUE HOOD HAS NEVER FIRED A SIGNAL — served as a 200 to an agent that
// asked for proof. Do not add a fallback that "degrades gracefully" to an empty
// record. The degraded answer is the lie.
//
// ── The window travels WITH the receipts ───────────────────────────────────
// The hydrated blob is capped (`ARROW_HYDRATED_MAX`) and the index is longer, so
// the list returned here is the newest N of a longer record and the window SLIDES
// as new arrows fire. An agent recomputing a hit-rate from `receipts.arrows` is
// doing the right thing and would get a silently wrong denominator without this
// block. MEASURED 2026-09-17: four reads the same day returned graded counts of
// 240 / 238 / 234 / 237 for an unchanged record, purely from window slide — so
// two snapshots are comparable only when `window.shown` matches.
//
// NO LLM ANYWHERE IN THIS FILE, and no upstream HTTP either. One KV read, every
// number counted from stored arrows. There is nothing for a model to add to a
// scoreboard except the opportunity to get it wrong.
import { wilsonInterval } from "@/lib/blue-hood/cohort-stats";
import {
  getPublicTrackRecordProbe,
  TRACK_RECORD_MAX_LIMIT,
} from "@/lib/blue-hood/track-record-public";
import { HIT_RATE_WINDOW_MS } from "@/lib/blue-hood/hit-rate-gate";

/** 4dp, as `ticker-confidence.ts` already publishes Wilson bounds. Not a display
 *  rounding — it is the precision the caller needs to compare two reads. */
const dp4 = (n: number) => Number(n.toFixed(4));

export default async function handler(req: Request): Promise<Response> {
  try {
    // The free path in `[tool]/route.ts` rebuilds the inner request WITHOUT the
    // query string, so the body is the real channel; the URL is read too so a
    // direct call (internal bypass, local curl) behaves the same way.
    let body: { limit?: number | string } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const rawLimit = body.limit ?? url.searchParams.get("limit") ?? "";
    const parsed = parseInt(String(rawLimit), 10);
    const limit = Number.isFinite(parsed) && parsed > 0
      ? Math.min(TRACK_RECORD_MAX_LIMIT, parsed)
      : 100;

    const read = await getPublicTrackRecordProbe(limit);

    if (read.status !== "ok") {
      // 503, not a 200 with an empty record. See the #264 note above.
      return Response.json(
        {
          error: "arrow_feed_unavailable",
          detail: read.reason,
          // Said explicitly because the failure mode this replaces was a
          // confident zero. A caller must be able to tell "we have no record"
          // from "we could not read the record".
          note: "The arrow feed could not be read. This is NOT a claim that zero arrows exist — the record is unknown right now, not empty.",
        },
        { status: 503 },
      );
    }

    const { hit_rate } = read.record.headline;
    const { hits } = read.record.receipts.graded_breakdown;

    return Response.json({
      tool: "hood-track-record",
      // Receipts first, headline second — the order is the argument. The evidence
      // is free and complete; the calculated number is the part that has to earn
      // its sample.
      receipts: read.record.receipts,
      headline: {
        ...read.record.headline,
        hit_rate: {
          ...hit_rate,
          ...(hit_rate.ready
            ? {
                confidence_interval: {
                  basis: "wilson_95",
                  z: 1.96,
                  ...(() => {
                    const { lo, hi } = wilsonInterval(hits, hit_rate.graded);
                    return { low: dp4(lo), high: dp4(hi) };
                  })(),
                  note: "Wilson score interval on hits/graded, 0–1. Small-sample-safe: it stays inside [0,1] where the normal approximation does not.",
                },
              }
            : {}),
        },
      },
      window: {
        shown: read.shown,
        truncated: read.truncated,
        // Two causes, reported separately because the remedies differ:
        // `limit_capped` means raise `limit`; `feed_capped` is the hydrated
        // blob's own ceiling and no `limit` can reach past it.
        feed_capped: read.feed_capped,
        limit_capped: read.limit_capped,
        feed_built_at: read.built_at,
        grading_window_ms: HIT_RATE_WINDOW_MS,
        note: read.truncated
          ? `These are the newest ${read.shown} public arrows, not the whole record — older arrows exist and were not returned. The window also SLIDES as new arrows fire, so counts can fall between two reads even though the record only ever grows. Compare two snapshots only when \`shown\` matches.`
          : `All ${read.shown} public arrows in the feed were returned.`,
      },
      meta: {
        ...read.record.meta,
        // VOID is never filtered out of `receipts.arrows`. Stated on the wire so
        // a consumer does not "helpfully" drop it and inflate the denominator.
        receipts_include_void: true,
        gate: "Percentages are withheld until the sample clears the published threshold. Below it you get `{ready:false, graded, needed}` and no percentage at all — by design, not because data is missing.",
      },
      data_sources: ["Blue Hood arrow feed (Vercel KV) — graded outcomes, no external call"],
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return Response.json(
      { error: `hood-track-record failed: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}
