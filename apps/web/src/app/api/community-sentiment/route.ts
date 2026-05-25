import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/community-sentiment";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const project = (body.project as string) ?? "";
  const description = (body.description as string) ?? "";

  if (!project) {
    return NextResponse.json({ error: "project is required" }, { status: 400 });
  }

  const narrativeRaw = await runAeonSkill("narrative-tracker", `community sentiment around ${project}: ${description}`);

  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark — 4-persona consensus engine.
Personas: Analyst(1.8x), Influencer(2.8x), Retail(1.0x), Observer(0.5x).
Simulate community sentiment for this project.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "personas": {
    "analyst":    {"stance":"bull|bear|neutral","weight":1.8,"rationale":"<1 sentence>"},
    "influencer": {"stance":"bull|bear|neutral","weight":2.8,"rationale":"<1 sentence>"},
    "retail":     {"stance":"bull|bear|neutral","weight":1.0,"rationale":"<1 sentence>"},
    "observer":   {"stance":"bull|bear|neutral","weight":0.5,"rationale":"<1 sentence>"}
  },
  "bull":<0-100>,"bear":<0-100>,"neutral":<0-100>,
  "community_temperature":"hot|warm|neutral|cool|cold",
  "fomo_level":"high|medium|low",
  "fud_level":"high|medium|low",
  "sentiment_summary":"<1 sentence>"
}`,
    messages: [{ role: "user", content: `Project: ${project}\nDescription: ${description}\nNarratives: ${narrativeRaw ?? "Base ecosystem"}` }],
    temperature: 0.5,
    maxTokens: 800,
  });
  const consensus = extractJsonObject(msRaw) ?? { bull: 40, bear: 30, neutral: 30, community_temperature: "neutral" };

  const resultRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — community sentiment analyzer.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "sentiment_score": <0-100>,
  "overall": "very_bullish|bullish|neutral|bearish|very_bearish",
  "consensus": {"bull":<0-100>,"bear":<0-100>,"neutral":<0-100>},
  "key_drivers": ["<driver>"],
  "risk_signals": ["<signal>"],
  "community_health": "strong|growing|stable|declining|fragmented",
  "recommended_actions": ["<action>"],
  "summary": "<2 sentences>"
}`,
    messages: [{ role: "user", content: `Project: ${project}\nNarratives: ${narrativeRaw ?? "Base"}\nConsensus: ${JSON.stringify(consensus)}` }],
    temperature: 0.3,
    maxTokens: 700,
  });

  const result = extractJsonObject(resultRaw);
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
  const cloned = req.clone();
  const bankrRes = await proxyTool(req, ENDPOINT);

  if (bankrRes.status !== 502) return bankrRes;

  console.log("[community-sentiment] Bankr 502 → falling back to local handler");
  try {
    let body: Record<string, unknown> = {};
    try { body = await cloned.json(); } catch {}
    return await handleLocally(body);
  } catch (error) {
    console.error("[community-sentiment] Local handler failed:", error);
    return NextResponse.json(
      { error: "Community sentiment failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
