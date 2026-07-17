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

  // Read a larger slice than the response `limit` so we can filter out
  // synthetic `test: true` arrows and still return `limit` real ones.
  const readSlice = Math.min(MAX_LIMIT * 2, limit * 3);
  const ids = ((await kvGet<string[]>(KV_ARROW_FEED)) ?? []).slice(0, readSlice);
  const all = (await Promise.all(ids.map((id) => kvGet<Arrow>(kvArrow(id))))).filter(
    (a): a is Arrow => a !== null,
  );

  // BLOCKER 1 — the public track record must never contain seeded arrows.
  // Any arrow minted by the dev seed endpoint carries `test: true` and is
  // filtered out here. `?include_test=1` is honored ONLY in dev to help QA.
  const includeTest = url.searchParams.get("include_test") === "1"
    && process.env.NODE_ENV !== "production";
  const arrows = includeTest ? all : all.filter((a) => !a.test);

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
    {
      ok: true,
      arrows: arrows.slice(0, limit),
      arrows_today,
      hit_rate,
      test_arrows_hidden: includeTest ? 0 : all.length - arrows.length,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
