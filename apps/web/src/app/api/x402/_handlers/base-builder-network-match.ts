// x402/base-builder-network-match/index.ts
// Base Builder Network Match — Aeon deep-research + MiroShark analyst + Blue verdict
// Price: $0.35

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
    let body: { builder?: string; project?: string; looking_for?: string; skills?: string } = {};
    try { const t = await req.text(); if (t.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const builder = body.builder ?? url.searchParams.get("builder") ?? "";
    const project = body.project ?? url.searchParams.get("project") ?? "";
    const looking_for = body.looking_for ?? url.searchParams.get("looking_for") ?? "";
    const skills = body.skills ?? url.searchParams.get("skills") ?? "";
    if (!builder && !project) return Response.json({ error: "builder or project is required" }, { status: 400 });

    const researchRaw = await aeon("deep-research", `Base ecosystem builder network: active builders, their projects, complementary skills, collaboration patterns. Context: ${builder || project} — ${skills || "full-stack"} builder looking for ${looking_for || "collaborators"}.`);

    const msRaw = await llm(`You are MiroShark analyst persona — network and synergy specialist.
Identify best collaboration matches and network opportunities.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "network_fit": "excellent|good|fair|limited",
  "top_match_type": "<co-founder|advisor|integration partner|community>",
  "synergy_score": <0-10>,
  "ecosystem_position": "<where this builder fits in Base ecosystem>",
  "analyst_verdict": "<1-2 sentences>"
}`,
      `Builder: ${builder || project}\nSkills: ${skills}\nLooking for: ${looking_for}\nResearch: ${researchRaw ?? "Base builders"}`, 0.3, 500);
    const analyst = parseJson(msRaw) ?? {};

    const resultRaw = await llm(`You are Blue Agent — builder network match engine for Base ecosystem.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "match_score": <0-100>,
  "matches": [
    {
      "type": "co-founder|advisor|integration partner|community builder",
      "profile": "<who to look for>",
      "where_to_find": "<Farcaster|Twitter|Base Discord|ETHGlobal>",
      "outreach_angle": "<how to approach them>",
      "synergy": "<why this works>"
    }
  ],
  "builder_archetype": "<what type of builder you are>",
  "value_proposition": "<what you bring to collabs>",
  "network_gaps": ["<skill or connection missing>"],
  "first_steps": ["<action to take this week>"],
  "ecosystem_fit": "<where you plug into Base>",
  "summary": "<2 sentences>"
}`,
      `Builder: ${builder || project}\nSkills: ${skills}\nLooking for: ${looking_for}\nResearch: ${researchRaw ?? "Base"}\nAnalyst: ${JSON.stringify(analyst)}`, 0.3, 1100);

    let result = parseJson(resultRaw);
    if (!result) result = { degraded: true, note: "Synthesis briefly unavailable - please retry." };

    return Response.json({ tool: "base-builder-network-match", timestamp: new Date().toISOString(), builder: builder || project, looking_for, analyst, ...result });
  } catch (e) {
    return Response.json({ error: "Base builder network match failed", message: (e as Error).message }, { status: 500 });
  }
}
