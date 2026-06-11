// x402/community-sentiment/index.ts
// Community Sentiment — MiroShark 4-persona + Aeon narrative + Blue score.
// IMPORTANT: there is no live social-media feed wired in, so this is an AI ESTIMATE
// of likely sentiment generated from model knowledge — NOT measured from real posts.
// The output is labelled accordingly (data_source + disclaimer). Resilient: never 500.
// Price: $0.25

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
const DISCLAIMER = "AI estimate of likely community sentiment generated from model knowledge — NOT measured from live social posts. Treat scores as directional, not data.";
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
      `Follow skill template. Be concrete.\n\nSkill:\n${p}${focus ? `\nFocus: ${focus}` : ""}\n\nReturn only skill output.`, 0.2, 1000);
  } catch { return null; }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { project?: string; description?: string } = {};
    try { const t = await req.text(); if (t.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const project = body.project ?? url.searchParams.get("project") ?? "";
    const description = body.description ?? url.searchParams.get("description") ?? "";
    if (!project) return Response.json({ error: "project is required" }, { status: 400 });

    const narrativeRaw = await aeon("narrative-tracker", `community sentiment around ${project}: ${description}`);

    const msRaw = await llm(`You are MiroShark — 4-persona consensus engine.
Personas: Analyst(1.8x), Influencer(2.8x), Retail(1.0x), Observer(0.5x).
Simulate community sentiment for this project.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "personas": {
    "analyst":    {"stance":"bull|bear|neutral","weight":1.8,"rationale":"<1 sentence>"},
    "influencer": {"stance":"bull|bear|neutral","weight":2.8,"rationale":"<1 sentence>"},
    "retail":     {"stance":"bull|bear|neutral","weight":1.0,"rationale":"<1 sentence>"},
    "observer":   {"stance":"bull|bear|neutral","weight":0.5,"rationale":"<1 sentence>"}
  },
  "bull":<0-100>,"bear":<0-100>,"neutral":<0-100>,
  "community_temperature":"hot|warm|neutral|cool|cold",
  "fomo_level":"high|medium|low",
  "fud_level":"high|medium|low",
  "sentiment_summary":"<1 sentence>"
}`,
      `Project: ${project}\nDescription: ${description}\nNarratives: ${narrativeRaw ?? "Base ecosystem"}`, 0.5, 800);
    const consensus = parseJson(msRaw) ?? { bull: 40, bear: 30, neutral: 30, community_temperature: "neutral" };

    const resultRaw = await llm(`You are Blue Agent — community sentiment analyzer.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "sentiment_score": <0-100>,
  "overall": "very_bullish|bullish|neutral|bearish|very_bearish",
  "consensus": {"bull":<0-100>,"bear":<0-100>,"neutral":<0-100>},
  "key_drivers": ["<driver>"],
  "risk_signals": ["<signal>"],
  "community_health": "strong|growing|stable|declining|fragmented",
  "recommended_actions": ["<action>"],
  "summary": "<2 sentences>"
}`,
      `Project: ${project}\nNarratives: ${narrativeRaw ?? "Base"}\nConsensus: ${JSON.stringify(consensus)}`, 0.3, 700);

    let result = parseJson(resultRaw);
    if (!result) {
      result = {
        sentiment_score: null,
        overall: "neutral",
        consensus,
        key_drivers: [],
        risk_signals: [],
        community_health: "stable",
        recommended_actions: ["Re-run for a fuller estimate"],
        summary: "Sentiment estimate briefly unavailable this run — re-run.",
        degraded: true,
      };
    }

    return Response.json({
      tool: "community-sentiment",
      timestamp: new Date().toISOString(),
      data_source: "AI estimate (no live social data — model-generated, not measured)",
      disclaimer: DISCLAIMER,
      project,
      miroshark: consensus,
      ...result,
    });
  } catch (e) {
    // Never 500 — return a labelled, degraded estimate.
    return Response.json({
      tool: "community-sentiment",
      timestamp: new Date().toISOString(),
      data_source: "AI estimate (no live social data — model-generated, not measured)",
      disclaimer: DISCLAIMER,
      degraded: true,
      note: "Estimate unavailable this run — please retry.",
      message: (e as Error).message,
    });
  }
}
