/**
 * Blue Hood — the ONE read behind the published cohort result.
 *
 * WHY THIS FILE EXISTS (two reasons, both measured):
 *
 * ① DEPTH DRIFT. `/api/hood/cohorts` read the feed 600 deep; `/track` read it
 *    200 deep. Both are served from the SAME hydrated blob, which caps at
 *    `ARROW_HYDRATED_MAX` (250) — so the API was analysing up to 250 arrows
 *    while the page analysed 200. Two different `n`, two different p-values,
 *    from one snapshot, with nothing on either surface admitting the other
 *    existed. The cohort route's own header warns that `window_basis` is
 *    stamped "so this number can never be silently compared against /track's";
 *    that warning does not help when /track publishes a number of its own.
 *    Now there is one depth constant and one reader, so they cannot disagree.
 *
 * ② A KV OUTAGE READ AS "NO EDGE". The route called `readPublicArrows`, which
 *    is documented to return `[]` when KV is unreachable (#150 group B). Feed
 *    `[]` to `analyzeCohorts` and you get `graded: 0` → `overall.ready: false`
 *    → `verdict: "insufficient_data"` — the exact string the endpoint emits
 *    when the record is genuinely too thin. A database blip and "we have not
 *    measured an edge" were the same response, and the endpoint was cached
 *    `s-maxage=300, stale-while-revalidate=600`, so one throttled read
 *    published "no evidence" for up to FIFTEEN MINUTES after KV recovered.
 *
 *    This is the #149/#150 silent-collapse family landing on the one endpoint
 *    that carries the project's headline statistical claim. `readCohortAnalysis`
 *    returns `unavailable` instead, and callers are expected to say so rather
 *    than render a zero.
 *
 * ③ "ALL TIME" WAS NOT ALL TIME. MEASURED 2026-09-17: the arrow index held 532
 *    arrows and this analysis saw 250 of them, because every read is served
 *    from the hydrated blob and `rebuildArrowFeed` slices the index to
 *    `ARROW_HYDRATED_MAX`. Yet `analyzeCohorts` stamps `window_basis:
 *    "all_time"` whenever no `windowMs` is passed — locally true (the function
 *    applied no time filter) and false as published (its input was pre-cut).
 *
 *    The window also SLIDES: three reads of /api/hood/cohorts on that one day
 *    returned `graded` 240, 238, then 234, because new arrows enter the blob
 *    and old graded ones fall off the back. A reader who checks twice sees the
 *    "all time" record shrink, which is the sort of thing that destroys trust
 *    in every other number on the page.
 *
 *    Not fixed by reading deeper — that would re-introduce the ~600-command
 *    fan-out ② exists to avoid, and the cap is a deliberate cost decision.
 *    Fixed by MEASURING the window and making callers state it: `analyzed` and
 *    `feed_capped` ship next to the analysis, and no surface may describe a
 *    capped read as the full record.
 *
 * Everything here is a READ. The analysis itself is pure and lives in
 * `cohort-stats.ts`; this module only decides which arrows go into it and what
 * to do when they cannot be fetched.
 */
import { readPublicArrowsProbe } from "@/lib/blue-hood/public-feed";
import { ARROW_HYDRATED_MAX } from "@/lib/blue-hood/kv-keys";
import { analyzeCohorts, type CohortAnalysis } from "@/lib/blue-hood/cohort-stats";
import { HIT_RATE_WINDOW_MS } from "@/lib/blue-hood/hit-rate-gate";

/**
 * How deep to read the feed for a cohort analysis.
 *
 * Larger than the hydrated blob on purpose: the blob caps the real answer, and
 * this number only has to be "at least all of it". Kept as one exported
 * constant so a surface cannot quietly analyse a different slice than the API.
 */
export const COHORT_FEED_DEPTH = 600;

export type CohortRead =
  | {
      status: "ok";
      analysis: CohortAnalysis;
      /** When the underlying feed blob was built — lets a surface date the claim. */
      built_at: string;
      /**
       * How many arrows actually entered the analysis. NOT the size of the
       * record — see `feed_capped`.
       */
      analyzed: number;
      /**
       * True when the feed blob was at its cap, i.e. OLDER ARROWS EXIST AND
       * WERE NOT ANALYSED. See ③ below; a surface must not call a capped read
       * "all time".
       */
      feed_capped: boolean;
    }
  | { status: "unavailable"; reason: string };

/**
 * Read the arrow feed and run the pre-registered cohort family over it.
 *
 * `rolling7d` narrows to the same window the public headline uses. Default is
 * the FULL record, because a 7-day window holds ~70 graded arrows and every
 * cohort inside it lands below the n≥15 gate — i.e. no percentages at all.
 */
export async function readCohortAnalysis(
  { rolling7d = false }: { rolling7d?: boolean } = {},
): Promise<CohortRead> {
  const read = await readPublicArrowsProbe(COHORT_FEED_DEPTH);
  if (read.status !== "ok") return read;

  return {
    status: "ok",
    built_at: read.built_at,
    analyzed: read.arrows.length,
    // `>=` not `===`: the cap is the only thing that can produce a full blob,
    // and treating "exactly at the cap" as uncapped is the failure that matters.
    feed_capped: read.feed_size >= ARROW_HYDRATED_MAX,
    analysis: analyzeCohorts(read.arrows, {
      ...(rolling7d ? { windowMs: HIT_RATE_WINDOW_MS } : {}),
    }),
  };
}
