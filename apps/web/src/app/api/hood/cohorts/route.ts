/**
 * Public read of the Blue Hood cohort analysis — "does the signal work better
 * under some condition?", answered with the multiple-comparison correction
 * attached rather than omitted.
 *
 * WHY THIS ENDPOINT IS SHAPED LIKE THIS: the naive version of this feature
 * ("scan every condition, publish the best one") fires on 38.5% of pure-noise
 * records in our own control test. So the payload leads with `verdict` and
 * `validated`, and every cohort carries `survives_correction` inline — a
 * consumer cannot read a percentage here without also reading whether it
 * survived being judged as best-of-N.
 *
 * WINDOW: no time filter by default, NOT the rolling 7d the public headline
 * uses. 7d currently holds ~72 graded arrows, so cohorts inside it are n≈10–20
 * — below the gate, i.e. no percentages at all. `window_basis` is stamped on
 * the response so this number can never be silently compared against /track's.
 * `?window=7d` is accepted for callers that explicitly want the headline basis.
 *
 * ⚠ `window_basis: "all_time"` IS NOT THE FULL RECORD, and the response says so
 * in `analyzed` / `feed_capped` / `window_note`. The read is served from the
 * hydrated blob, which caps at 250 while the arrow index held 532 (measured
 * 2026-09-17) — and because the cap slides, `graded` came back 240, 238, 234,
 * then 237 across four reads that day. The basis field describes the analysis
 * function, not the history; the three fields beside it describe the history.
 * See cohort-read.ts ③.
 *
 * ⚠⚠ THE SLIDE REACHES THE CORRECTION, which is the part that actually bites.
 * `tests_run` was 25 on the first of those reads and 24 on the last: a cohort
 * fell under `min_sample` and left the hypothesis family. BH's ceiling is
 * `FDR × rank / family_size` (cohort-stats.ts `benjaminiHochberg`), so shrinking
 * the family moves the bar for EVERY cohort — a borderline `survives_correction`
 * can flip between two reads with nothing about the signal having changed. This
 * endpoint's entire promise is that a percentage never travels without its
 * correction; that promise is only kept if the correction's own instability is
 * disclosed too. Hence `window_note` names it, and two snapshots are comparable
 * only when `analyzed` AND `tests_run` match.
 *
 * COST: this reads the arrow feed from KV. Since #148 ② that is ONE command
 * (the hydrated blob), not the ~600-key fan-out the depth constant implies, and
 * the response is additionally cached for 5 minutes — the all-time record moves
 * by a couple of arrows per hour, which no cohort verdict is sensitive to.
 *
 * ⚠ THE CACHE IS CONDITIONAL, AND THAT IS THE POINT. This endpoint used to call
 * `readPublicArrows`, which returns `[]` on an unreachable KV (#150 group B).
 * `analyzeCohorts([])` yields `verdict: "insufficient_data"` — the same string
 * a genuinely thin record produces — and `s-maxage=300, stale-while-revalidate=600`
 * then pinned that answer in front of every caller for up to 15 minutes. A
 * database blip published "we have not measured an edge". It now reads through
 * `readCohortAnalysis`, answers `ok: false` when the feed is unreadable, and
 * sends `no-store` on that path so an outage cannot outlive itself in a CDN.
 */
import { NextRequest, NextResponse } from "next/server";
import { readCohortAnalysis } from "@/lib/blue-hood/cohort-read";
import { COHORT_FDR, COHORT_MIN_SAMPLE } from "@/lib/blue-hood/cohort-stats";

export const runtime = "nodejs";
export const revalidate = 300;

export async function GET(req: NextRequest) {
  const wantRolling = new URL(req.url).searchParams.get("window") === "7d";

  const read = await readCohortAnalysis({ rolling7d: wantRolling });

  if (read.status !== "ok") {
    return NextResponse.json(
      {
        ok: false,
        error: "arrow_feed_unavailable",
        reason: read.reason,
        // Said explicitly because the honest answer and the alarming one look
        // identical from outside: there is no `verdict` in this body ON PURPOSE.
        note:
          "The arrow feed could not be read, so no cohort analysis was run. This is NOT " +
          "`insufficient_data` and NOT `no_validated_edge` — it is the absence of an answer. " +
          "Retry; do not record this as a measurement.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      feed_built_at: read.built_at,
      ...read.analysis,
      // `window_basis` is produced by `analyzeCohorts` and describes only what
      // THAT function did (it applied no time filter). Its input was already
      // cut to the hydrated blob, so "all_time" overclaims on its own. These
      // two fields ship beside it so no consumer can read the basis without
      // also reading how much of the record it actually covered — same reason
      // `survives_correction` is inline on every cohort. See cohort-read.ts ③.
      analyzed: read.analyzed,
      feed_capped: read.feed_capped,
      window_note: read.feed_capped
        ? `Analysed the newest ${read.analyzed} public arrows. The record is LONGER than this — ` +
          "the feed blob is capped, so older arrows exist and were not included. This window " +
          "slides as new arrows fire, so `graded` can fall between two reads even though the " +
          "record only ever grows. Do not read `window_basis: \"all_time\"` as the full history. " +
          "`tests_run` slides with it: a cohort that drops under `min_sample` leaves the " +
          "hypothesis family entirely, and the Benjamini-Hochberg ceiling is FDR×rank/family_size " +
          "— so `survives_correction` can change between two reads WITHOUT the underlying signal " +
          "changing at all. Compare two snapshots only when `analyzed` and `tests_run` match."
        : `Analysed the newest ${read.analyzed} public arrows, which is the whole record — the ` +
          "feed blob was not at its cap.",
      method: {
        null_hypothesis: "hit rate = 50% (a signal with no edge closes half the time)",
        test: "exact two-sided binomial",
        interval: "Wilson score, 95%",
        correction: `Benjamini-Hochberg, FDR ${COHORT_FDR}`,
        min_sample: COHORT_MIN_SAMPLE,
        // Said plainly because the whole point of the endpoint is the caveat.
        note:
          "Cohorts are pre-declared in code, not mined per request — you cannot correct for tests you don't admit to running. `validated` is the only list any surface may call an edge; `exploratory` cohorts reach p<0.05 alone but not as best-of-N, and are published for steering, not for quoting. Cohorts that select an identical arrow set are collapsed to one hypothesis before correction and listed in `confounds`.",
      },
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    },
  );
}
