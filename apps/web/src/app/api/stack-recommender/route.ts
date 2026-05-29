import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { extractJsonObject, runAeonSkill, runMiroSharkSkill, runBlueSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/stack-recommender";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const project = (body.project as string) ?? "";
  const description = (body.description as string) ?? "";
  const team_size = (body.team_size as number) ?? 1;
  const timeline = (body.timeline as string) ?? "3 months";

  if (!project || !description) {
    return NextResponse.json({ error: "project and description are required" }, { status: 400 });
  }

  // Step 1+2: Aeon parallel — ecosystem research + deep research on tech stack patterns
  const [ecosystemRaw, stackResearchRaw] = await Promise.all([
    runAeonSkill("deep-research", `Best tech stack for building ${description} on Base in 2025. Focus on what successful Base projects use.`),
    runAeonSkill("deep-research", `Tech stack tradeoffs for ${description}: Next.js vs other frontends, Solidity vs Vyper, x402 payments, deployment on Vercel vs Railway. Team size: ${team_size}, timeline: ${timeline}.`),
  ]);

  // Step 3: MiroShark — analyst persona on stack risk and ecosystem fit
  const msRaw = await runMiroSharkSkill({
    scenario: `Review tech stack recommendation for ${project} — a ${description} built on Base`,
    context: {
      project,
      description,
      team_size,
      timeline,
      ecosystem_context: ecosystemRaw ?? "Base ecosystem",
      stack_research: stackResearchRaw ?? "Base ecosystem",
    },
    persona: "analyst — evaluates agent economics, token utility, market positioning",
    outputSchema: `{"confidence":<0-10>,"risks":["<tech risk>"],"ecosystem_fit":"strong|moderate|weak","battle_tested":<boolean>,"analyst_note":"<1-2 sentences>"}`,
    maxTokens: 500,
  });
  const analystTake = extractJsonObject(msRaw ?? "") ?? {};

  // Step 4: Blue Agent synthesis — stack recommendation
  const resultRaw = await runBlueSkill({
    task: "Recommend the optimal tech stack for this Base project. CRITICAL: Return ONLY raw JSON. No markdown.",
    skillFiles: ["base-ecosystem.md", "token-launch-guide.md"],
    input: `Project: ${project}\nDescription: ${description}\nTeam size: ${team_size}\nTimeline: ${timeline}\nEcosystem research: ${ecosystemRaw ?? "Base"}\nStack research: ${stackResearchRaw ?? "Base"}\nAnalyst: ${JSON.stringify(analystTake)}`,
    outputSchema: `{"confidence_score":<0-100>,"stack":{"frontend":"<framework>","backend":"<language/framework>","smart_contracts":"<language>","database":"<db>","payments":"<x402/USDC approach>","deployment":"<platform>"},"why_this_stack":["<reason>"],"time_to_mvp":"<estimate>","hiring_complexity":"easy|medium|hard","base_specific_tools":["<tool> — <why>"],"week_1_setup":["<setup step>"],"avoid":["<antipattern>"]}`,
    maxTokens: 900,
  });

  const result = extractJsonObject(resultRaw ?? "");
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({
    tool: "stack-recommender",
    timestamp: new Date().toISOString(),
    project,
    team_size,
    timeline,
    analyst: analystTake,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT, handleLocally);
}
