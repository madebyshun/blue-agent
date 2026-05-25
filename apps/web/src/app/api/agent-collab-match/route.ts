import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/agent-collab-match";

async function scoreAgent(handle: string): Promise<Record<string, unknown>> {
  const raw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent Agent Score system.
Dimensions(total 100): skillDepth(0-25), onchainActivity(0-25), reliability(0-20), interoperability(0-20), reputation(0-10).
CRITICAL: Return ONLY raw JSON.
Schema: {"handle":"<handle>","xp":<0-100>,"tier":"Bot|Specialist|Operator|Sovereign","dimensions":{"skillDepth":<0-25>,"onchainActivity":<0-25>,"reliability":<0-20>,"interoperability":<0-20>,"reputation":<0-10>},"specialty":"<main domain>","strengths":["<strength>"]}`,
    messages: [{ role: "user", content: `Score agent: ${handle}` }],
    temperature: 0.3,
    maxTokens: 500,
  });
  return extractJsonObject(raw) ?? { handle, xp: 30, tier: "Specialist", specialty: "unknown" };
}

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const agent_a = (body.agent_a as string) ?? "";
  const agent_b = (body.agent_b as string) ?? "";
  const collab_goal = (body.collab_goal as string) ?? "";

  if (!agent_a || !agent_b) {
    return NextResponse.json({ error: "agent_a and agent_b are required" }, { status: 400 });
  }

  const [scoreA, scoreB] = await Promise.all([scoreAgent(agent_a), scoreAgent(agent_b)]);

  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark analyst persona.
Analyze whether these two agents should collaborate.
CRITICAL: Return ONLY raw JSON.
Schema: {"compatibility_score":<0-10>,"complementary":["<where they complement>"],"conflicts":["<potential conflict>"],"collab_type":"integration|partnership|competition|neutral","analyst_verdict":"<1-2 sentences>"}`,
    messages: [{ role: "user", content: `Agent A: ${agent_a}\n${JSON.stringify(scoreA)}\n\nAgent B: ${agent_b}\n${JSON.stringify(scoreB)}\n\nGoal: ${collab_goal || "general collaboration"}` }],
    temperature: 0.3,
    maxTokens: 600,
  });
  const analyst = extractJsonObject(msRaw) ?? {};

  const resultRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — agent collaboration matching engine.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "match_score": <0-100>,
  "verdict": "STRONG_MATCH|GOOD_MATCH|NEUTRAL|POOR_MATCH",
  "synergies": ["<synergy>"],
  "risks": ["<risk>"],
  "collab_format": "<recommended format e.g. API integration, skill sharing, joint tool>",
  "integration_path": ["<step 1>","<step 2>","<step 3>"],
  "value_created": "<what users gain>",
  "first_action": "<most immediate thing to do>"
}`,
    messages: [{ role: "user", content: `Agent A (${agent_a}): ${JSON.stringify(scoreA)}\nAgent B (${agent_b}): ${JSON.stringify(scoreB)}\nGoal: ${collab_goal}\nAnalyst: ${JSON.stringify(analyst)}` }],
    temperature: 0.3,
    maxTokens: 800,
  });

  const result = extractJsonObject(resultRaw);
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({
    tool: "agent-collab-match",
    timestamp: new Date().toISOString(),
    agent_a,
    agent_b,
    collab_goal: collab_goal || null,
    score_a: scoreA,
    score_b: scoreB,
    analyst,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT);
}
