import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/agent-revenue-optimizer";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const agent = (body.agent as string) ?? "";
  const description = (body.description as string) ?? "";
  const current_revenue = (body.current_revenue as string) ?? "unknown";
  const model = (body.model as string) ?? "x402";
  if (!agent) return NextResponse.json({ error: "agent is required" }, { status: 400 });

  const researchRaw = await runAeonSkill("deep-research", `AI agent monetization models in Base/crypto ecosystem: x402 micropayments, token gating, subscription, revenue sharing. Best practices for ${description || agent}.`);

  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark analyst persona — agent economy specialist.
Evaluate revenue optimization opportunities for this AI agent.
CRITICAL: Return ONLY raw JSON.
Schema: {"revenue_potential":"high|medium|low","best_model":"<str>","pricing_tier":"<str>","market_size":"<str>","analyst_verdict":"<str>"}`,
    messages: [{ role: "user", content: `Agent: ${agent}\nDescription: ${description}\nCurrent revenue: ${current_revenue}\nModel: ${model}\nResearch: ${researchRaw ?? "AI agent economy"}` }],
    temperature: 0.3, maxTokens: 500,
  });
  const analyst = extractJsonObject(msRaw) ?? {};

  const resultRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — revenue optimizer for AI agents on Base.
CRITICAL: Return ONLY raw JSON.
Schema: {"revenue_score":<0-100>,"recommended_model":"<str>","revenue_streams":[{"stream":"<str>","potential":"high|medium|low","implementation":"<str>","estimated_arpu":"<str>"}],"pricing_strategy":{"entry":"<str>","core":"<str>","premium":"<str>"},"quick_revenue_wins":["<str>"],"untapped_opportunities":["<str>"],"competitive_moat":"<str>","30_day_target":"<str>","summary":"<str>"}`,
    messages: [{ role: "user", content: `Agent: ${agent}\nDescription: ${description}\nCurrent: ${current_revenue}\nModel: ${model}\nResearch: ${researchRaw ?? "agent economy"}\nAnalyst: ${JSON.stringify(analyst)}` }],
    temperature: 0.3, maxTokens: 1100,
  });
  const result = extractJsonObject(resultRaw);
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({ tool: "agent-revenue-optimizer", timestamp: new Date().toISOString(), agent, current_revenue, model, analyst, ...result });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT);
}
