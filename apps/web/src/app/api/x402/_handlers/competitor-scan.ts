// x402/competitor-scan/index.ts
// Competitor Scan — Aeon deep-research x2 + Blue compare + MiroShark analyst
// Price: $0.75
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
      `Follow skill template. Be concrete.\n\nSkill:\n${p}${focus ? `\nFocus: ${focus}` : ""}\n\nReturn only skill output.`, 0.2, 1400);
  } catch { return null; }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { project?: string; competitors?: string[]; description?: string } = {};
    try { const t = await req.text(); if (t.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const { project = "", competitors = [], description = "" } = body;
    if (!project) return Response.json({ error: "project is required" }, { status: 400 });

    const competitorList = competitors.length ? competitors.join(", ") : "top competitors in this space";

    // Research project + competitors in parallel
    const [projectResearch, competitorResearch] = await Promise.all([
      aeon("deep-research", `${project}: ${description}. Focus on strengths, weaknesses, market position on Base.`),
      aeon("deep-research", `${competitorList} — competitive landscape analysis vs ${project}. Focus on differentiation, moats, weaknesses.`),
    ]);

    // MiroShark analyst persona
    const msRaw = await llm(`You are MiroShark analyst persona — data-driven, fundamentals-focused, skeptical.
Analyze competitive positioning.
CRITICAL: Return ONLY raw JSON.
Schema: {"competitive_advantage":"strong|moderate|weak","moat_score":<0-10>,"differentiation":["<point>"],"vulnerabilities":["<vulnerability>"],"analyst_verdict":"<1-2 sentences>"}`,
      `Project: ${project}\n${description}\n\nProject research:\n${projectResearch ?? project}\n\nCompetitor research:\n${competitorResearch ?? competitorList}`, 0.3, 600);
    const analystTake = parseJson(msRaw) ?? { competitive_advantage: "moderate", moat_score: 5, differentiation: [], vulnerabilities: [], analyst_verdict: "Mixed competitive signals" };

    // Blue Agent synthesis
    const resultRaw = await llm(`You are Blue Agent — competitive intelligence engine for Base builders.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "verdict": "STRONG|COMPETITIVE|WEAK",
  "score": <0-100>,
  "project_strengths": ["<strength>"],
  "project_weaknesses": ["<weakness>"],
  "competitors": [{"name":"<name>","threat_level":"high|medium|low","key_advantage":"<1 sentence>","vulnerability":"<1 sentence>"}],
  "whitespace": ["<market gap to exploit>"],
  "recommended_positioning": "<1-2 sentences>",
  "win_condition": "<what it takes to win>"
}`,
      `Project: ${project}\nDescription: ${description}\n\nProject research:\n${projectResearch ?? project}\n\nCompetitor research:\n${competitorResearch ?? competitorList}\n\nAnalyst: ${JSON.stringify(analystTake)}`, 0.3, 1200);

    let result = parseJson(resultRaw);
    if (!result) result = { degraded: true, note: "Synthesis briefly unavailable - please retry." };

    return Response.json({ tool: "competitor-scan", timestamp: new Date().toISOString(), project, competitors_analyzed: competitorList, analyst: analystTake, ...result });
  } catch (e) {
    return Response.json({ error: "Competitor scan failed", message: (e as Error).message }, { status: 500 });
  }
}
