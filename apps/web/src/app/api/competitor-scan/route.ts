import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/competitor-scan";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const project = (body.project as string) ?? "";
  const competitors = (body.competitors as string[]) ?? [];
  const description = (body.description as string) ?? "";

  if (!project) {
    return NextResponse.json({ error: "project is required" }, { status: 400 });
  }

  const competitorList = competitors.length ? competitors.join(", ") : "top competitors in this space";

  // Research project + competitors in parallel
  const [projectResearch, competitorResearch] = await Promise.all([
    runAeonSkill("deep-research", `${project}: ${description}. Focus on strengths, weaknesses, market position on Base.`),
    runAeonSkill("deep-research", `${competitorList} — competitive landscape analysis vs ${project}. Focus on differentiation, moats, weaknesses.`),
  ]);

  // MiroShark analyst persona
  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark analyst persona — data-driven, fundamentals-focused, skeptical.
Analyze competitive positioning.
CRITICAL: Return ONLY raw JSON.
Schema: {"competitive_advantage":"strong|moderate|weak","moat_score":<0-10>,"differentiation":["<point>"],"vulnerabilities":["<vulnerability>"],"analyst_verdict":"<1-2 sentences>"}`,
    messages: [{ role: "user", content: `Project: ${project}\n${description}\n\nProject research:\n${projectResearch ?? project}\n\nCompetitor research:\n${competitorResearch ?? competitorList}` }],
    temperature: 0.3,
    maxTokens: 600,
  });
  const analystTake = extractJsonObject(msRaw) ?? { competitive_advantage: "moderate", moat_score: 5, differentiation: [], vulnerabilities: [], analyst_verdict: "Mixed competitive signals" };

  // Blue Agent synthesis
  const resultRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — competitive intelligence engine for Base builders.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "verdict": "STRONG|COMPETITIVE|WEAK",
  "score": <0-100>,
  "project_strengths": ["<strength>"],
  "project_weaknesses": ["<weakness>"],
  "competitors": [{"name":"<name>","threat_level":"high|medium|low","key_advantage":"<1 sentence>","vulnerability":"<1 sentence>"}],
  "whitespace": ["<market gap to exploit>"],
  "recommended_positioning": "<1-2 sentences>",
  "win_condition": "<what it takes to win>"
}`,
    messages: [{ role: "user", content: `Project: ${project}\nDescription: ${description}\n\nProject research:\n${projectResearch ?? project}\n\nCompetitor research:\n${competitorResearch ?? competitorList}\n\nAnalyst: ${JSON.stringify(analystTake)}` }],
    temperature: 0.3,
    maxTokens: 1200,
  });

  const result = extractJsonObject(resultRaw);
  if (!result) throw new Error("Failed to parse result");

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
  const cloned = req.clone();
  const bankrRes = await proxyTool(req, ENDPOINT);

  if (bankrRes.status < 500) return bankrRes; // 2xx success, 402 payment, 4xx errors pass through

  console.log("[competitor-scan] Bankr 502 → falling back to local handler");
  try {
    let body: Record<string, unknown> = {};
    try { body = await cloned.json(); } catch {}
    return await handleLocally(body);
  } catch (error) {
    console.error("[competitor-scan] Local handler failed:", error);
    return NextResponse.json(
      { error: "Competitor scan failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
