/**
 * ACP wrapper: Blue Hood arrows feed (public track record).
 *
 * Public GET. Reads the same filtered arrow feed the drift-board UI
 * reads, wrapped in the ACP envelope. Reuses `/api/hood/arrows`
 * server-side to avoid duplicating the origin/test filter (single
 * source of truth for what's public).
 */
import { NextRequest } from "next/server";
import { kvGet } from "@/lib/kv";
import { KV_ARROW_FEED, kvArrow } from "@/lib/blue-hood/kv-keys";
import type { Arrow } from "@/lib/blue-hood/types";
import { acpEnvelope, clientIp, corsHeaders, preflight, rateLimit } from "@/lib/acp";

export const runtime = "nodejs";

const HIT_RATE_MIN_SAMPLE = 10;
const HIT_RATE_WINDOW_MS = 7 * 24 * 3_600 * 1000;

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
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));

  const ids = ((await kvGet<string[]>(KV_ARROW_FEED)) ?? []).slice(0, limit * 3);
  const all = (await Promise.all(ids.map((id) => kvGet<Arrow>(kvArrow(id))))).filter(
    (a): a is Arrow => a !== null,
  );

  // ACP is public — same filter as /api/hood/arrows (origin=engine + non-test).
  const arrows = all.filter((a) => !a.test && (!a.origin || a.origin === "engine")).slice(0, limit);

  const cutoff = Date.now() - HIT_RATE_WINDOW_MS;
  const graded7d = arrows.filter((a) => a.status === "graded" && a.graded_at && new Date(a.graded_at).getTime() >= cutoff);
  const hits = graded7d.filter((a) => a.outcome === "hit").length;
  const total = graded7d.length;
  const hit_rate = total >= HIT_RATE_MIN_SAMPLE
    ? { ready: true as const, pct: Math.round((hits / total) * 100), sample: total }
    : { ready: false as const, sample: total, needed: HIT_RATE_MIN_SAMPLE };

  return Response.json(
    acpEnvelope(
      {
        arrows,
        arrows_today: arrows.filter((a) => new Date(a.fired_at).getTime() >= Date.now() - 24 * 3_600 * 1000).length,
        hit_rate,
      },
      "https://blueagent.dev/hood/arrows",
    ),
    { status: 200, headers: corsHeaders() },
  );
}
