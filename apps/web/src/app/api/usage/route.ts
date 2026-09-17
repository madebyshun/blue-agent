/**
 * /api/usage — real paid-run counts per tool, for dynamic ranking and the
 * run-count chips on the Hub + Skills catalogs.
 *
 * Counters are `usage:<id>` integers in KV, incremented by every surface that
 * actually executes something:
 *   - /api/x402/[tool]        → paid hub-tool runs
 *   - /api/mcp                → hub tools called over MCP (internal bypass)
 *   - /api/hub/tools/[id]/call→ community-registered hosted tools
 *   - /api/console            → the 5 blue_* commands (idea/build/audit/ship/raise)
 *
 * The id space is closed on purpose: we only ever read keys derived from our
 * own catalogs, never an id supplied by the caller. That keeps this public
 * endpoint from being usable as an arbitrary KV probe.
 *
 * These are FORWARD-ONLY counters — each one starts accruing when its surface
 * was first instrumented, not at project launch. So a 0 means "nothing recorded
 * on this counter", NOT "nobody has ever used it". Consumers must render a
 * count only when it is > 0 rather than printing a zero that reads as a
 * popularity verdict.
 *
 * #150 read side: an id whose counter could not be READ is now OMITTED from the
 * response rather than emitted as `0`. The two are different facts and the old
 * `?? 0` made a KV outage indistinguishable from "never run" — the same
 * empty-as-fact failure that made the #148 cap outages invisible. Omitting is
 * shape-compatible: both live consumers (the Hub grid and the skills catalog)
 * already render a chip only when the count is > 0, so a missing key and a zero
 * look identical on screen — but nothing downstream can now SUM a fabricated
 * zero and present the result as measured.
 */
import { NextResponse } from "next/server";
import { kvGetCounter } from "@/lib/kv";
import { AGENT_TOOLS } from "@/lib/agent-tools";
import { CONSOLE_SYSTEMS } from "@/lib/console-systems";

export const runtime = "nodejs";
// Vercel kills serverless functions at 60s by default — explicit budget so
// it fails loudly instead of silently 504-ing.
export const maxDuration = 10;

// The 5 console commands are counted as `usage:blue_<cmd>` (see /api/console),
// sharing the hub-tool key shape so one fetch covers every measurable surface.
const CONSOLE_IDS = Object.keys(CONSOLE_SYSTEMS).map((c) => `blue_${c}`);

export async function GET() {
  const ids = [...AGENT_TOOLS.map((t) => t.id), ...CONSOLE_IDS];
  const entries = await Promise.all(
    ids.map(async (id) => [id, await kvGetCounter(`usage:${id}`)] as const),
  );

  // `null` = the read failed. Drop it; do not coerce it to a number.
  const known = entries.filter((e): e is readonly [string, number] => e[1] !== null);
  const unreadable = entries.length - known.length;
  if (unreadable > 0) {
    console.error(`[usage] ${unreadable}/${entries.length} counters unreadable — omitted rather than reported as 0`);
  }

  return NextResponse.json(Object.fromEntries(known), {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      // Lets a caller tell "this tool has no runs" from "we could not read it"
      // without changing the flat id→count body shape.
      "X-Counters-Unreadable": String(unreadable),
    },
  });
}
