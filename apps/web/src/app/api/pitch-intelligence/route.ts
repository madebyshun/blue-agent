import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/pitch-intelligence";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const project = (body.project as string) ?? "";
  const description = (body.description as string) ?? (body.pitch_summary as string) ?? "";
  const ask = (body.ask as string) ?? "";
  const stage = (body.stage as string) ?? "pre-seed";

  if (!project || !description) {
    return NextResponse.json({ error: "project and pitch summary are required" }, { status: 400 });
  }

  const [narrativeRaw, raiseRaw] = await Promise.all([
    runAeonSkill("narrative-tracker", `investor narrative relevance for ${project}: ${description}`),
    callBankrLLM({
      model: "claude-haiku-4-5",
      system: `You are Blue Agent running 'blue raise'. Build pitch narrative for Base builders.
CRITICAL: Return ONLY raw JSON.
Schema: {"market_framing":"<1-2 sentences>","why_this_wins":"<1-2 sentences>","why_now":"<1 sentence>","why_base":"<1 sentence>","ask_framing":"<1 sentence>","target_investor_type":"<e.g. crypto-native, generalist, strategic>"}`,
      messages: [{ role: "user", content: `Project: ${project}\nDescription: ${description}\nAsk: ${ask || "not specified"}\nStage: ${stage}` }],
      temperature: 0.4,
      maxTokens: 700,
    }),
  ]);

  const raisePitch = extractJsonObject(raiseRaw) ?? {};

  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark influencer persona — narrative-driven, focuses on virality, community, social momentum.
Evaluate this pitch from an influencer/KOL perspective. Would you hype this?
CRITICAL: Return ONLY raw JSON.
Schema: {"would_hype":<boolean>,"hype_score":<0-10>,"narrative_hooks":["<hook>"],"weak_points":["<weak point>"],"suggested_angle":"<best narrative angle>","influencer_verdict":"<1 sentence>"}`,
    messages: [{ role: "user", content: `Project: ${project}\nDescription: ${description}\nNarratives: ${narrativeRaw ?? "Base ecosystem"}\nPitch: ${JSON.stringify(raisePitch)}` }],
    temperature: 0.5,
    maxTokens: 600,
  });
  const influencerTake = extractJsonObject(msRaw) ?? { would_hype: false, hype_score: 5, narrative_hooks: [], weak_points: [], suggested_angle: "Focus on Base-native angle", influencer_verdict: "Needs stronger narrative" };

  const resultRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — pitch intelligence engine.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "pitch_score": <0-100>,
  "narrative_timing": "perfect|good|neutral|bad",
  "narrative_fit_score": <0-10>,
  "pitch_angles": ["<angle>"],
  "investor_thesis": "<2-3 sentences ready to paste>",
  "one_liner": "<10 words or less>",
  "strengthen": ["<specific improvement>"],
  "avoid": ["<what not to say>"],
  "best_investor_type": "<specific profile>"
}`,
    messages: [{ role: "user", content: `Project: ${project}\nDescription: ${description}\nAsk: ${ask}\nStage: ${stage}\nPitch: ${JSON.stringify(raisePitch)}\nNarratives: ${narrativeRaw ?? "Base"}\nInfluencer: ${JSON.stringify(influencerTake)}` }],
    temperature: 0.3,
    maxTokens: 1000,
  });

  const result = extractJsonObject(resultRaw);
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({
    tool: "pitch-intelligence",
    timestamp: new Date().toISOString(),
    project,
    stage,
    raise_pitch: raisePitch,
    influencer: influencerTake,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  const cloned = req.clone();
  const bankrRes = await proxyTool(req, ENDPOINT);

  if (bankrRes.status < 500) return bankrRes; // 2xx success, 402 payment, 4xx errors pass through

  console.log("[pitch-intelligence] Bankr 502 → falling back to local handler");
  try {
    let body: Record<string, unknown> = {};
    try { body = await cloned.json(); } catch {}
    return await handleLocally(body);
  } catch (error) {
    console.error("[pitch-intelligence] Local handler failed:", error);
    return NextResponse.json(
      { error: "Pitch intelligence failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
