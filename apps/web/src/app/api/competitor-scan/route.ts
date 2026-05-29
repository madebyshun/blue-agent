import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { extractJsonObject, runAeonSkill, runMiroSharkSkill, runBlueSkill } from "@/app/api/_lib/llm";

export const runtime = "nodejs";
export const maxDuration = 120;

const ENDPOINT = "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/competitor-scan";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const project = (body.project as string) ?? "";
  const competitors = (body.competitors as string[]) ?? [];
  const description = (body.description as string) ?? "";

  if (!project) {
    return NextResponse.json({ error: "project is required" }, { status: 400 });
  }

  const competitorList = competitors.length ? competitors.join(", ") : "top competitors in this space";

  // Step 1+2: Aeon parallel — project research + competitor research
  const [projectResearch, competitorResearch] = await Promise.all([
    runAeonSkill("deep-research", `${project}: ${description}. Focus on strengths, weaknesses, market position on Base.`),
    runAeonSkill("deep-research", `${competitorList} — competitive landscape analysis vs ${project}. Focus on differentiation, moats, weaknesses.`),
  ]);

  // Step 3: MiroShark analyst — competitive positioning
  const msRaw = await runMiroSharkSkill({
    scenario: `Analyze competitive positioning of ${project} vs ${competitorList}`,
    context: {
      project,
      description,
      project_research: projectResearch ?? project,
      competitor_research: competitorResearch ?? competitorList,
    },
    persona: "analyst — evaluates agent economics, token utility, market positioning",
    outputSchema: `{"competitive_advantage":"strong|moderate|weak","moat_score":<0-10>,"differentiation":["<point>"],"vulnerabilities":["<vulnerability>"],"analyst_verdict":"<1-2 sentences>"}`,
    maxTokens: 600,
  });
  const analystTake = extractJsonObject(msRaw ?? "") ?? { competitive_advantage: "moderate", moat_score: 5, differentiation: [], vulnerabilities: [], analyst_verdict: "Mixed competitive signals" };

  // Step 4: Blue Agent synthesis — competitive intelligence verdict
  const resultRaw = await runBlueSkill({
    task: "Provide competitive intelligence analysis for this Base project. CRITICAL: Return ONLY raw JSON. No markdown.",
    skillFiles: ["base-ecosystem.md", "token-launch-guide.md"],
    input: `Project: ${project}\nDescription: ${description}\nProject research: ${projectResearch ?? project}\nCompetitor research: ${competitorResearch ?? competitorList}\nAnalyst: ${JSON.stringify(analystTake)}`,
    outputSchema: `{"verdict":"STRONG|COMPETITIVE|WEAK","score":<0-100>,"project_strengths":["<strength>"],"project_weaknesses":["<weakness>"],"competitors":[{"name":"<name>","threat_level":"high|medium|low","key_advantage":"<1 sentence>","vulnerability":"<1 sentence>"}],"whitespace":["<market gap to exploit>"],"recommended_positioning":"<1-2 sentences>","win_condition":"<what it takes to win>"}`,
    maxTokens: 1200,
  });

  const result = extractJsonObject(resultRaw ?? "") ?? {
    verdict: "COMPETITIVE",
    score: 60,
    project_strengths: ["Base ecosystem focus", "AI-native approach"],
    project_weaknesses: ["Market validation still needed"],
    competitors: [],
    whitespace: ["Underserved niches in Base DeFi tooling"],
    recommended_positioning: "Double down on Base-native advantages and builder community.",
    win_condition: "Execution speed, developer trust, and network effects.",
  };

  return NextResponse.json({
    tool: "competitor-scan",
    timestamp: new Date().toISOString(),
    project,
    competitors_analyzed: competitorList,
    analyst: analystTake,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT, handleLocally);
}
