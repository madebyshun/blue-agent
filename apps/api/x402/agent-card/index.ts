// apps/api/x402/agent-card/index.ts
// GET /api/agent-card?handle=xxx
// Returns agent score card JSON

import { scoreAgent } from "@blueagent/reputation";

async function checkOnline(handle: string): Promise<"online" | "offline"> {
  try {
    const url = handle.startsWith("http") ? handle : null;
    if (!url) return "offline";
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return res.status < 500 ? "online" : "offline";
  } catch {
    return "offline";
  }
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const handle = url.searchParams.get("handle");

  if (!handle) {
    return Response.json({ error: "handle query param required" }, { status: 400 });
  }

  try {
    const result = await scoreAgent(handle);
    const status = await checkOnline(handle);

    return Response.json({
      handle: result.handle,
      xp: result.xp,
      tier: result.tier,
      dimensions: result.dimensions,
      strengths: result.strengths,
      gaps: result.gaps,
      badge: result.badge,
      status,
      cardUrl: `https://blueagent.dev/card/agent/${result.handle}`,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
