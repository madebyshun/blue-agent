// x402/agent-performance/index.ts
// Agent Performance Report — Blue agent-score + Aeon github-monitor + MiroShark observer
// Price: $0.35
// Fully self-contained

type Msg = { role: string; content: string };
async function llm(system: string, user: string, temp = 0.4, tokens = 1000): Promise<string> {
  const r = await fetch("https://llm.bankr.bot/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.LLM_API_KEY ?? process.env.BANKR_API_KEY ?? "", "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-4-5", system, messages: [{ role: "user", content: user }] as Msg[], temperature: temp, max_tokens: tokens }),
  });
  if (!r.ok) throw new Error(`LLM ${r.status}: ${await r.text()}`);
  const d = await r.json() as { content?: { text: string }[] };
  return d.content?.[0]?.text ?? "";
}
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
    let body: { handle?: string; repo?: string } = {};
    try { const t = await req.text(); if (t.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const handle = body.handle ?? url.searchParams.get("handle") ?? "";
    const repo = body.repo ?? url.searchParams.get("repo") ?? "";
    if (!handle) return Response.json({ error: "handle is required" }, { status: 400 });

    const [agentScoreRaw, repoHealthRaw] = await Promise.all([
      llm(`You are Blue Agent Agent Score system. Score an AI agent.
Dimensions(total 100): skillDepth(0-25), onchainActivity(0-25), reliability(0-20), interoperability(0-20), reputation(0-10).
Tiers: 0-24=Bot, 25-49=Specialist, 50-74=Operator, 75-100=Sovereign.
CRITICAL: Return ONLY raw JSON.
Schema: {"xp":<0-100>,"tier":"Bot|Specialist|Operator|Sovereign","status":"online|offline|unknown","dimensions":{"skillDepth":<0-25>,"onchainActivity":<0-25>,"reliability":<0-20>,"interoperability":<0-20>,"reputation":<0-10>},"strengths":["<strength>"],"gaps":["<gap>"]}`,
        `Score agent: ${handle}`, 0.3, 600),
      repo ? aeon("github-monitor", `${repo} — activity health, commit velocity, open issues, docs quality`) : Promise.resolve(null),
    ]);

    const agentScore = parseJson(agentScoreRaw) ?? { xp: 30, tier: "Specialist" };

    const msRaw = await llm(`You are MiroShark observer persona — neutral, records what's there.
Observe this agent's public presence and performance signals.
CRITICAL: Return ONLY raw JSON.
Schema: {"activity_level":"high|medium|low","community_presence":"strong|moderate|weak","trust_signals":["<signal>"],"concern_signals":["<concern>"],"observer_note":"<1 sentence>"}`,
      `Agent: ${handle}\nScore: ${JSON.stringify(agentScore)}\nRepo: ${repoHealthRaw ?? "no repo data"}`, 0.3, 400);
    const observerTake = parseJson(msRaw) ?? {};

    const resultRaw = await llm(`You are Blue Agent — agent performance report engine.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "performance_score": <0-100>,
  "tier": "<copy from agent score>",
  "trend": "improving|stable|declining|unknown",
  "dimensions": <copy from agent score>,
  "top_strengths": ["<strength>"],
  "improvement_areas": ["<area>"],
  "recommended_next_skills": ["<skill to add>"],
  "ecosystem_standing": "leading|active|emerging|dormant",
  "report_summary": "<2-3 sentences>"
}`,
      `Agent: ${handle}\nScore: ${JSON.stringify(agentScore)}\nRepo health: ${repoHealthRaw ?? "no data"}\nObserver: ${JSON.stringify(observerTake)}`, 0.3, 900);

    let result = parseJson(resultRaw);
    if (!result) result = { degraded: true, note: "Synthesis briefly unavailable - please retry." };

    return Response.json({ tool: "agent-performance", timestamp: new Date().toISOString(), handle, repo: repo || null, agent_score: agentScore, observer: observerTake, ...result });
  } catch (e) {
    return Response.json({ error: "Agent performance report failed", message: (e as Error).message }, { status: 500 });
  }
}
