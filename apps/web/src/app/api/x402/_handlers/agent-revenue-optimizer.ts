// x402/agent-revenue-optimizer/index.ts
// Agent Revenue Optimizer — Aeon deep-research + MiroShark analyst + Blue verdict
// Price: $0.50

type Msg = { role: string; content: string };
import { getAeonOutput, formatAeonForLLM } from "@/app/api/_lib/aeon-kv";

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
async function aeon(skill: string): Promise<string | null> {
  try {
    const fresh = await getAeonOutput(skill);
    if (fresh) return formatAeonForLLM(fresh);
  } catch {}
  return null;
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { agent?: string; description?: string; current_revenue?: string; model?: string } = {};
    try { const t = await req.text(); if (t.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const agent = body.agent ?? url.searchParams.get("agent") ?? "";
    const description = body.description ?? url.searchParams.get("description") ?? "";
    const current_revenue = body.current_revenue ?? url.searchParams.get("current_revenue") ?? "unknown";
    const model = body.model ?? url.searchParams.get("model") ?? "x402";
    if (!agent) return Response.json({ error: "agent is required" }, { status: 400 });

    const researchRaw = await aeon("deep-research", `AI agent monetization models in Base/crypto ecosystem: x402 micropayments, token gating, subscription, revenue sharing. Best practices for ${description || agent}.`);

    const msRaw = await llm(`You are MiroShark analyst persona — agent economy specialist.
Evaluate revenue optimization opportunities for this AI agent.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "revenue_potential": "high|medium|low",
  "best_model": "<recommended monetization model>",
  "pricing_tier": "<suggested price range>",
  "market_size": "<addressable market estimate>",
  "analyst_verdict": "<1-2 sentences>"
}`,
      `Agent: ${agent}\nDescription: ${description}\nCurrent revenue: ${current_revenue}\nModel: ${model}\nResearch: ${researchRaw ?? "AI agent economy"}`, 0.3, 500);
    const analyst = parseJson(msRaw) ?? {};

    const resultRaw = await llm(`You are Blue Agent — revenue optimizer for AI agents on Base.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "revenue_score": <0-100>,
  "recommended_model": "<primary monetization model>",
  "revenue_streams": [{"stream":"<e.g. x402 per-call>","potential":"high|medium|low","implementation":"<how to add>","estimated_arpu":"<per user>"}],
  "pricing_strategy": {"entry":"<free or $>","core":"<main price>","premium":"<top tier>"},
  "quick_revenue_wins": ["<immediate action>"],
  "untapped_opportunities": ["<opportunity not yet explored>"],
  "competitive_moat": "<what makes revenue defensible>",
  "30_day_target": "<realistic revenue target>",
  "summary": "<2 sentences>"
}`,
      `Agent: ${agent}\nDescription: ${description}\nCurrent: ${current_revenue}\nModel: ${model}\nResearch: ${researchRaw ?? "agent economy"}\nAnalyst: ${JSON.stringify(analyst)}`, 0.3, 1100);

    let result = parseJson(resultRaw);
    if (!result) result = { degraded: true, note: "Synthesis briefly unavailable - please retry." };

    return Response.json({ tool: "agent-revenue-optimizer", timestamp: new Date().toISOString(), agent, current_revenue, model, analyst, ...result, disclaimer: "Revenue advice and any figures are AI estimates from model knowledge, not measured from your live agent metrics." });
  } catch (e) {
    return Response.json({ error: "Agent revenue optimizer failed", message: (e as Error).message }, { status: 500 });
  }
}
