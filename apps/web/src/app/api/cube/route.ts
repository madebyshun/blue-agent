/**
 * GET /api/cube — the mode list a BlueCube rotates through.
 *
 * The cube reads this at boot instead of hardcoding modes, so adding or
 * retiring a mode is a server deploy, not a firmware reflash.
 */
import { NextResponse } from "next/server";
import { CUBE_MODES } from "@/lib/cube/modes";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(
    { modes: CUBE_MODES, rotateSec: 10, refreshSec: 30 },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
