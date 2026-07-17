/**
 * Public read of the latest Blue Hood snapshot.
 *
 * `/hood` calls this on mount + on a client-side timer so it doesn't need
 * to hit KV directly from React. Read-only, public, cache-busting headers
 * — no secret required.
 */
import { NextResponse } from "next/server";
import { kvGet } from "@/lib/kv";
import { KV_SNAPSHOT_LATEST } from "@/lib/blue-hood/kv-keys";
import type { HoodSnapshot } from "@/lib/blue-hood/types";

export const runtime = "nodejs";

export async function GET() {
  const snap = await kvGet<HoodSnapshot>(KV_SNAPSHOT_LATEST);
  if (!snap) {
    return NextResponse.json(
      { ok: false, error: "No snapshot yet. Poller hasn't run." },
      {
        status: 503,
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  }
  return NextResponse.json(
    { ok: true, snapshot: snap },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
