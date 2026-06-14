// x402/roadmap-validator/index.ts
// Roadmap Validator — Blue build + Aeon narrative-tracker + MiroShark 4-persona
// Price: $0.50 — validate roadmap against current market + ecosystem
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
      `Follow skill template. Be concrete.\n\nSkill:\n${p}${focus ? `\nFocus: ${focus}` : ""}\n\nReturn only skill output.`, 0.2, 1200);
  } catch { return null; }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { project?: string; roadmap?: string; timeline?: string } = {};
    try { const t = await req.text(); if (t.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const { project = "", roadmap = "", timeline = "6 months" } = body;
    if (!project || !roadmap) return Response.json({ error: "project and roadmap are required" }, { status: 400 });

    const [narrativeRaw, buildRaw] = await Promise.all([
      aeon("narrative-tracker", `relevance to: ${project}. Which narratives support or conflict with this roadmap?`),
      llm(`You are Blue Agent running 'blue build'. Analyze this roadmap for technical feasibility on Base.
CRITICAL: Return ONLY raw JSON.
Schema: {"feasibility_score":<0-10>,"phases":[{"name":"<phase>","realistic":<boolean>,"concern":"<or null>"}],"missing":["<missing item>"],"dependency_risks":["<risk>"],"build_note":"<1 sentence>"}`,
        `Project: ${project}\nRoadmap: ${roadmap}\nTimeline: ${timeline}`, 0.3, 800),
    ]);

    const buildAnalysis = parseJson(buildRaw) ?? {};

    const msRaw = await llm(`You are MiroShark — 4-persona consensus engine.
Personas: Analyst(1.8x), Influencer(2.8x), Retail(1.0x), Observer(0.5x).
Evaluate this roadmap's market timing and community reception.
CRITICAL: Return ONLY raw JSON.
Schema: {"personas":{"analyst":{"stance":"bull|bear|neutral","weight":1.8,"rationale":"<1 sentence>"},"influencer":{"stance":"bull|bear|neutral","weight":2.8,"rationale":"<1 sentence>"},"retail":{"stance":"bull|bear|neutral","weight":1.0,"rationale":"<1 sentence>"},"observer":{"stance":"bull|bear|neutral","weight":0.5,"rationale":"<1 sentence>"}},"bull":<0-100>,"bear":<0-100>,"neutral":<0-100>,"recommendation":"execute|alert_human|skip","sentiment_summary":"<1 sentence>"}`,
      `Project: ${project}\nRoadmap: ${roadmap}\nEcosystem: ${narrativeRaw ?? "Base ecosystem"}`, 0.5, 800);
    const consensus = parseJson(msRaw) ?? { bull: 45, bear: 25, neutral: 30, recommendation: "alert_human" };

    const verdictRaw = await llm(`You are Blue Agent — roadmap validation engine.
CRITICAL: Return ONLY raw JSON.
Schema: {"verdict":"SHIP|REVISE|PIVOT","score":<0-100>,"narrative_alignment":{"score":<0-10>,"aligned":<boolean>,"note":"<1 sentence>"},"timeline_assessment":"realistic|aggressive|too_slow","consensus":{"bull":<0-100>,"bear":<0-100>,"neutral":<0-100>},"strengths":["<strength>"],"gaps":["<gap>"],"recommended_changes":["<change>"],"builder_note":"<1 sentence>"}`,
      `Project: ${project}\nRoadmap: ${roadmap}\nBuild analysis: ${JSON.stringify(buildAnalysis)}\nNarratives: ${narrativeRaw ?? "Base ecosystem"}\nConsensus: ${JSON.stringify(consensus)}`, 0.3, 1000);

    const verdict = parseJson(verdictRaw);
    if (!verdict) throw new Error("Failed to parse verdict");

    return Response.json({ tool: "roadmap-validator", timestamp: new Date().toISOString(), project, timeline, build_analysis: buildAnalysis, miroshark: consensus, ...verdict, disclaimer: "AI-generated advisory from model knowledge — scores and the bull/bear consensus are model estimates, not measured community sentiment or a guarantee. Verify independently." });
  } catch (e) {
    return Response.json({ error: "Roadmap validation failed", message: (e as Error).message }, { status: 500 });
  }
}
