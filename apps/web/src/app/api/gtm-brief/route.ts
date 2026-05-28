import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { extractJsonObject, runAeonSkill, runMiroSharkSkill, runBlueSkill } from "@/app/api/_lib/llm";

export const runtime = "nodejs";
export const maxDuration = 120;

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/gtm-brief";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const project = (body.project as string) ?? (body.product as string) ?? "";
  const description = (body.description as string) ?? (body.product as string) ?? "";
  const target = (body.target as string) ?? "";

  if (!project || !description) {
    return NextResponse.json({ error: "product description is required" }, { status: 400 });
  }

  // Step 1+2: Aeon parallel — narrative tracker + deep research on GTM channels
  const [narrativeRaw, channelResearchRaw] = await Promise.all([
    runAeonSkill("narrative-tracker", `GTM narrative for ${project}: ${description}`),
    runAeonSkill("deep-research", `GTM playbooks for Base/crypto products like ${project}: ${description}. What distribution channels work? What community strategies land? Target: ${target || "Base builders and crypto users"}.`),
  ]);

  // Step 3: MiroShark — influencer + retail persona on distribution fit
  const msRaw = await runMiroSharkSkill({
    scenario: `Evaluate GTM strategy from distribution and community perspective for ${project}`,
    context: {
      project,
      description,
      target: target || "Base builders and crypto users",
      narratives: narrativeRaw ?? "Base ecosystem",
      channel_research: channelResearchRaw ?? "Base ecosystem",
    },
    persona: "influencer — CT engagement focused, viral mechanics, audience growth",
    outputSchema: `{"viral_potential":<0-10>,"distribution_fit":"strong|moderate|weak","best_channel":"<channel>","community_hooks":["<hook>"],"retail_pull":"<1 sentence>","influencer_appeal":"<1 sentence>","gtm_verdict":"<1 sentence>"}`,
    maxTokens: 600,
  });
  const distribution = extractJsonObject(msRaw ?? "") ?? {};

  // Step 4: Blue Agent synthesis — GTM brief
  const resultRaw = await runBlueSkill({
    task: "Generate a complete GTM brief for this Base project with actionable launch strategy. CRITICAL: Return ONLY raw JSON. No markdown.",
    skillFiles: ["base-ecosystem.md", "token-launch-guide.md"],
    input: `Project: ${project}\nDescription: ${description}\nTarget: ${target || "Base builders and crypto users"}\nNarratives: ${narrativeRaw ?? "Base"}\nChannel research: ${channelResearchRaw ?? "Base"}\nDistribution: ${JSON.stringify(distribution)}`,
    outputSchema: `{"gtm_score":<0-100>,"positioning":"<10 words max tagline>","target_segment":"<specific user>","launch_channel":"<primary>","distribution_playbook":["<step 1>","<step 2>","<step 3>"],"narrative_angle":"<which narrative to ride>","week_1_actions":["<action>"],"success_metric":"<what does good look like at 30 days>","community_strategy":"<1-2 sentences>","avoid":["<common GTM mistake>"]}`,
    maxTokens: 1000,
  });

  const result = extractJsonObject(resultRaw ?? "");
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({
    tool: "gtm-brief",
    timestamp: new Date().toISOString(),
    project,
    distribution,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT, handleLocally);
}
