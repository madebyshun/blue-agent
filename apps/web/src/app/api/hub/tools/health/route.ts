/**
 * /api/hub/tools/health — is each registered External endpoint still answering?
 *
 * GET → `{ health: { [id]: ToolHealth | null }, coverage, checkedCount }`
 *
 * SEPARATE FROM `/api/hub/tools` ON PURPOSE. That route is the catalog and must
 * stay instant: it reads KV and returns. This one can fan out to every builder's
 * endpoint, so a cold cache costs up to one 8s probe. Folding it into the
 * catalog would put a third party's dead tunnel on the Hub's critical render
 * path — the Hub would hang because someone else closed their laptop.
 *
 * The Hub therefore renders first and asks this second, so a slow or failing
 * answer degrades to "unknown" badges on a page that already works.
 *
 * ⚠ This endpoint NEVER writes `status`, never de-indexes, and never deletes.
 * It reports. Tunnel expiry is expected and a submission is the builder's; any
 * delisting is ShunTr's call. See the header of `lib/hub-liveness.ts`.
 */
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getIdentifier } from "@/lib/rate-limit";
import { readRegisteredTools } from "@/lib/hub-registry";
import { healthForTools, HEALTH_TTL_S } from "@/lib/hub-liveness";

export const runtime = "nodejs";
// A cold call probes every registered endpoint in parallel, each bounded by the
// 8s timeout inside `probeEndpoint`. 30s leaves headroom for the KV round-trips
// either side without ever approaching the default function ceiling.
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  // Rate-limited because this is the one public GET that makes OUTBOUND requests
  // on demand. Without it, anyone could use the Hub to fan traffic at six
  // third-party endpoints for free. The KV cache blunts it but goes cold.
  const { success } = await rateLimit(getIdentifier(req), "api");
  if (!success) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const read = await readRegisteredTools();

  // `coverage` is carried through for the #149 reason: a throttled KV read
  // returns an empty tool list, and "we could not read the registry" must not
  // render as "every tool is healthy". A caller that ignores coverage here shows
  // an all-green Hub built from zero tools.
  const health = await healthForTools(
    read.tools.map((t) => ({ id: t.id, endpoint: t.endpoint })),
  );

  return NextResponse.json(
    {
      health,
      // How many ids we actually have an answer for. Deliberately not
      // `Object.keys(health).length` — every id is present, some with `null`,
      // and a count that includes the nulls would overstate what we know.
      checkedCount: Object.values(health).filter((h) => h !== null).length,
      coverage: read.coverage,
      unreadableIds: read.unreadableIds,
      ttlSeconds: HEALTH_TTL_S,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
