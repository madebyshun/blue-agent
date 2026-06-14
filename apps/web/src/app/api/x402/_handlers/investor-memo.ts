// x402/investor-memo/index.ts
// Investor Memo — Blue raise + Aeon deep-research + MiroShark analyst + influencer
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
    let body: { project?: string; description?: string; ask?: string; stage?: string; traction?: string } = {};
    try { const t = await req.text(); if (t.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const { project = "", description = "", ask = "", stage = "pre-seed", traction = "" } = body;
    if (!project || !description) return Response.json({ error: "project and description are required" }, { status: 400 });

    const [marketResearch, raiseRaw] = await Promise.all([
      aeon("deep-research", `Market size and opportunity for ${description} on Base. Comparable projects, TAM, key risks.`),
      llm(`You are Blue Agent running 'blue raise'. Write investor narrative sections.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "executive_summary": "<3 sentences>",
  "market_framing": "<2 sentences>",
  "why_this_wins": "<2 sentences>",
  "why_base": "<1 sentence>",
  "business_model": "<1-2 sentences>",
  "ask_framing": "<1 sentence>",
  "use_of_funds": ["<allocation>"]
}`,
        `Project: ${project}\nDescription: ${description}\nAsk: ${ask}\nStage: ${stage}\nTraction: ${traction || "pre-traction"}`, 0.4, 800),
    ]);

    const narrative = parseJson(raiseRaw) ?? {};

    const [analystRaw, influencerRaw] = await Promise.all([
      llm(`You are MiroShark analyst persona. Evaluate investment thesis critically.
CRITICAL: Return ONLY raw JSON.
Schema: {"investment_grade":"A|B|C|D","key_risks":["<risk>"],"key_strengths":["<strength>"],"comparable":"<similar funded project>","analyst_verdict":"<1-2 sentences>"}`,
        `Project: ${project}\nDescription: ${description}\nMarket: ${marketResearch ?? "Base ecosystem"}\nNarrative: ${JSON.stringify(narrative)}`, 0.3, 600),
      llm(`You are MiroShark influencer persona. Would this get crypto Twitter excited?
CRITICAL: Return ONLY raw JSON.
Schema: {"hype_potential":<0-10>,"viral_angle":"<best angle>","community_thesis":"<1 sentence>","influencer_verdict":"<1 sentence>"}`,
        `Project: ${project}\nDescription: ${description}`, 0.5, 400),
    ]);

    const analyst = parseJson(analystRaw) ?? {};
    const influencer = parseJson(influencerRaw) ?? {};

    const resultRaw = await llm(`You are Blue Agent — investor memo engine.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "memo_score": <0-100>,
  "one_pager": {
    "headline": "<10 words>",
    "problem": "<1 sentence>",
    "solution": "<1 sentence>",
    "market": "<TAM estimate>",
    "traction": "<or pre-traction>",
    "ask": "<amount + stage>",
    "why_now": "<1 sentence>"
  },
  "investor_fit": ["<type of investor who'd say yes>"],
  "red_flags_to_address": ["<flag>"],
  "strongest_angle": "<1 sentence>",
  "cold_outreach_subject": "<email subject line>"
}`,
      `Project: ${project}\nNarrative: ${JSON.stringify(narrative)}\nMarket: ${marketResearch ?? "Base"}\nAnalyst: ${JSON.stringify(analyst)}\nInfluencer: ${JSON.stringify(influencer)}`, 0.3, 1000);

    let result = parseJson(resultRaw);
    if (!result) result = { degraded: true, note: "Synthesis briefly unavailable - please retry." };

    return Response.json({ tool: "investor-memo", timestamp: new Date().toISOString(), project, stage, narrative, analyst, influencer, ...result, disclaimer: "AI-generated memo from model knowledge — the investment grade, scores, and any TAM/market figures are estimates, NOT investment advice, due diligence, or verified data. Verify independently." });
  } catch (e) {
    return Response.json({ error: "Investor memo failed", message: (e as Error).message }, { status: 500 });
  }
}
