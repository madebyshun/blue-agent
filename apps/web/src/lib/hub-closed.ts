/**
 * Community listings on Blue Hub are CLOSED (ShunTr, 2026-10-22).
 *
 * Measured the day it closed: 34 External tools, none verified, several on
 * expiring dev tunnels (trycloudflare, pinggy, lhr.life, sslip), and 8 calls
 * between them in their whole lifetime. Hosted tools: 0. Hiding /hub from the
 * nav (2026-09-30) had not closed anything — POST /api/hub/tools still went
 * `live` on the first signature, and blue_registry listed those tools to agents
 * AHEAD of the first-party catalog.
 *
 * What closes, all in one place so it cannot half-close:
 *   - POST /api/hub/tools           (External submit)
 *   - POST /api/hub/hosted          (Hosted submit)
 *   - POST /api/hub/hosted/test     (runs a creator prompt on OUR inference budget)
 *   - POST /api/hub/tools/<id>/call (proxy that forwarded a caller's X-Payment
 *                                    to the builder: a payment path must not
 *                                    outlive the product it sells)
 *   - the Hub grid, the "List your tool" view, blue_registry's community rows
 *
 * What stays, deliberately:
 *   - KV data (`hub:tools:*`, `hub:hosted:*`): builder state is evidence, not
 *     clutter — deleting it is ShunTr's call.
 *   - GET + DELETE /api/hub/tools/<id>: a builder can still read and remove
 *     their own listing.
 *   - /docs/list-a-tool and /hub/submit resolve (published URLs) and say closed.
 *
 * No `next/server` import: HubView (a client component) reads the flag too.
 *
 * Reopening is a later phase (x402 marketplace after Blue Agent MCP has users).
 * Flip this flag and every door above opens again.
 */
export const COMMUNITY_LISTINGS_OPEN = false;

export const COMMUNITY_CLOSED_TEXT =
  "Blue Hub is not accepting tool listings right now. Existing listings are kept and their builders can still remove them.";

/** 410 for every closed community door; `null` when listings are open. */
export function communityClosedResponse(): Response | null {
  if (COMMUNITY_LISTINGS_OPEN) return null;
  return Response.json(
    { error: "COMMUNITY_LISTINGS_CLOSED", message: COMMUNITY_CLOSED_TEXT },
    { status: 410, headers: { "Access-Control-Allow-Origin": "*" } },
  );
}
