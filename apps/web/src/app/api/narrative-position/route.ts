import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/narrative-position";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const topic = (body.topic as string) ?? (body.focus as string) ?? "";

  const varInput = topic
    ? `Focus on "${topic}" and related Base ecosystem narratives`
    : "Base ecosystem crypto narratives, AI x crypto, DeFi, agent economy";

  // Step 1: Aeon narrative-tracker
  const narrativeRaw = await runAeonSkill("narrative-tracker", varInput);

  // Step 2: MiroShark influencer persona
  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark influencer persona — narrative-driven, focuses on virality, social momentum, meme potential, community size.
Evaluate these narratives from an influencer/KOL perspective. Which ones would you post about?
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "top_narrative": "<name>",
  "would_post": ["<narrative name>"],
  "would_ignore": ["<narrative name>"],
  "viral_potential": {"<narrative>": <0-10>},
  "content_angles": ["<1-line angle for top narrative>"],
  "influencer_verdict": "<1-2 sentences>"
}`,
    messages: [{ role: "user", content: `Evaluate these narratives from influencer perspective:\n\n${narrativeRaw ?? "Base ecosystem narratives: AI agents, DeFi, x402 payments"}` }],
    temperature: 0.6,
    maxTokens: 600,
  });

  const influencerTake = extractJsonObject(msRaw) ?? { top_narrative: "AI x crypto", would_post: [], would_ignore: [], viral_potential: {}, content_angles: [], influencer_verdict: "Monitor for breakout signals" };

  // Step 3: Blue Agent synthesis — structured position map
  const synthesis = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — intelligence layer for Base builders.
Parse narrative signals and produce a structured position map.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "narratives": [
    {
      "name": "<narrative>",
      "phase": "Emerging|Rising|Peak|Fading|Dead",
      "velocity": "↑↑|↑|→|↓|↓↓",
      "mindshare": <1-5>,
      "position_call": "FRONT-RUN|RIDE|FADE|WATCH|IGNORE",
      "influencer_interest": <0-10>,
      "driver": "<named catalyst>",
      "bear_case": "<1 sentence>"
    }
  ],
  "transitions": ["<narrative>: <old phase> → <new phase>"],
  "top_opportunity": "<narrative name>",
  "reflexivity_alert": "<narrative showing cope/reflexivity or null>",
  "quiet_day": <boolean>
}`,
    messages: [{ role: "user", content: `Aeon narrative signals:\n${narrativeRaw ?? "Base ecosystem narratives"}\n\nMiroShark influencer take:\n${JSON.stringify(influencerTake)}${topic ? `\n\nUser focus: ${topic}` : ""}` }],
    temperature: 0.3,
    maxTokens: 1200,
  });

  const result = extractJsonObject(synthesis);
  if (!result) throw new Error("Failed to parse narrative synthesis");

  return NextResponse.json({
    tool: "narrative-position",
    timestamp: new Date().toISOString(),
    topic: topic || null,
    influencer_take: influencerTake,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  const cloned = req.clone();
  const bankrRes = await proxyTool(req, ENDPOINT);

  if (bankrRes.status < 500) return bankrRes; // 2xx success, 402 payment, 4xx errors pass through

  console.log("[narrative-position] Bankr 502 → falling back to local handler");
  try {
    let body: Record<string, unknown> = {};
    try { body = await cloned.json(); } catch {}
    return await handleLocally(body);
  } catch (error) {
    console.error("[narrative-position] Local handler failed:", error);
    return NextResponse.json(
      { error: "Narrative position failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
