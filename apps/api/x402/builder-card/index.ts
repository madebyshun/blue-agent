// apps/api/x402/builder-card/index.ts
// GET /api/builder-card?handle=xxx
// Returns builder score card JSON

import { scoreBuilder } from "@blueagent/reputation";

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  let handle = url.searchParams.get("handle");

  // Also accept POST body: { handle: "..." }
  if (!handle && req.method === "POST") {
    try {
      const text = await req.text();
      if (text?.trim().startsWith("{")) {
        const body = JSON.parse(text) as { handle?: string };
        handle = body.handle ?? null;
      }
    } catch {}
  }

  if (!handle) {
    return Response.json({ error: "Provide handle as query param or POST body" }, { status: 400 });
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
