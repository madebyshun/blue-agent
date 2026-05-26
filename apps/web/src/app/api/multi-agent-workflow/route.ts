import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { extractJsonObject, runAeonSkill, runMiroSharkSkill, runBlueSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/multi-agent-workflow";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const goal = (body.goal as string) ?? "";
  const agents = (body.agents as string) ?? "";
  const constraints = (body.constraints as string) ?? "";

  if (!goal) {
    return NextResponse.json({ error: "goal is required (what should the multi-agent workflow accomplish?)" }, { status: 400 });
  }

  // Step 1+2: Aeon parallel — workflow patterns research + agent capability research
  const [workflowResearchRaw, agentResearchRaw] = await Promise.all([
    runAeonSkill("deep-research", `multi-agent workflow patterns: agent orchestration, task decomposition, handoff protocols, Base x402 payment between agents. Best patterns for: ${goal}`),
    runAeonSkill("deep-research", `AI agent capabilities and integration patterns: ${agents || "Blue Agent, Aeon, MiroShark"}. How do these agents work together? What are their APIs and specialties?`),
  ]);

  // Step 3: MiroShark — analyst persona on workflow design and complexity
  const msRaw = await runMiroSharkSkill({
    scenario: `Design optimal agent coordination strategy for: ${goal}`,
    context: {
      goal,
      agents: agents || "Blue Agent, Aeon, MiroShark",
      constraints: constraints || "none",
      workflow_research: workflowResearchRaw ?? "multi-agent systems",
      agent_research: agentResearchRaw ?? "Base agents",
    },
    persona: "analyst — evaluates agent economics, token utility, market positioning",
    outputSchema: `{"complexity":"simple|moderate|complex","recommended_pattern":"orchestrator|pipeline|swarm|hybrid","bottleneck_risk":"high|medium|low","cost_estimate":"<per workflow run in USD>","analyst_verdict":"<1-2 sentences>"}`,
    maxTokens: 500,
  });
  const analyst = extractJsonObject(msRaw ?? "") ?? {};

  // Step 4: Blue Agent synthesis — multi-agent workflow design
  const resultRaw = await runBlueSkill({
    task: "Architect a complete multi-agent workflow for Base ecosystem with step-by-step implementation. CRITICAL: Return ONLY raw JSON. No markdown.",
    skillFiles: ["base-ecosystem.md"],
    input: `Goal: ${goal}\nAgents: ${agents || "Blue Agent, Aeon, MiroShark"}\nConstraints: ${constraints || "none"}\nWorkflow research: ${workflowResearchRaw ?? "multi-agent"}\nAgent research: ${agentResearchRaw ?? "Base agents"}\nAnalyst: ${JSON.stringify(analyst)}`,
    outputSchema: `{"workflow_score":<0-100>,"pattern":"pipeline|orchestrator|swarm|hybrid","agents":[{"name":"<agent>","role":"orchestrator|worker|validator","task":"<specific task>","output":"<what it produces>"}],"steps":[{"step":<number>,"agent":"<who>","action":"<what>","input":"<from where>","output":"<to where>"}],"handoff_protocol":"<how agents pass work>","payment_flow":"<x402 payment routing between agents>","failure_modes":["<what can go wrong>"],"estimated_latency":"<total time to complete>","estimated_cost":"<total USD per run>","implementation_notes":["<key implementation detail>"],"summary":"<2 sentences>"}`,
    maxTokens: 1400,
  });

  const result = extractJsonObject(resultRaw ?? "");
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({
    tool: "multi-agent-workflow",
    timestamp: new Date().toISOString(),
    goal,
    agents,
    analyst,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT, handleLocally);
}
