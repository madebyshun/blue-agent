// GET/POST /api/builder-score — FREE, first-party-only builder score for the UI
// (dashboard, profile, /score, /builder/[handle], badge SVG). It calls the x402
// builder-score handler DIRECTLY (no payment) and returns its JSON unchanged
// (shape: { score, tier, github, onchain, community, blue_assessment, … }).
//
// This route is deliberately NOT registered in AGENT_TOOLS / the Hub catalog, so
// it isn't advertised as a paid tool. Cross-site browser requests are bounced;
// same-origin UI fetches and server-to-server calls (no Sec-Fetch-Site) pass.
//
// This block used to claim the bounce protected an "x402 paywall" and that
// external integrations "intentionally use the PAID /api/x402/builder-score".
// Both were false. MEASURED 2026-09-18: `builder-score` is absent from AGENT_TOOLS
// and HANDLERS, so /api/x402/builder-score answers 501 TOOL_UNAVAILABLE — it has
// never had a price and there is no paywall here to bypass. The bounce is a
// first-party-only guard, nothing more.
//
// Both external callers now point here, which is where the working compute is:
// chat's hub_builder_score (FREE_DIRECT, since 2026-09-03) and the @blueagent/skill
// MCP's blue_score (since 0.4.1 — it had been throwing 501 on every call).
// If this should become paid, register `builder-score` in AGENT_TOOLS + HANDLERS
// with a price and repoint those two callers.

import { NextRequest, NextResponse } from "next/server";
import handler from "@/app/api/x402/_handlers/builder-score";

export const runtime = "nodejs";
export const maxDuration = 60;

async function run(req: NextRequest): Promise<Response> {
  // Cross-site browser calls → not first-party. This used to answer 402 with
  // `paidUrl: …/api/x402/builder-score`, sending the caller to an endpoint that
  // 501s; a 402 also claims a price that does not exist. Say what is true: the
  // route is first-party only, and there is no paid alternative to point at.
  if (req.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json(
      {
        error: "First-party only — builder-score is not published as a paid x402 tool.",
        code: "FIRST_PARTY_ONLY",
        catalogUrl: "https://blueagent.dev/api/catalog",
      },
      { status: 403 },
    );
  }
  try {
    // The handler reads handle/repo/address from the query string or JSON body,
    // and never throws (it self-degrades), so we can delegate directly.
    return await handler(req);
  } catch (e) {
    return NextResponse.json({
      tool: "builder-score", degraded: true, score: null, tier: "unknown",
      message: (e as Error).message,
    });
  }
}

export const GET = run;
export const POST = run;
