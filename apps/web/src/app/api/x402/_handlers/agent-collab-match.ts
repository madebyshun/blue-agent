// x402/agent-collab-match/index.ts
// Agent Collab Match — Blue agent-score x2 + MiroShark analyst
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

async function scoreAgent(handle: string): Promise<Record<string, unknown>> {
  const raw = await llm(`You are Blue Agent Agent Score system.
Dimensions(total 100): skillDepth(0-25), onchainActivity(0-25), reliability(0-20), interoperability(0-20), reputation(0-10).
CRITICAL: Return ONLY raw JSON.
Schema: {"handle":"<handle>","xp":<0-100>,"tier":"Bot|Specialist|Operator|Sovereign","dimensions":{"skillDepth":<0-25>,"onchainActivity":<0-25>,"reliability":<0-20>,"interoperability":<0-20>,"reputation":<0-10>},"specialty":"<main domain>","strengths":["<strength>"]}`,
    `Score agent: ${handle}`, 0.3, 500);
  return parseJson(raw) ?? { handle, xp: 30, tier: "Specialist", specialty: "unknown" };
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { agent_a?: string; agent_b?: string; collab_goal?: string } = {};
    try { const t = await req.text(); if (t.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const { agent_a = "", agent_b = "", collab_goal = "" } = body;
    if (!agent_a || !agent_b) return Response.json({ error: "agent_a and agent_b are required" }, { status: 400 });

    const [scoreA, scoreB] = await Promise.all([scoreAgent(agent_a), scoreAgent(agent_b)]);

    const msRaw = await llm(`You are MiroShark analyst persona.
Analyze whether these two agents should collaborate.
CRITICAL: Return ONLY raw JSON.
Schema: {"compatibility_score":<0-10>,"complementary":["<where they complement>"],"conflicts":["<potential conflict>"],"collab_type":"integration|partnership|competition|neutral","analyst_verdict":"<1-2 sentences>"}`,
      `Agent A: ${agent_a}\n${JSON.stringify(scoreA)}\n\nAgent B: ${agent_b}\n${JSON.stringify(scoreB)}\n\nGoal: ${collab_goal || "general collaboration"}`, 0.3, 600);
    const analyst = parseJson(msRaw) ?? {};

    const resultRaw = await llm(`You are Blue Agent — agent collaboration matching engine.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "match_score": <0-100>,
  "verdict": "STRONG_MATCH|GOOD_MATCH|NEUTRAL|POOR_MATCH",
  "synergies": ["<synergy>"],
  "risks": ["<risk>"],
  "collab_format": "<recommended format e.g. API integration, skill sharing, joint tool>",
  "integration_path": ["<step 1>","<step 2>","<step 3>"],
  "value_created": "<what users gain>",
  "first_action": "<most immediate thing to do>"
}`,
      `Agent A (${agent_a}): ${JSON.stringify(scoreA)}\nAgent B (${agent_b}): ${JSON.stringify(scoreB)}\nGoal: ${collab_goal}\nAnalyst: ${JSON.stringify(analyst)}`, 0.3, 800);

    let result = parseJson(resultRaw);
    if (!result) result = { degraded: true, note: "Synthesis briefly unavailable - please retry." };

    return Response.json({ tool: "agent-collab-match", timestamp: new Date().toISOString(), agent_a, agent_b, collab_goal: collab_goal || null, score_a: scoreA, score_b: scoreB, analyst, ...result });
  } catch (e) {
    return Response.json({ error: "Agent collab match failed", message: (e as Error).message }, { status: 500 });
  }
}
