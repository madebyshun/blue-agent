import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { extractJsonObject, runAeonSkill, runMiroSharkSkill, runBlueSkill } from "@/app/api/_lib/llm";

export const runtime = "nodejs";
export const maxDuration = 120;

const ENDPOINT = "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/fundraise-timing";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const project = (body.project as string) ?? "";
  const description = (body.description as string) ?? "";
  const ask = (body.ask as string) ?? "";
  const stage = (body.stage as string) ?? "pre-seed";

  if (!project) {
    return NextResponse.json({ error: "project is required" }, { status: 400 });
  }

  // Step 1+2: Aeon parallel — token movers (market conditions) + narrative tracker (investor cycle)
  const [moversRaw, narrativeRaw] = await Promise.all([
    runAeonSkill("token-movers", "Base ecosystem market conditions, investor risk appetite"),
    runAeonSkill("narrative-tracker", `investor narrative cycle for ${project}: ${description}`),
  ]);

  // Step 3: MiroShark — influencer persona on fundraising climate
  const msRaw = await runMiroSharkSkill({
    scenario: `Assess investor sentiment and fundraising climate right now for ${project}`,
    context: {
      project,
      description,
      ask,
      stage,
      market: moversRaw ?? "Base market",
      narratives: narrativeRaw ?? "Base ecosystem",
    },
    persona: "influencer — CT engagement focused, viral mechanics, audience growth",
    outputSchema: `{"investor_appetite":"hot|warm|neutral|cold","raise_momentum":"building|peak|fading","best_narrative_angle":"<1 sentence>","timing_verdict":"<1 sentence>"}`,
    maxTokens: 400,
  });
  const influencerTake = extractJsonObject(msRaw ?? "") ?? { investor_appetite: "neutral", raise_momentum: "neutral", best_narrative_angle: "Base-native focus", timing_verdict: "Mixed signals" };

  // Step 4: Blue Agent synthesis — fundraise timing verdict
  const resultRaw = await runBlueSkill({
    task: "Determine optimal fundraising timing for this Base project based on market conditions, narrative momentum, and investor sentiment. CRITICAL: Return ONLY raw JSON. No markdown.",
    skillFiles: ["base-ecosystem.md", "token-launch-guide.md"],
    input: `Project: ${project}\nDescription: ${description}\nAsk: ${ask}\nStage: ${stage}\nMarket: ${moversRaw ?? "Base"}\nNarratives: ${narrativeRaw ?? "Base"}\nInfluencer: ${JSON.stringify(influencerTake)}`,
    outputSchema: `{"verdict":"RAISE_NOW|RAISE_SOON|WAIT|NOT_NOW","timing_score":<0-100>,"market_window":"open|closing|closed|opening","narrative_momentum":<0-10>,"investor_climate":"hot|warm|neutral|cold","optimal_window":"<timeframe e.g. 'next 4-6 weeks'>","catalysts_to_wait_for":["<catalyst if WAIT>"],"raise_strategy":"<2-3 sentences>","risk_of_waiting":"<1 sentence>","risk_of_rushing":"<1 sentence>"}`,
    maxTokens: 900,
  });

  const result = extractJsonObject(resultRaw ?? "");
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
  return proxyTool(req, ENDPOINT, handleLocally);
}
