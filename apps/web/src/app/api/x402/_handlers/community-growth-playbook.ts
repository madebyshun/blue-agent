// x402/community-growth-playbook/index.ts
// Community Growth Playbook — Aeon narrative-tracker + MiroShark 4-persona + Blue idea
// Price: $0.50

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
    let body: { project?: string; description?: string; current_size?: string; goal?: string } = {};
    try { const t = await req.text(); if (t.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const project = body.project ?? url.searchParams.get("project") ?? "";
    const description = body.description ?? url.searchParams.get("description") ?? "";
    const current_size = body.current_size ?? url.searchParams.get("current_size") ?? "0";
    const goal = body.goal ?? url.searchParams.get("goal") ?? "1000 members";
    if (!project) return Response.json({ error: "project is required" }, { status: 400 });

    const narrativeRaw = await aeon("narrative-tracker", `community building strategies for ${project}: ${description}. What narratives attract communities in Base ecosystem? What makes people join and stay?`);

    const msRaw = await llm(`You are MiroShark — 4-persona community growth engine.
Personas: Analyst(1.8x), Influencer(2.8x), Retail(1.0x), Observer(0.5x).
Simulate what each persona needs to join and stay in this community.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "personas": {
    "analyst":    {"join_reason":"<why>","retention":"<what keeps them>","weight":1.8},
    "influencer": {"join_reason":"<why>","retention":"<what keeps them>","weight":2.8},
    "retail":     {"join_reason":"<why>","retention":"<what keeps them>","weight":1.0},
    "observer":   {"join_reason":"<why>","retention":"<what keeps them>","weight":0.5}
  },
  "growth_lever": "<highest impact lever>",
  "consensus_strategy": "<1-2 sentences>"
}`,
      `Project: ${project}\nDescription: ${description}\nCurrent size: ${current_size}\nGoal: ${goal}\nNarratives: ${narrativeRaw ?? "Base ecosystem"}`, 0.5, 700);
    const consensus = parseJson(msRaw) ?? {};

    const resultRaw = await llm(`You are Blue Agent — community growth strategist for Base builders.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "growth_score": <0-100>,
  "phase": "cold_start|early_growth|scaling|mature",
  "channels": [{"channel":"<Telegram|Twitter|Discord|etc>","priority":"high|medium|low","tactic":"<specific tactic>"}],
  "content_pillars": ["<content theme>"],
  "engagement_loops": ["<mechanic to retain members>"],
  "milestones": [{"target":"<e.g. 100 members>","tactic":"<how to get there>","timeline":"<e.g. week 1-2>"}],
  "quick_wins": ["<action to do this week>"],
  "avoid": ["<common mistake>"],
  "summary": "<2 sentences>"
}`,
      `Project: ${project}\nCurrent: ${current_size}\nGoal: ${goal}\nNarratives: ${narrativeRaw ?? "Base"}\nConsensus: ${JSON.stringify(consensus)}`, 0.3, 1200);

    let result = parseJson(resultRaw);
    if (!result) result = { degraded: true, note: "Synthesis briefly unavailable - please retry." };

    return Response.json({ tool: "community-growth-playbook", timestamp: new Date().toISOString(), project, current_size, goal, miroshark: consensus, ...result });
  } catch (e) {
    return Response.json({ error: "Community growth playbook failed", message: (e as Error).message }, { status: 500 });
  }
}
