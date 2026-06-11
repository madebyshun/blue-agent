// x402/thread-intelligence/index.ts
// Thread Intelligence — Aeon narrative-tracker + MiroShark influencer + Blue idea.
// This is a GENERATIVE content tool (hooks, thread outlines, posting strategy). It is
// NOT wired to a live CT/Twitter feed, so the scores (content_score, viral_potential,
// engagement_prediction) are AI ESTIMATES from model knowledge, not measured metrics.
// Output is labelled accordingly. Resilient: never 500.
// Price: $0.35

type Msg = { role: string; content: string };
async function llm(system: string, user: string, temp = 0.4, tokens = 1000): Promise<string> {
  const r = await fetch("https://llm.bankr.bot/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.LLM_API_KEY ?? process.env.BANKR_API_KEY ?? "", "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-4-5", system, messages: [{ role: "user", content: user }] as Msg[], temperature: temp, max_tokens: tokens }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`LLM ${r.status}`);
  const d = await r.json() as { content?: { text: string }[] };
  return d.content?.[0]?.text ?? "";
}
const DISCLAIMER = "Content strategy is AI-generated; the scores (content_score, viral_potential, engagement_prediction) are model ESTIMATES, not measured from live social data.";
function parseJson(t: string): Record<string, unknown> | null {
  let s = t.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const i = s.indexOf("{"), j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  try { return JSON.parse(s); } catch { try { return JSON.parse(s.replace(/[\x00-\x1F]/g, " ")); } catch { return null; } }
}
async function aeon(skill: string, focus = ""): Promise<string | null> {
  try {
    const r = await fetch(`https://raw.githubusercontent.com/aaronjmars/aeon/main/skills/${skill}/SKILL.md`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const p = await r.text();
    return await llm(`You are Aeon. Synthesize from training knowledge. Today: ${new Date().toISOString().split("T")[0]}.`,
      `Follow skill template. Be concrete.\n\nSkill:\n${p}${focus ? `\nFocus: ${focus}` : ""}\n\nReturn only skill output.`, 0.2, 1200);
  } catch { return null; }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { topic?: string; audience?: string; goal?: string } = {};
    try { const t = await req.text(); if (t.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const topic = body.topic ?? url.searchParams.get("topic") ?? "";
    const audience = body.audience ?? url.searchParams.get("audience") ?? "Base builders and crypto traders";
    const goal = body.goal ?? url.searchParams.get("goal") ?? "engagement";

    const narrativeRaw = await aeon("narrative-tracker", `what's resonating on CT right now: ${topic || "Base ecosystem, AI agents, DeFi"}. What angles get engagement? What's being discussed?`);

    const msRaw = await llm(`You are MiroShark — influencer persona (2.8x weight).
You know what goes viral on CT. Evaluate thread potential.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "viral_potential": <0-10>,
  "best_angle": "<the hook that will work>",
  "posting_time": "<when to post: e.g. 9am EST, market open>",
  "format": "thread|single|poll|reply",
  "influencer_take": "<1-2 sentences on what makes this land>"
}`,
      `Topic: ${topic || "Base ecosystem"}\nAudience: ${audience}\nGoal: ${goal}\nNarratives: ${narrativeRaw ?? "CT discourse"}`, 0.5, 500);
    const influencer = parseJson(msRaw) ?? {};

    const resultRaw = await llm(`You are Blue Agent — content intelligence engine for Base builders.
Generate actionable thread strategy.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "content_score": <0-100>,
  "recommended_angle": "<the winning take>",
  "thread_outline": ["<tweet 1>", "<tweet 2>", "<tweet 3>", "<CTA>"],
  "hook_options": ["<hook 1>", "<hook 2>", "<hook 3>"],
  "best_posting_window": "<time and day>",
  "hashtags": ["<tag>"],
  "avoid": ["<what not to say>"],
  "engagement_prediction": "viral|high|medium|low",
  "summary": "<1-2 sentences>"
}`,
      `Topic: ${topic || "Base"}\nAudience: ${audience}\nGoal: ${goal}\nNarratives: ${narrativeRaw ?? "CT"}\nInfluencer: ${JSON.stringify(influencer)}`, 0.4, 1000);

    let result = parseJson(resultRaw);
    if (!result) {
      result = {
        content_score: null,
        recommended_angle: "Re-run for a full content strategy",
        thread_outline: [],
        hook_options: [],
        best_posting_window: "weekday morning EST",
        hashtags: [],
        avoid: [],
        engagement_prediction: "medium",
        summary: "Content synthesis briefly unavailable this run — re-run.",
        degraded: true,
      };
    }

    return Response.json({
      tool: "thread-intelligence",
      timestamp: new Date().toISOString(),
      data_source: "AI estimate (no live social data — model-generated, not measured)",
      disclaimer: DISCLAIMER,
      topic,
      audience,
      goal,
      influencer,
      ...result,
    });
  } catch (e) {
    // Never 500 — return a labelled, degraded estimate.
    return Response.json({
      tool: "thread-intelligence",
      timestamp: new Date().toISOString(),
      data_source: "AI estimate (no live social data — model-generated, not measured)",
      disclaimer: DISCLAIMER,
      degraded: true,
      note: "Estimate unavailable this run — please retry.",
      message: (e as Error).message,
    });
  }
}
