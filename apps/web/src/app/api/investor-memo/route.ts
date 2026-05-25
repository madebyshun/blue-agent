import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/investor-memo";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const project = (body.project as string) ?? "";
  const description = (body.description as string) ?? "";
  const ask = (body.ask as string) ?? "";
  const stage = (body.stage as string) ?? "pre-seed";
  const traction = (body.traction as string) ?? "";

  if (!project || !description) {
    return NextResponse.json({ error: "project and description are required" }, { status: 400 });
  }

  const [marketResearch, raiseRaw] = await Promise.all([
    runAeonSkill("deep-research", `Market size and opportunity for ${description} on Base. Comparable projects, TAM, key risks.`),
    callBankrLLM({
      model: "claude-haiku-4-5",
      system: `You are Blue Agent running 'blue raise'. Write investor narrative sections.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "executive_summary": "<3 sentences>",
  "market_framing": "<2 sentences>",
  "why_this_wins": "<2 sentences>",
  "why_base": "<1 sentence>",
  "business_model": "<1-2 sentences>",
  "ask_framing": "<1 sentence>",
  "use_of_funds": ["<allocation>"]
}`,
      messages: [{ role: "user", content: `Project: ${project}\nDescription: ${description}\nAsk: ${ask}\nStage: ${stage}\nTraction: ${traction || "pre-traction"}` }],
      temperature: 0.4,
      maxTokens: 800,
    }),
  ]);

  const narrative = extractJsonObject(raiseRaw) ?? {};

  const [analystRaw, influencerRaw] = await Promise.all([
    callBankrLLM({
      model: "claude-haiku-4-5",
      system: `You are MiroShark analyst persona. Evaluate investment thesis critically.
CRITICAL: Return ONLY raw JSON.
Schema: {"investment_grade":"A|B|C|D","key_risks":["<risk>"],"key_strengths":["<strength>"],"comparable":"<similar funded project>","analyst_verdict":"<1-2 sentences>"}`,
      messages: [{ role: "user", content: `Project: ${project}\nDescription: ${description}\nMarket: ${marketResearch ?? "Base ecosystem"}\nNarrative: ${JSON.stringify(narrative)}` }],
      temperature: 0.3,
      maxTokens: 600,
    }),
    callBankrLLM({
      model: "claude-haiku-4-5",
      system: `You are MiroShark influencer persona. Would this get crypto Twitter excited?
CRITICAL: Return ONLY raw JSON.
Schema: {"hype_potential":<0-10>,"viral_angle":"<best angle>","community_thesis":"<1 sentence>","influencer_verdict":"<1 sentence>"}`,
      messages: [{ role: "user", content: `Project: ${project}\nDescription: ${description}` }],
      temperature: 0.5,
      maxTokens: 400,
    }),
  ]);

  const analyst = extractJsonObject(analystRaw) ?? {};
  const influencer = extractJsonObject(influencerRaw) ?? {};

  const resultRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — investor memo engine.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "memo_score": <0-100>,
  "one_pager": {
    "headline": "<10 words>",
    "problem": "<1 sentence>",
    "solution": "<1 sentence>",
    "market": "<TAM estimate>",
    "traction": "<or pre-traction>",
    "ask": "<amount + stage>",
    "why_now": "<1 sentence>"
  },
  "investor_fit": ["<type of investor who'd say yes>"],
  "red_flags_to_address": ["<flag>"],
  "strongest_angle": "<1 sentence>",
  "cold_outreach_subject": "<email subject line>"
}`,
    messages: [{ role: "user", content: `Project: ${project}\nNarrative: ${JSON.stringify(narrative)}\nMarket: ${marketResearch ?? "Base"}\nAnalyst: ${JSON.stringify(analyst)}\nInfluencer: ${JSON.stringify(influencer)}` }],
    temperature: 0.3,
    maxTokens: 1000,
  });

  const result = extractJsonObject(resultRaw);
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({
    tool: "investor-memo",
    timestamp: new Date().toISOString(),
    project,
    stage,
    narrative,
    analyst,
    influencer,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  const cloned = req.clone();
  const bankrRes = await proxyTool(req, ENDPOINT);

  if (bankrRes.status < 500) return bankrRes; // 2xx success, 402 payment, 4xx errors pass through

  console.log("[investor-memo] Bankr 502 → falling back to local handler");
  try {
    let body: Record<string, unknown> = {};
    try { body = await cloned.json(); } catch {}
    return await handleLocally(body);
  } catch (error) {
    console.error("[investor-memo] Local handler failed:", error);
    return NextResponse.json(
      { error: "Investor memo failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
