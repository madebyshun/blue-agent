import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { extractJsonObject, runAeonSkill, runMiroSharkSkill, runBlueSkill } from "@/app/api/_lib/llm";

export const runtime = "nodejs";
export const maxDuration = 120;

const ENDPOINT = "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/pitch-intelligence";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const project = (body.project as string) ?? "";
  const description = (body.description as string) ?? (body.pitch_summary as string) ?? "";
  const ask = (body.ask as string) ?? "";
  const stage = (body.stage as string) ?? "pre-seed";

  if (!project || !description) {
    return NextResponse.json({ error: "project and pitch summary are required" }, { status: 400 });
  }

  // Step 1+2: Aeon parallel — narrative tracker + deep research on investor landscape
  const [narrativeRaw, investorResearchRaw] = await Promise.all([
    runAeonSkill("narrative-tracker", `investor narrative relevance for ${project}: ${description}`),
    runAeonSkill("deep-research", `Investor landscape for ${stage} Base/crypto projects like ${project}: ${description}. What investors are active, what thesis resonates, comparable funded projects.`),
  ]);

  // Step 3: MiroShark — influencer persona on pitch virality and narrative hooks
  const msRaw = await runMiroSharkSkill({
    scenario: `Evaluate this pitch from an influencer/KOL perspective — would you hype this project?`,
    context: {
      project,
      description,
      ask,
      stage,
      narratives: narrativeRaw ?? "Base ecosystem",
      investor_landscape: investorResearchRaw ?? "Base ecosystem",
    },
    persona: "influencer — CT engagement focused, viral mechanics, audience growth",
    outputSchema: `{"would_hype":<boolean>,"hype_score":<0-10>,"narrative_hooks":["<hook>"],"weak_points":["<weak point>"],"suggested_angle":"<best narrative angle>","influencer_verdict":"<1 sentence>"}`,
    maxTokens: 600,
  });
  const influencerTake = extractJsonObject(msRaw ?? "") ?? { would_hype: false, hype_score: 5, narrative_hooks: [], weak_points: [], suggested_angle: "Focus on Base-native angle", influencer_verdict: "Needs stronger narrative" };

  // Step 4: Blue Agent synthesis — pitch intelligence
  const resultRaw = await runBlueSkill({
    task: "Analyze this pitch and produce actionable pitch intelligence for Base builders raising capital. CRITICAL: Return ONLY raw JSON. No markdown.",
    skillFiles: ["base-ecosystem.md", "token-launch-guide.md"],
    input: `Project: ${project}\nDescription: ${description}\nAsk: ${ask}\nStage: ${stage}\nNarratives: ${narrativeRaw ?? "Base"}\nInvestor landscape: ${investorResearchRaw ?? "Base"}\nInfluencer: ${JSON.stringify(influencerTake)}`,
    outputSchema: `{"pitch_score":<0-100>,"narrative_timing":"perfect|good|neutral|bad","narrative_fit_score":<0-10>,"pitch_angles":["<angle>"],"investor_thesis":"<2-3 sentences ready to paste>","one_liner":"<10 words or less>","strengthen":["<specific improvement>"],"avoid":["<what not to say>"],"best_investor_type":"<specific profile>"}`,
    maxTokens: 1000,
  });

  const result = extractJsonObject(resultRaw ?? "");
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({
    tool: "pitch-intelligence",
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
