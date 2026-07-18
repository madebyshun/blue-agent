/**
 * Blue Hood — sparkline refresh cron (T-B1).
 *
 * Refreshes the 24-hour hourly close series for every watched ticker.
 * Runs SEPARATELY from the main 72s poll cycle so the hot path stays
 * flat. Recommended cadence: 15 min. TTL on the KV cache is 20 min,
 * so a missed cycle degrades to "sparkline hidden" not "stale sparkline".
 *
 * Same rate-limit strategy as the poller: sequential + 3s stagger →
 * 24 × ~3.5s ≈ 84s wall time. Well under 15-min cadence.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET` or `?secret=…`. Dev without
 * a secret set falls open so `npm run dev` just works.
 */
import { NextRequest, NextResponse } from "next/server";
import { HOOD_WATCHLIST } from "@/lib/blue-hood/registry";
import { refreshSparkline } from "@/lib/blue-hood/sparkline";

export const runtime = "nodejs";
export const maxDuration = 180;

const CRON_SECRET = process.env.CRON_SECRET ?? "";

function isAuthorized(req: NextRequest): boolean {
  if (!CRON_SECRET) return process.env.NODE_ENV !== "production";
  const authHeader = req.headers.get("authorization") ?? "";
  const secretParam = new URL(req.url).searchParams.get("secret") ?? "";
  return authHeader === `Bearer ${CRON_SECRET}` || secretParam === CRON_SECRET;
}

const STAGGER_MS = Number(process.env.BH_SPARKLINE_STAGGER_MS ?? "3000");

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const results: Array<{ ticker: string; ok: boolean; candles?: number; error?: string }> = [];
  console.log(`[sparkline] refresh cycle start count=${HOOD_WATCHLIST.length} stagger_ms=${STAGGER_MS}`);
  for (let i = 0; i < HOOD_WATCHLIST.length; i++) {
    const t = HOOD_WATCHLIST[i];
    const r = await refreshSparkline(t.ticker);
    results.push({ ticker: t.ticker, ...r });
    console.log(`[sparkline] seq=${i + 1}/${HOOD_WATCHLIST.length} ticker=${t.ticker} ok=${r.ok} candles=${r.candles ?? 0}${r.error ? ` error="${r.error}"` : ""}`);
    if (STAGGER_MS > 0 && i < HOOD_WATCHLIST.length - 1) {
      await new Promise((res) => setTimeout(res, STAGGER_MS));
    }
  }
  const ok_count = results.filter((r) => r.ok).length;
  return NextResponse.json({
    ok: true,
    duration_ms: Date.now() - started,
    watched: HOOD_WATCHLIST.length,
    refreshed: ok_count,
    errored: results.length - ok_count,
    per_ticker: results,
  });
}

export const POST = handle;
export const GET = handle;
