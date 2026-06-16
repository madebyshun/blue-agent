// x402/agent-token-strategy/index.ts
// Agent Token Strategy — Aeon token-movers + Aeon narrative-tracker + MiroShark retail + Blue raise
// Price: $0.50

import { getAeonOutput, formatAeonForLLM } from "@/app/api/_lib/aeon-kv";
import { callVeniceLLM } from "@/app/api/_lib/llm";

async function llm(system: string, user: string, temp = 0.4, tokens = 1000): Promise<string> {
  return callVeniceLLM({ system, user, temperature: temp, maxTokens: tokens });
}
function parseJson(t: string): Record<string, unknown> | null {
  let s = t.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const i = s.indexOf("{"), j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  try { return JSON.parse(s); } catch { try { return JSON.parse(s.replace(/[\x00-\x1F]/g, " ")); } catch { return null; } }
}
async function aeon(skill: string): Promise<string | null> {
  try {
    const fresh = await getAeonOutput(skill);
    if (fresh) return formatAeonForLLM(fresh);
  } catch {}
  return null;
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
      aeon("token-movers"),
      aeon("narrative-tracker"),
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

    let result = parseJson(resultRaw);
    if (!result) result = { degraded: true, note: "Synthesis briefly unavailable - please retry." };

    return Response.json({ tool: "agent-token-strategy", timestamp: new Date().toISOString(), agent, token_name, total_supply, retail, ...result, disclaimer: "AI-generated advisory from model knowledge — scores, allocations, and comparables are estimates, not measured data, financial advice, or a guarantee. Verify independently." });
  } catch (e) {
    return Response.json({ error: "Agent token strategy failed", message: (e as Error).message }, { status: 500 });
  }
}
