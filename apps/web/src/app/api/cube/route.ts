/**
 * GET /api/cube — what a BlueCube needs at boot: the modes it rotates through,
 * and the catalog its owner can pick from (coins for `crypto`, Base B20
 * stocks for `hood`).
 *
 * The cube reads this instead of hardcoding either list, so adding a mode or a
 * pickable coin is a server deploy, not a firmware reflash.
 */
import { NextResponse } from "next/server";
import { CUBE_MODES, cubeOptions } from "@/lib/cube/modes";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(
    { modes: CUBE_MODES, rotateSec: 10, refreshSec: 30, options: cubeOptions() },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
