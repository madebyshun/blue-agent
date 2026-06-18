/**
 * GET /api/feed/items — public read of the Blue Feed.
 * Returns the newest feed items stored by the hourly /api/cron/feed job.
 */
import { NextResponse } from "next/server";
import { kvGet } from "@/lib/kv";
import type { FeedItem } from "@/app/api/cron/feed/route";

export const runtime = "nodejs";

export async function GET() {
  const items = (await kvGet<FeedItem[]>("feed:items")) ?? [];
  const updatedAt = items[0]?.timestamp ?? 0;
  return NextResponse.json(
    { items, updatedAt },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
