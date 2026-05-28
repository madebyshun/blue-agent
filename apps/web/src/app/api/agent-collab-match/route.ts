import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { extractJsonObject, runAeonSkill, runMiroSharkSkill, runBlueSkill } from "@/app/api/_lib/llm";

export const runtime = "nodejs";
export const maxDuration = 120;

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/agent-collab-match";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const agent_a = (body.agent_a as string) ?? "";
  const agent_b = (body.agent_b as string) ?? "";
  const collab_goal = (body.collab_goal as string) ?? "";

  if (!agent_a || !agent_b) {
    return NextResponse.json({ error: "agent_a and agent_b are required" }, { status: 400 });
  }

  // Step 1+2: Aeon parallel — research both agents
  const [researchA, researchB] = await Promise.all([
    runAeonSkill("deep-research", `AI agent ${agent_a}: capabilities, specialty, onchain activity on Base, strengths, interoperability, ecosystem standing.`),
    runAeonSkill("deep-research", `AI agent ${agent_b}: capabilities, specialty, onchain activity on Base, strengths, interoperability, ecosystem standing.`),
  ]);

  // Step 3: MiroShark — analyst persona on collaboration compatibility
  const msRaw = await runMiroSharkSkill({
    scenario: `Analyze whether AI agents ${agent_a} and ${agent_b} should collaborate — goal: ${collab_goal || "general collaboration"}`,
    context: {
      agent_a,
      agent_b,
      collab_goal: collab_goal || "general collaboration",
      agent_a_research: researchA ?? agent_a,
      agent_b_research: researchB ?? agent_b,
    },
    persona: "analyst — evaluates agent economics, token utility, market positioning",
    outputSchema: `{"compatibility_score":<0-10>,"complementary":["<where they complement>"],"conflicts":["<potential conflict>"],"collab_type":"integration|partnership|competition|neutral","analyst_verdict":"<1-2 sentences>"}`,
    maxTokens: 600,
  });
  const analyst = extractJsonObject(msRaw ?? "") ?? {};

  // Step 4: Blue Agent synthesis — collab match verdict
  const resultRaw = await runBlueSkill({
    task: "Determine collaboration match quality between two AI agents and produce actionable integration plan. CRITICAL: Return ONLY raw JSON. No markdown.",
    skillFiles: ["base-ecosystem.md"],
    input: `Agent A (${agent_a}): ${researchA ?? agent_a}\nAgent B (${agent_b}): ${researchB ?? agent_b}\nGoal: ${collab_goal || "general collaboration"}\nAnalyst: ${JSON.stringify(analyst)}`,
    outputSchema: `{"match_score":<0-100>,"verdict":"STRONG_MATCH|GOOD_MATCH|NEUTRAL|POOR_MATCH","synergies":["<synergy>"],"risks":["<risk>"],"collab_format":"<recommended format e.g. API integration, skill sharing, joint tool>","integration_path":["<step 1>","<step 2>","<step 3>"],"value_created":"<what users gain>","first_action":"<most immediate thing to do>"}`,
    maxTokens: 800,
  });

  const result = extractJsonObject(resultRaw ?? "");
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({
    tool: "agent-collab-match",
    timestamp: new Date().toISOString(),
    agent_a,
    agent_b,
    collab_goal: collab_goal || null,
    analyst,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT, handleLocally);
}
