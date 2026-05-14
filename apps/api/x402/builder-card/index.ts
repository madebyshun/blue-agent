// apps/api/x402/builder-card/index.ts
// GET /api/builder-card?handle=xxx
// Returns builder score card JSON

import { scoreBuilder } from "@blueagent/reputation";

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const handle = url.searchParams.get("handle");

  if (!handle) {
    return Response.json({ error: "handle query param required" }, { status: 400 });
  }

  try {
    const result = await scoreBuilder(handle.replace(/^@/, ""));
    return Response.json({
      handle: result.handle,
      score: result.score,
      tier: result.tier,
      dimensions: result.dimensions,
      summary: result.summary,
      badge: result.badge,
      cardUrl: `https://blueagent.dev/card/builder/${result.handle}`,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
