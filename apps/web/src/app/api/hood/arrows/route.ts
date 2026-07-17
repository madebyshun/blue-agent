/**
 * Public read of the Blue Hood arrow feed + hit-rate.
 *
 * Returns the last N arrows (newest first) plus computed 7d hit rate. UI
 * uses this to render the Arrows feed section. Read-only, public, cache-
 * busted — same shape as /api/hood/snapshot.
 */
import { NextRequest, NextResponse } from "next/server";
import { kvGet } from "@/lib/kv";
import { KV_ARROW_FEED, kvArrow } from "@/lib/blue-hood/kv-keys";
import type { Arrow } from "@/lib/blue-hood/types";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 200;
const HIT_RATE_MIN_SAMPLE = 10; // spec: "warming up · n/10 arrows graded"
const HIT_RATE_WINDOW_MS = 7 * 24 * 3_600 * 1000;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
  );

  const ids = ((await kvGet<string[]>(KV_ARROW_FEED)) ?? []).slice(0, limit);
  const arrows = (await Promise.all(ids.map((id) => kvGet<Arrow>(kvArrow(id))))).filter(
    (a): a is Arrow => a !== null,
  );

  // Hit rate — count of graded arrows in the last 7d, split hit/miss.
  const cutoff = Date.now() - HIT_RATE_WINDOW_MS;
  const graded7d = arrows.filter(
    (a) => a.status === "graded" && a.graded_at && new Date(a.graded_at).getTime() >= cutoff,
  );
  const hits = graded7d.filter((a) => a.outcome === "hit").length;
  const total = graded7d.length;

  const hit_rate = total >= HIT_RATE_MIN_SAMPLE
    ? { ready: true as const, pct: Math.round((hits / total) * 100), sample: total }
    : { ready: false as const, sample: total, needed: HIT_RATE_MIN_SAMPLE };

  const arrows_today = arrows.filter(
    (a) => new Date(a.fired_at).getTime() >= Date.now() - 24 * 3_600 * 1000,
  ).length;

  return NextResponse.json(
    { ok: true, arrows, arrows_today, hit_rate },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
