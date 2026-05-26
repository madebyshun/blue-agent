import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { extractJsonObject, runAeonSkill, runMiroSharkSkill, runBlueSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/community-sentiment";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const project = (body.project as string) ?? "";
  const description = (body.description as string) ?? "";

  if (!project) {
    return NextResponse.json({ error: "project is required" }, { status: 400 });
  }

  // Step 1+2: Aeon parallel — narrative tracker + token movers for market temperature
  const [narrativeRaw, moversRaw] = await Promise.all([
    runAeonSkill("narrative-tracker", `community sentiment around ${project}: ${description}`),
    runAeonSkill("token-movers", `market sentiment and community heat around ${project} and similar Base projects`),
  ]);

  // Step 3: MiroShark — 4-persona consensus on community sentiment
  const msRaw = await runMiroSharkSkill({
    scenario: `Simulate community sentiment for ${project} across all persona types`,
    context: {
      project,
      description,
      narratives: narrativeRaw ?? "Base ecosystem",
      market_movers: moversRaw ?? "Base ecosystem",
    },
    persona: "4-persona consensus — Analyst(1.8x), Influencer(2.8x), Retail(1.0x), Observer(0.5x)",
    outputSchema: `{"personas":{"analyst":{"stance":"bull|bear|neutral","weight":1.8,"rationale":"<1 sentence>"},"influencer":{"stance":"bull|bear|neutral","weight":2.8,"rationale":"<1 sentence>"},"retail":{"stance":"bull|bear|neutral","weight":1.0,"rationale":"<1 sentence>"},"observer":{"stance":"bull|bear|neutral","weight":0.5,"rationale":"<1 sentence>"}},"bull":<0-100>,"bear":<0-100>,"neutral":<0-100>,"community_temperature":"hot|warm|neutral|cool|cold","fomo_level":"high|medium|low","fud_level":"high|medium|low","sentiment_summary":"<1 sentence>"}`,
    maxTokens: 800,
  });
  const consensus = extractJsonObject(msRaw ?? "") ?? { bull: 40, bear: 30, neutral: 30, community_temperature: "neutral" };

  // Step 4: Blue Agent synthesis — community sentiment analysis
  const resultRaw = await runBlueSkill({
    task: "Analyze community sentiment and provide actionable recommendations for this Base project. CRITICAL: Return ONLY raw JSON. No markdown.",
    skillFiles: ["base-ecosystem.md"],
    input: `Project: ${project}\nDescription: ${description}\nNarratives: ${narrativeRaw ?? "Base"}\nMarket movers: ${moversRaw ?? "Base"}\nConsensus: ${JSON.stringify(consensus)}`,
    outputSchema: `{"sentiment_score":<0-100>,"overall":"very_bullish|bullish|neutral|bearish|very_bearish","consensus":{"bull":<0-100>,"bear":<0-100>,"neutral":<0-100>},"key_drivers":["<driver>"],"risk_signals":["<signal>"],"community_health":"strong|growing|stable|declining|fragmented","recommended_actions":["<action>"],"summary":"<2 sentences>"}`,
    maxTokens: 700,
  });

  const result = extractJsonObject(resultRaw ?? "");
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({
    tool: "community-sentiment",
    timestamp: new Date().toISOString(),
    project,
    miroshark: consensus,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT, handleLocally);
}
