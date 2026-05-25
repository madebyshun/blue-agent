import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/fundraise-timing";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const project = (body.project as string) ?? "";
  const description = (body.description as string) ?? "";
  const ask = (body.ask as string) ?? "";
  const stage = (body.stage as string) ?? "pre-seed";

  if (!project) {
    return NextResponse.json({ error: "project is required" }, { status: 400 });
  }

  const [moversRaw, narrativeRaw] = await Promise.all([
    runAeonSkill("token-movers", "Base ecosystem market conditions, investor risk appetite"),
    runAeonSkill("narrative-tracker", `investor narrative cycle for ${project}: ${description}`),
  ]);

  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark influencer persona.
Assess investor sentiment and fundraising climate right now.
CRITICAL: Return ONLY raw JSON.
Schema: {"investor_appetite":"hot|warm|neutral|cold","raise_momentum":"building|peak|fading","best_narrative_angle":"<1 sentence>","timing_verdict":"<1 sentence>"}`,
    messages: [{ role: "user", content: `Market: ${moversRaw ?? "Base market"}\nNarratives: ${narrativeRaw ?? "Base ecosystem"}` }],
    temperature: 0.4,
    maxTokens: 400,
  });
  const influencerTake = extractJsonObject(msRaw) ?? { investor_appetite: "neutral", raise_momentum: "neutral", best_narrative_angle: "Base-native focus", timing_verdict: "Mixed signals" };

  const resultRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — fundraise timing engine.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "verdict": "RAISE_NOW|RAISE_SOON|WAIT|NOT_NOW",
  "timing_score": <0-100>,
  "market_window": "open|closing|closed|opening",
  "narrative_momentum": <0-10>,
  "investor_climate": "hot|warm|neutral|cold",
  "optimal_window": "<timeframe e.g. 'next 4-6 weeks'>",
  "catalysts_to_wait_for": ["<catalyst if WAIT>"],
  "raise_strategy": "<2-3 sentences>",
  "risk_of_waiting": "<1 sentence>",
  "risk_of_rushing": "<1 sentence>"
}`,
    messages: [{ role: "user", content: `Project: ${project}\nDescription: ${description}\nAsk: ${ask}\nStage: ${stage}\nMarket: ${moversRaw ?? "Base"}\nNarratives: ${narrativeRaw ?? "Base"}\nInfluencer: ${JSON.stringify(influencerTake)}` }],
    temperature: 0.3,
    maxTokens: 900,
  });

  const result = extractJsonObject(resultRaw);
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({
    tool: "fundraise-timing",
    timestamp: new Date().toISOString(),
    project,
    stage,
    influencer: influencerTake,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT);
}
