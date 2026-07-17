/**
 * Blue Hood — flush the entire arrow subsystem.
 *
 * Purpose: reset the public track record to zero before prod launch. Reads
 * every id in `bh:arrow:feed`, deletes each `bh:arrow:{id}`, then clears
 * the feed list, the serial counter, and every open-dedup index. After
 * this call the very first arrow to fire will be `#0001`.
 *
 * Auth: CRON_SECRET Bearer. Extra safety: requires `?confirm=1` so a
 * fat-fingered curl can't wipe prod by accident.
 */
import { NextRequest, NextResponse } from "next/server";
import { kvDel, kvGet, kvScan, kvSet } from "@/lib/kv";
import {
  KV_ARROW_FEED,
  KV_ARROW_SERIAL_COUNTER,
  kvArrow,
} from "@/lib/blue-hood/kv-keys";
import type { Arrow } from "@/lib/blue-hood/types";

export const runtime = "nodejs";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

function authed(req: NextRequest): boolean {
  if (!CRON_SECRET) return process.env.NODE_ENV !== "production";
  const authHeader = req.headers.get("authorization") ?? "";
  const q = new URL(req.url).searchParams.get("secret") ?? "";
  return authHeader === `Bearer ${CRON_SECRET}` || q === CRON_SECRET;
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  if (url.searchParams.get("confirm") !== "1") {
    return NextResponse.json({
      error: "Missing ?confirm=1 — purge is destructive.",
      hint: "POST /api/cron/blue-hood/purge?confirm=1 with the CRON_SECRET",
    }, { status: 400 });
  }

  const ids = (await kvGet<string[]>(KV_ARROW_FEED)) ?? [];
  let deleted = 0;
  let open_indexes_cleared = 0;

  // Delete every arrow record + collect open-index keys we need to clear.
  const openIdxKeys = new Set<string>();
  for (const id of ids) {
    const a = await kvGet<Arrow>(kvArrow(id));
    await kvDel(kvArrow(id));
    deleted++;
    if (a) openIdxKeys.add(`bh:arrow:open:${a.ticker.toLowerCase()}:${a.type}`);
  }

  // Also sweep any orphan `bh:arrow:open:*` keys the loop above missed (e.g.
  // an old arrow evicted from the feed list). kvScan is a no-op in the
  // in-memory dev backend but works on Upstash.
  try {
    const scanned = await kvScan("bh:arrow:open:*", 500);
    for (const k of scanned) openIdxKeys.add(k);
  } catch { /* scan unsupported → we still cleared the derivable ones above */ }

  for (const k of openIdxKeys) { await kvDel(k); open_indexes_cleared++; }

  await kvSet(KV_ARROW_FEED, []);
  await kvSet(KV_ARROW_SERIAL_COUNTER, 0);

  return NextResponse.json({
    ok: true,
    arrows_deleted: deleted,
    open_indexes_cleared,
    feed_reset: true,
    serial_reset_to: 0,
    note: "The next real arrow will fire as #0001.",
  });
}
