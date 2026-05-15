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
    // Run score + online check with a 55s overall timeout
    const [result, status] = await Promise.all([
      Promise.race([
        scoreAgent(handle),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("scoreAgent timeout after 55s")), 55000)
        ),
      ]),
      checkOnline(handle),
    ]);

    return Response.json({
      handle:      result.handle,
      score:       result.xp,
      tier:        result.tier,
      strengths:   result.strengths,
      gaps:        result.gaps,
      badge:       result.badge,
      status,
      cardUrl:     `https://blueagent.dev/card/agent/${result.handle}`,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
