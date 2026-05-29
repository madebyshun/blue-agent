import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { extractJsonObject, runAeonSkill, runMiroSharkSkill, runBlueSkill } from "@/app/api/_lib/llm";

export const runtime = "nodejs";
export const maxDuration = 120;

const ENDPOINT = "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/builder-deep-dd";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const target = (body.target as string) ?? "";
  const type = (body.type as string) ?? "project";
  const context = (body.context as string) ?? "";

  if (!target) {
    return NextResponse.json({ error: "target is required (builder handle, project name, or GitHub repo)" }, { status: 400 });
  }

  // Step 1+2: Aeon parallel — project research + team/background research
  const [projectResearch, backgroundResearch] = await Promise.all([
    runAeonSkill("deep-research", `${target}: ${context}. Comprehensive analysis — product, traction, market position, on-chain activity on Base, funding history, partnerships.`),
    runAeonSkill("deep-research", `${target} team/builder background: track record, previous projects, credibility signals, red flags, community standing in Base/crypto ecosystem.`),
  ]);

  // Step 3: MiroShark — analyst persona on investment/collaboration grade
  const msRaw = await runMiroSharkSkill({
    scenario: `Perform analyst-grade due diligence assessment on ${target} (${type})`,
    context: {
      target,
      type,
      context,
      project_research: projectResearch ?? target,
      background_research: backgroundResearch ?? target,
    },
    persona: "analyst — evaluates agent economics, token utility, market positioning",
    outputSchema: `{"grade":"A|B|C|D|F","conviction":"high|medium|low","bull_case":"<2 sentences>","bear_case":"<2 sentences>","key_risks":["<risk>"],"key_strengths":["<strength>"],"comparable":"<similar project or builder>","analyst_verdict":"<2-3 sentences>"}`,
    maxTokens: 800,
  });
  const analyst = extractJsonObject(msRaw ?? "") ?? {};

  // Step 4: Blue Agent synthesis — deep DD verdict
  const resultRaw = await runBlueSkill({
    task: "Produce a comprehensive deep due diligence report for Base builders and investors. CRITICAL: Return ONLY raw JSON. No markdown.",
    skillFiles: ["base-ecosystem.md", "token-launch-guide.md"],
    input: `Target: ${target}\nType: ${type}\nContext: ${context}\nProject research: ${projectResearch ?? target}\nBackground: ${backgroundResearch ?? target}\nAnalyst: ${JSON.stringify(analyst)}`,
    outputSchema: `{"dd_score":<0-100>,"verdict":"STRONG_BUY|BUY|WATCH|PASS|RED_FLAG","confidence":<0-100>,"summary":"<3-4 sentences comprehensive summary>","thesis":"<investment/collaboration thesis in 2 sentences>","strengths":["<strength>"],"risks":["<risk>"],"red_flags":["<red flag or 'none'>"],"due_diligence_checklist":[{"item":"<check>","status":"pass|fail|unknown","note":"<brief note>"}],"recommended_action":"<specific next step>","open_questions":["<question to answer before deciding>"]}`,
    maxTokens: 1500,
  });

  const result = extractJsonObject(resultRaw ?? "");
  if (!result) throw new Error("Failed to parse DD result");

  return NextResponse.json({
    tool: "builder-deep-dd",
    timestamp: new Date().toISOString(),
    target,
    type,
    analyst,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT, handleLocally);
}
