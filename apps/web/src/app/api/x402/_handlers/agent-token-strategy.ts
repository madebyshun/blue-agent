// x402/agent-token-strategy/index.ts
// Agent Token Strategy — Aeon token-movers + Aeon narrative-tracker + MiroShark retail + Blue raise
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
    let body: { agent?: string; description?: string; token_name?: string; total_supply?: string } = {};
    try { const t = await req.text(); if (t.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const agent = body.agent ?? url.searchParams.get("agent") ?? "";
    const description = body.description ?? url.searchParams.get("description") ?? "";
    const token_name = body.token_name ?? url.searchParams.get("token_name") ?? "";
    const total_supply = body.total_supply ?? url.searchParams.get("total_supply") ?? "1000000000";
    if (!agent) return Response.json({ error: "agent is required" }, { status: 400 });

    const [moversRaw, narrativeRaw] = await Promise.all([
      aeon("token-movers", `AI agent tokens on Base: what's working, what tokenomics patterns succeed for agent-owned projects. Examples like VIRTUAL, ARC, similar.`),
      aeon("narrative-tracker", `AI agent token narrative on Base: what story resonates for agent tokens? Utility vs memecoin positioning. ${agent} ${description}`),
    ]);

    const msRaw = await llm(`You are MiroShark — retail perspective (1.0x weight) on agent token strategies.
What makes retail buy and hold an agent token?
CRITICAL: Return ONLY raw JSON.
Schema: {
  "retail_appeal": <0-10>,
  "token_type_fit": "utility|governance|memecoin|hybrid",
  "buy_trigger": "<what makes retail buy>",
  "hold_reason": "<what makes retail hold>",
  "retail_verdict": "<1 sentence>"
}`,
      `Agent: ${agent}\nDescription: ${description}\nToken: ${token_name || "unnamed"}\nMovers: ${moversRaw ?? "agent tokens"}\nNarratives: ${narrativeRaw ?? "AI agent tokens"}`, 0.4, 500);
    const retail = parseJson(msRaw) ?? {};

    const resultRaw = await llm(`You are Blue Agent — token strategy engine for AI agent projects on Base.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "strategy_score": <0-100>,
  "recommended_type": "utility|governance|memecoin|hybrid",
  "tokenomics": {
    "total_supply": "<supply>",
    "allocation": {"team":"<%>","community":"<%>","treasury":"<%>","liquidity":"<%>","rewards":"<%>"},
    "vesting": "<team vesting schedule>",
    "utility": ["<token use case>"]
  },
  "narrative_angle": "<the story to tell>",
  "launch_sequence": ["<step 1>", "<step 2>", "<step 3>"],
  "comparable_agents": ["<similar successful agent token>"],
  "risks": ["<tokenomics risk>"],
  "summary": "<2 sentences>"
}`,
      `Agent: ${agent}\nDescription: ${description}\nToken: ${token_name}\nSupply: ${total_supply}\nMovers: ${moversRaw ?? "agent tokens"}\nNarratives: ${narrativeRaw ?? "Base"}\nRetail: ${JSON.stringify(retail)}`, 0.3, 1200);

    const result = parseJson(resultRaw);
    if (!result) throw new Error("Failed to parse result");

    return Response.json({ tool: "agent-token-strategy", timestamp: new Date().toISOString(), agent, token_name, total_supply, retail, ...result });
  } catch (e) {
    return Response.json({ error: "Agent token strategy failed", message: (e as Error).message }, { status: 500 });
  }
}
