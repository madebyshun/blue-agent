import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/stack-recommender";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const project = (body.project as string) ?? "";
  const description = (body.description as string) ?? "";
  const team_size = (body.team_size as number) ?? 1;
  const timeline = (body.timeline as string) ?? "3 months";

  if (!project || !description) {
    return NextResponse.json({ error: "project and description are required" }, { status: 400 });
  }

  const [ecosystemRaw, buildRaw] = await Promise.all([
    runAeonSkill("deep-research", `Best tech stack for building ${description} on Base in 2025. Focus on what successful Base projects use.`),
    callBankrLLM({
      model: "claude-haiku-4-5",
      system: `You are Blue Agent running 'blue build'. Recommend stack for Base builders.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "recommended_stack": {
    "frontend": "<framework>",
    "backend": "<language/framework>",
    "smart_contracts": "<language>",
    "database": "<db>",
    "payments": "<x402/USDC approach>",
    "deployment": "<platform>"
  },
  "reasoning": "<2 sentences>",
  "alternatives": [{"layer":"<layer>","option":"<alt>","tradeoff":"<1 sentence>"}]
}`,
      messages: [{ role: "user", content: `Project: ${project}\nDescription: ${description}\nTeam size: ${team_size}\nTimeline: ${timeline}` }],
      temperature: 0.3,
      maxTokens: 800,
    }),
  ]);

  const buildRecommendation = extractJsonObject(buildRaw) ?? {};

  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark analyst persona — data-driven, technical, skeptical.
Review this stack recommendation for a Base project.
CRITICAL: Return ONLY raw JSON.
Schema: {"confidence":<0-10>,"risks":["<tech risk>"],"ecosystem_fit":"strong|moderate|weak","battle_tested":<boolean>,"analyst_note":"<1-2 sentences>"}`,
    messages: [{ role: "user", content: `Project: ${project}\nStack: ${JSON.stringify(buildRecommendation)}\nEcosystem context: ${ecosystemRaw ?? "Base ecosystem"}` }],
    temperature: 0.3,
    maxTokens: 500,
  });
  const analystTake = extractJsonObject(msRaw) ?? {};

  const resultRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — stack recommendation engine for Base builders.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "confidence_score": <0-100>,
  "stack": <copy recommended_stack>,
  "why_this_stack": ["<reason>"],
  "time_to_mvp": "<estimate>",
  "hiring_complexity": "easy|medium|hard",
  "base_specific_tools": ["<tool> — <why>"],
  "week_1_setup": ["<setup step>"],
  "avoid": ["<antipattern>"]
}`,
    messages: [{ role: "user", content: `Project: ${project}\nBuild: ${JSON.stringify(buildRecommendation)}\nEcosystem: ${ecosystemRaw ?? "Base"}\nAnalyst: ${JSON.stringify(analystTake)}` }],
    temperature: 0.3,
    maxTokens: 900,
  });

  const result = extractJsonObject(resultRaw);
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
  return proxyTool(req, ENDPOINT);
}
