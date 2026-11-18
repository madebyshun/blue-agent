/**
 * GET /api/markets/sparks?tokens=0x…,0x… — 24h sparklines for up to 60 Base
 * stock tokens in one call (lib/markets-sparks.ts). A token with too little
 * history is absent; the page then falls back to its pool candles.
 */
import { NextResponse } from "next/server";
import { readSparks } from "@/lib/markets-sparks";

export const runtime = "nodejs";
export const maxDuration = 10;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("tokens") ?? "";
  const tokens = raw.split(",").map((t) => t.trim()).filter((t) => /^0x[0-9a-fA-F]{40}$/.test(t)).slice(0, 60);
  const r = await readSparks(tokens).catch(() => ({ sparks: {}, updatedAt: null }));
  return NextResponse.json(r, { headers: { "cache-control": "public, max-age=120" } });
}
