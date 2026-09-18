/**
 * Blue Hood — the ONE assembly of the public, gated track record.
 *
 * WHY THIS FILE: the 0.2 `/api/acp/track-record` endpoint drew the line between
 * FREE receipts and GATED headline, inline. Now three more public surfaces need
 * the exact same shape:
 *   • /track            — the public track-record page (SEO, no wallet)
 *   • /track OG image    — headline card for social unfurls
 *   • /share/arrow OG    — per-arrow card (reuses the gate for the aggregate)
 *
 * If each re-implemented the sanitize (strip `pct_internal`, rename
 * `sample`→`graded`, gate the curve) they WOULD drift — the exact failure
 * `hit-rate-gate.ts` was created to end. So the sanitize lives here once, and
 * the ACP endpoint + every page call `buildPublicTrackRecord()`.
 *
 * The gate is preserved verbatim: below the sample threshold NO percentage is
 * emitted (not `pct`, never `pct_internal`) — only `{ready:false, graded, needed}`.
 */
import type { Arrow } from "@/lib/blue-hood/types";
import { readPublicArrowsProbe, arrowsFiredToday } from "@/lib/blue-hood/public-feed";
import { ARROW_HYDRATED_MAX } from "@/lib/blue-hood/kv-keys";
import {
  computeHitRate,
  computeRecordCurve,
  gradingRulesMeta,
  GRADING_RULES_URL,
  TRACK_RECORD_API_VERSION,
  type HitRateComputed,
  type HitRatePerTypeStats,
  type PerType,
  type RecordCurvePoint,
} from "@/lib/blue-hood/hit-rate-gate";

// ── Public shapes (pct_internal never present; `sample` renamed `graded`) ─────

/** Aggregate hit-rate. `pct` present only when the gate says ready. */
export type PublicAggregate =
  | { ready: true; pct: number; graded: number }
  | { ready: false; graded: number; needed: number };

/** Per-type bucket — pct only when that type cleared its own gate. */
export interface PublicPerTypeStats {
  ready: boolean;
  graded: number;
  hits: number;
  misses: number;
  voided: number;
  informational_count: number;
  pct?: number;
  needed: number;
}

/** Cumulative HIT−MISS walk — points only when the aggregate gate is ready. */
export type PublicRecordCurve =
  | {
      basis: "cumulative_hit_minus_miss";
      ready: true;
      graded: number;
      final: number;
      peak: number;
      trough: number;
      points: RecordCurvePoint[];
    }
  | {
      basis: "cumulative_hit_minus_miss";
      ready: false;
      graded: number;
      needed: number;
    };

/** The full 0.2 body — receipts (free) + headline (gated) + meta. */
export interface PublicTrackRecord {
  receipts: {
    /** Every public arrow, VOID + open included — the evidence, returned freely. */
    arrows: Arrow[];
    arrows_today: number;
    graded_breakdown: HitRateComputed["graded_breakdown"];
  };
  headline: {
    hit_rate: PublicAggregate;
    per_type: Record<string, PublicPerTypeStats>;
    record_curve: PublicRecordCurve;
  };
  meta: {
    api_version: string;
    grading_rules_url: string;
    grading: ReturnType<typeof gradingRulesMeta>;
  };
}

// ── Sanitizers ───────────────────────────────────────────────────────────────

/** Strip `pct_internal` + rename `sample`→`graded` for every per-type bucket. */
export function sanitizePerType(perType: PerType): Record<string, PublicPerTypeStats> {
  const out: Record<string, PublicPerTypeStats> = {};
  for (const [type, s] of Object.entries(perType)) {
    const v = s as HitRatePerTypeStats;
    out[type] = {
      ready: v.ready,
      graded: v.sample,
      hits: v.hits,
      misses: v.misses,
      voided: v.voided,
      informational_count: v.informational_count,
      needed: v.needed,
      ...(v.ready && v.pct !== undefined ? { pct: v.pct } : {}),
    };
  }
  return out;
}

// ── Build ────────────────────────────────────────────────────────────────────

/**
 * Assemble the public track record from an already-filtered public arrow list.
 * Pure — takes `arrows` (engine-origin, non-test) + an optional clock. Every
 * consumer that has the arrows in hand (or wants a deterministic test) calls
 * this; only `getPublicTrackRecordProbe` below touches KV.
 *
 * ⚠ It cannot tell `[]`-because-empty from `[]`-because-KV-died, and it never
 * will — it has no KV read to inspect. That discrimination belongs to the
 * reader, which is exactly why the reader is probe-shaped. Do not call this
 * with the result of a bare `readPublicArrows`.
 */
export function buildPublicTrackRecord(
  arrows: Arrow[],
  now: number = Date.now(),
): PublicTrackRecord {
  const { hit_rate, per_type, graded_breakdown } = computeHitRate(arrows, now);
  const record_curve = computeRecordCurve(arrows, now);

  // Rename sample→graded on the aggregate (the public contract calls the
  // hit+miss count `graded`, not `sample`).
  const publicHitRate: PublicAggregate = hit_rate.ready
    ? { ready: true, pct: hit_rate.pct, graded: hit_rate.sample }
    : { ready: false, graded: hit_rate.sample, needed: hit_rate.needed };

  const publicCurve: PublicRecordCurve = record_curve.ready
    ? {
        basis: record_curve.basis,
        ready: true,
        graded: record_curve.sample,
        final: record_curve.final,
        peak: record_curve.peak,
        trough: record_curve.trough,
        points: record_curve.points,
      }
    : {
        basis: record_curve.basis,
        ready: false,
        graded: record_curve.sample,
        needed: record_curve.needed,
      };

  return {
    receipts: {
      arrows,
      arrows_today: arrowsFiredToday(arrows, now),
      graded_breakdown,
    },
    headline: {
      hit_rate: publicHitRate,
      per_type: sanitizePerType(per_type),
      record_curve: publicCurve,
    },
    meta: {
      api_version: TRACK_RECORD_API_VERSION,
      grading_rules_url: GRADING_RULES_URL,
      grading: gradingRulesMeta(),
    },
  };
}

/** Hard ceiling on `limit`, shared by the page and the ACP endpoint. */
export const TRACK_RECORD_MAX_LIMIT = 200;

export type PublicTrackRecordRead =
  | {
      status: "ok";
      record: PublicTrackRecord;
      /** When the underlying feed blob was built — lets a surface date the receipts. */
      built_at: string;
      /** How many arrows are actually in `record.receipts.arrows`. */
      shown: number;
      /**
       * True when public arrows OLDER than the last receipt exist and were not
       * returned. The single flag a surface must consult before calling this
       * table "every arrow" / "forever" / "the full record".
       *
       * Two independent causes, both reported below, because the remedies
       * differ: `limit_capped` is the caller's own ceiling (raise `limit`),
       * `feed_capped` is the hydrated blob's (a deliberate cost decision — see
       * arrow-cache.ts; reading past it restores the ~600-command fan-out).
       */
      truncated: boolean;
      /** The blob was at `ARROW_HYDRATED_MAX` — older arrows exist in the index. */
      feed_capped: boolean;
      /** `limit` cut the list below what the blob already held. */
      limit_capped: boolean;
    }
  | { status: "unavailable"; reason: string };

/**
 * KV-backed read: the newest public arrows (the trust-boundary filter lives in
 * `readPublicArrowsProbe`) assembled into the gated track record, or an explicit
 * `unavailable`. `limit` is clamped 1..200.
 *
 * ⚠ WHY THIS IS THE ONLY KV ENTRY POINT (#264). It replaces
 * `getPublicTrackRecord`, which called `readPublicArrows` — documented in its own
 * header as the #150 group-B gap: it returns `[]` when KV is unreachable. Fed
 * through `buildPublicTrackRecord`, `[]` becomes a complete, confident,
 * well-formed track record asserting `arrows: []`, `total_graded: 0`,
 * `hit_rate: {ready:false, graded:0}` — i.e. WE HAVE NEVER FIRED AN ARROW —
 * on the one page whose entire purpose is to prove that we have.
 *
 * It was visible as a self-contradiction on a single screen: `/track` also reads
 * `readCohortAnalysis`, which was already probe-shaped, so during an outage the
 * evidence panel said "couldn't read the arrow feed" while the receipts table
 * directly beneath it rendered an empty record as fact. The two halves disagreed
 * and the lying half was the half the page exists for.
 *
 * The lying shape is not kept as a wrapper on purpose: an `unavailable` a caller
 * can opt out of is one import away from being opted out of.
 */
export async function getPublicTrackRecordProbe(
  limit = 100,
): Promise<PublicTrackRecordRead> {
  const capped = Math.min(TRACK_RECORD_MAX_LIMIT, Math.max(1, limit || 100));
  const read = await readPublicArrowsProbe(capped);
  if (read.status !== "ok") return read;

  // `>=` not `===` on BOTH, and both round toward "we might be missing arrows".
  //
  // The cap is the only thing that can produce a full blob, so treating "exactly
  // at the cap" as uncapped is the failure that matters — identical reasoning to
  // cohort-read.ts, kept byte-for-byte so the two readers can never disagree
  // about whether one snapshot was truncated.
  //
  // `limit_capped` is deliberately imprecise in the safe direction: the slice
  // happens after the trust filter, so a list that comes back exactly `capped`
  // long is indistinguishable from one that was cut. Claiming truncation when
  // the record happens to end on the boundary costs one honest caveat; the
  // other rounding would publish "every arrow" over a table that is missing some.
  const feed_capped = read.feed_size >= ARROW_HYDRATED_MAX;
  const limit_capped = read.arrows.length >= capped;

  return {
    status: "ok",
    record: buildPublicTrackRecord(read.arrows),
    built_at: read.built_at,
    shown: read.arrows.length,
    truncated: feed_capped || limit_capped,
    feed_capped,
    limit_capped,
  };
}
