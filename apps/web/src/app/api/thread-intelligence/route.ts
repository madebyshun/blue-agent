import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { extractJsonObject, runAeonSkill, runMiroSharkSkill, runBlueSkill } from "@/app/api/_lib/llm";

export const runtime = "nodejs";
export const maxDuration = 120;

const ENDPOINT = "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/thread-intelligence";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const topic = (body.topic as string) ?? "";
  const audience = (body.audience as string) ?? "Base builders and crypto traders";
  const goal = (body.goal as string) ?? "engagement";

  // Step 1+2: Aeon parallel — narrative tracker + token movers for CT context
  const [narrativeRaw, moversRaw] = await Promise.all([
    runAeonSkill("narrative-tracker", `what's resonating on CT right now: ${topic || "Base ecosystem, AI agents, DeFi"}. What angles get engagement? What's being discussed?`),
    runAeonSkill("token-movers", `trending topics and market narratives relevant to ${topic || "Base ecosystem"} for CT content`),
  ]);

  // Step 3: MiroShark — influencer persona on thread virality
  const msRaw = await runMiroSharkSkill({
    scenario: `Evaluate CT thread potential for topic: ${topic || "Base ecosystem"}`,
    context: {
      topic: topic || "Base ecosystem",
      audience,
      goal,
      narratives: narrativeRaw ?? "CT discourse",
      market_movers: moversRaw ?? "Base ecosystem",
    },
    persona: "influencer — CT engagement focused, viral mechanics, audience growth",
    outputSchema: `{"viral_potential":<0-10>,"best_angle":"<the hook that will work>","posting_time":"<when to post: e.g. 9am EST, market open>","format":"thread|single|poll|reply","influencer_take":"<1-2 sentences on what makes this land>"}`,
    maxTokens: 500,
  });
  const influencer = extractJsonObject(msRaw ?? "") ?? {};

  // Step 4: Blue Agent synthesis — thread intelligence and content strategy
  const resultRaw = await runBlueSkill({
    task: "Generate actionable CT thread strategy and content plan for Base builders. CRITICAL: Return ONLY raw JSON. No markdown.",
    skillFiles: ["base-ecosystem.md"],
    input: `Topic: ${topic || "Base"}\nAudience: ${audience}\nGoal: ${goal}\nNarratives: ${narrativeRaw ?? "CT"}\nMarket movers: ${moversRaw ?? "Base"}\nInfluencer: ${JSON.stringify(influencer)}`,
    outputSchema: `{"content_score":<0-100>,"recommended_angle":"<the winning take>","thread_outline":["<tweet 1>","<tweet 2>","<tweet 3>","<CTA>"],"hook_options":["<hook 1>","<hook 2>","<hook 3>"],"best_posting_window":"<time and day>","hashtags":["<tag>"],"avoid":["<what not to say>"],"engagement_prediction":"viral|high|medium|low","summary":"<1-2 sentences>"}`,
    maxTokens: 1000,
  });

  const result = extractJsonObject(resultRaw ?? "");
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({
    tool: "thread-intelligence",
    timestamp: new Date().toISOString(),
    topic,
    audience,
    goal,
    influencer,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT, handleLocally);
}
