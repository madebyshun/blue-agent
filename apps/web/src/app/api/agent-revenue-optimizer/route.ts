import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { extractJsonObject, runAeonSkill, runMiroSharkSkill, runBlueSkill } from "@/app/api/_lib/llm";

export const runtime = "nodejs";
export const maxDuration = 120;

const ENDPOINT = "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/agent-revenue-optimizer";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const agent = (body.agent as string) ?? "";
  const description = (body.description as string) ?? "";
  const current_revenue = (body.current_revenue as string) ?? "unknown";
  const model = (body.model as string) ?? "x402";

  if (!agent) return NextResponse.json({ error: "agent is required" }, { status: 400 });

  // Step 1+2: Aeon parallel — deep research on monetization + token movers on agent economy
  const [researchRaw, moversRaw] = await Promise.all([
    runAeonSkill("deep-research", `AI agent monetization models in Base/crypto ecosystem: x402 micropayments, token gating, subscription, revenue sharing. Best practices for ${description || agent}.`),
    runAeonSkill("token-movers", `AI agent economy on Base: revenue models, pricing patterns, successful agent monetization examples like VIRTUAL, ARC, bankr.bot`),
  ]);

  // Step 3: MiroShark — analyst persona on revenue optimization
  const msRaw = await runMiroSharkSkill({
    scenario: `Evaluate revenue optimization opportunities for AI agent ${agent} currently using ${model} model`,
    context: {
      agent,
      description,
      current_revenue,
      model,
      research: researchRaw ?? "AI agent economy",
      market_movers: moversRaw ?? "agent economy",
    },
    persona: "analyst — evaluates agent economics, token utility, market positioning",
    outputSchema: `{"revenue_potential":"high|medium|low","best_model":"<str>","pricing_tier":"<str>","market_size":"<str>","analyst_verdict":"<str>"}`,
    maxTokens: 500,
  });
  const analyst = extractJsonObject(msRaw ?? "") ?? {};

  // Step 4: Blue Agent synthesis — revenue optimizer
  const resultRaw = await runBlueSkill({
    task: "Optimize revenue strategy for this AI agent on Base with actionable implementation steps. CRITICAL: Return ONLY raw JSON. No markdown.",
    skillFiles: ["base-ecosystem.md"],
    input: `Agent: ${agent}\nDescription: ${description}\nCurrent revenue: ${current_revenue}\nModel: ${model}\nResearch: ${researchRaw ?? "agent economy"}\nMarket movers: ${moversRaw ?? "agent economy"}\nAnalyst: ${JSON.stringify(analyst)}`,
    outputSchema: `{"revenue_score":<0-100>,"recommended_model":"<str>","revenue_streams":[{"stream":"<str>","potential":"high|medium|low","implementation":"<str>","estimated_arpu":"<str>"}],"pricing_strategy":{"entry":"<str>","core":"<str>","premium":"<str>"},"quick_revenue_wins":["<str>"],"untapped_opportunities":["<str>"],"competitive_moat":"<str>","30_day_target":"<str>","summary":"<str>"}`,
    maxTokens: 1100,
  });

  const result = extractJsonObject(resultRaw ?? "");
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({
    tool: "agent-revenue-optimizer",
    timestamp: new Date().toISOString(),
    agent,
    current_revenue,
    model,
    analyst,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT, handleLocally);
}
