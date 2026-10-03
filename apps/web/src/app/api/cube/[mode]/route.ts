/**
 * GET /api/cube/<mode> — display feed for the BlueCube (ESP32-S3, 128×128).
 *
 * Public and read-only: no auth, no LLM, no KV writes. The only KV read is the
 * hood mode's Base desk blob, and `s-maxage=60` puts Vercel's CDN in front of
 * it, so a fleet of cubes polling every 30s costs at most one KV read and one
 * upstream round per mode per minute — not one per cube.
 *
 * Shape and data rules live in `lib/cube/modes.ts`.
 */
import { NextResponse } from "next/server";
import { buildFeed, isCubeMode, CUBE_MODES } from "@/lib/cube/modes";
import { liveCubeSources } from "@/lib/cube/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(_req: Request, { params }: { params: Promise<{ mode: string }> }) {
  const { mode } = await params;
  if (!isCubeMode(mode)) {
    return NextResponse.json(
      { error: `unknown mode "${mode}"`, modes: CUBE_MODES },
      { status: 404, headers: { "Cache-Control": "public, s-maxage=3600" } },
    );
  }
  const feed = await buildFeed(mode, liveCubeSources);
  return NextResponse.json(feed, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
