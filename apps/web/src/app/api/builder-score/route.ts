// GET/POST /api/builder-score — FREE, first-party-only builder score for the UI
// (dashboard, profile, /score, /builder/[handle], badge SVG). It calls the x402
// builder-score handler DIRECTLY (no payment) and returns its JSON unchanged
// (shape: { score, tier, github, onchain, community, blue_assessment, … }).
//
// This route is deliberately NOT registered in AGENT_TOOLS / the Hub catalog, so
// it isn't advertised as a paid tool. To stop outsiders from using it to bypass
// the x402 paywall, browser cross-site requests are bounced to the paid endpoint;
// same-origin UI fetches and server-to-server calls (no Sec-Fetch-Site) pass.
//
// External integrations (the @blueagent/skill MCP, the CLI) intentionally use the
// PAID /api/x402/builder-score instead.

import { NextRequest, NextResponse } from "next/server";
import handler from "@/app/api/x402/_handlers/builder-score";

export const runtime = "nodejs";
export const maxDuration = 60;

async function run(req: NextRequest): Promise<Response> {
  // Cross-site browser calls → not first-party. Point them at the paid endpoint
  // so the free route stays an internal-UI convenience, not an x402 bypass.
  if (req.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json(
      { error: "Use the paid endpoint", code: "USE_X402", paidUrl: "https://blueagent.dev/api/x402/builder-score" },
      { status: 402 },
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
