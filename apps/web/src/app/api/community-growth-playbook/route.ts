import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { extractJsonObject, runAeonSkill, runMiroSharkSkill, runBlueSkill } from "@/app/api/_lib/llm";

export const runtime = "nodejs";
export const maxDuration = 120;

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/community-growth-playbook";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const project = (body.project as string) ?? "";
  const description = (body.description as string) ?? "";
  const current_size = (body.current_size as string) ?? "0";
  const goal = (body.goal as string) ?? "1000 members";

  if (!project) {
    return NextResponse.json({ error: "project is required" }, { status: 400 });
  }

  // Step 1+2: Aeon parallel — narrative tracker (community narratives) + deep research (growth tactics)
  const [narrativeRaw, growthResearchRaw] = await Promise.all([
    runAeonSkill("narrative-tracker", `community building strategies for ${project}: ${description}. What narratives attract communities in Base ecosystem? What makes people join and stay?`),
    runAeonSkill("deep-research", `Community growth playbooks for Base/crypto projects: Telegram, Discord, Twitter strategies. What works for growing from ${current_size} to ${goal}? Case studies from successful Base projects.`),
  ]);

  // Step 3: MiroShark — 4-persona consensus on what each persona needs to join and stay
  const msRaw = await runMiroSharkSkill({
    scenario: `Simulate what each persona type needs to join and stay in ${project} community`,
    context: {
      project,
      description,
      current_size,
      goal,
      narratives: narrativeRaw ?? "Base ecosystem",
      growth_research: growthResearchRaw ?? "Base ecosystem",
    },
    persona: "4-persona consensus — Analyst(1.8x), Influencer(2.8x), Retail(1.0x), Observer(0.5x)",
    outputSchema: `{"personas":{"analyst":{"join_reason":"<why>","retention":"<what keeps them>","weight":1.8},"influencer":{"join_reason":"<why>","retention":"<what keeps them>","weight":2.8},"retail":{"join_reason":"<why>","retention":"<what keeps them>","weight":1.0},"observer":{"join_reason":"<why>","retention":"<what keeps them>","weight":0.5}},"growth_lever":"<highest impact lever>","consensus_strategy":"<1-2 sentences>"}`,
    maxTokens: 700,
  });
  const consensus = extractJsonObject(msRaw ?? "") ?? {};

  // Step 4: Blue Agent synthesis — community growth playbook
  const resultRaw = await runBlueSkill({
    task: "Generate a complete community growth playbook with milestones and tactics for this Base project. CRITICAL: Return ONLY raw JSON. No markdown.",
    skillFiles: ["base-ecosystem.md"],
    input: `Project: ${project}\nDescription: ${description}\nCurrent: ${current_size}\nGoal: ${goal}\nNarratives: ${narrativeRaw ?? "Base"}\nGrowth research: ${growthResearchRaw ?? "Base"}\nConsensus: ${JSON.stringify(consensus)}`,
    outputSchema: `{"growth_score":<0-100>,"phase":"cold_start|early_growth|scaling|mature","channels":[{"channel":"<Telegram|Twitter|Discord|etc>","priority":"high|medium|low","tactic":"<specific tactic>"}],"content_pillars":["<content theme>"],"engagement_loops":["<mechanic to retain members>"],"milestones":[{"target":"<e.g. 100 members>","tactic":"<how to get there>","timeline":"<e.g. week 1-2>"}],"quick_wins":["<action to do this week>"],"avoid":["<common mistake>"],"summary":"<2 sentences>"}`,
    maxTokens: 1200,
  });

  const result = extractJsonObject(resultRaw ?? "");
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({
    tool: "community-growth-playbook",
    timestamp: new Date().toISOString(),
    project,
    current_size,
    goal,
    miroshark: consensus,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT, handleLocally);
}
