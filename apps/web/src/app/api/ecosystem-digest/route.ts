import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/ecosystem-digest";

async function handleLocally(_body: Record<string, unknown>): Promise<NextResponse> {
  // Step 1+2: Aeon token-movers (Base) + narrative-tracker in parallel
  const [moversRaw, narrativeRaw] = await Promise.all([
    runAeonSkill("token-movers", "Base chain ecosystem tokens, chain=base, min_mcap=$1M"),
    runAeonSkill("narrative-tracker", "Base ecosystem, AI agents, DeFi, builder economy"),
  ]);

  // Step 3: MiroShark observer — neutral temperature check
  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark observer persona — neutral recorder, no strong bias, synthesizes what others say.
Record the community temperature for the Base ecosystem this week.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "temperature": "hot|warm|neutral|cool|cold",
  "bull": <0-100>,
  "bear": <0-100>,
  "neutral": <0-100>,
  "community_mood": "<1 sentence>",
  "notable_events": ["<event>"],
  "builder_activity": "high|medium|low",
  "what_observers_say": "<1-2 sentences>"
}`,
    messages: [{ role: "user", content: `Base ecosystem this week:\n\nToken movers:\n${moversRaw ?? "Base tokens active"}\n\nNarratives:\n${narrativeRaw ?? "AI agents, DeFi narratives active"}` }],
    temperature: 0.4,
    maxTokens: 500,
  });

  const observerTake = extractJsonObject(msRaw) ?? { temperature: "neutral", bull: 40, bear: 30, neutral: 30, community_mood: "Steady builder activity", notable_events: [], builder_activity: "medium", what_observers_say: "Base ecosystem continuing to grow" };

  // Step 4: Blue Agent final digest synthesis
  const synthesis = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — AI-native intelligence for Base builders.
Produce a concise weekly digest of the Base ecosystem.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "headline": "<1 sentence digest headline>",
  "movers": [{"token":"<symbol>","change":"<+/-%>","note":"<1 sentence>"}],
  "narratives": [{"name":"<narrative>","phase":"Emerging|Rising|Peak|Fading","key_point":"<1 sentence>"}],
  "community": {"temperature":"<hot/warm/neutral/cool/cold>","bull":<0-100>,"bear":<0-100>,"neutral":<0-100>},
  "what_moved": ["<key event or trend>"],
  "what_matters": ["<actionable insight>"],
  "what_to_watch": ["<upcoming catalyst or risk>"],
  "builder_signal": "<1 sentence for builders>",
  "week_rating": <1-10>
}`,
    messages: [{ role: "user", content: `Aeon token-movers:\n${moversRaw ?? "Base tokens"}\n\nAeon narratives:\n${narrativeRaw ?? "Base narratives"}\n\nMiroShark observer:\n${JSON.stringify(observerTake)}` }],
    temperature: 0.3,
    maxTokens: 1200,
  });

  const result = extractJsonObject(synthesis);
  if (!result) throw new Error("Failed to parse digest");

  return NextResponse.json({
    tool: "ecosystem-digest",
    timestamp: new Date().toISOString(),
    period: "weekly",
    observer: observerTake,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT);
}
