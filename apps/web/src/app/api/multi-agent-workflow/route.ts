import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/multi-agent-workflow";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const goal = (body.goal as string) ?? "";
  const agents = (body.agents as string) ?? "";
  const constraints = (body.constraints as string) ?? "";

  if (!goal) {
    return NextResponse.json({ error: "goal is required (what should the multi-agent workflow accomplish?)" }, { status: 400 });
  }

  const researchRaw = await runAeonSkill("deep-research", `multi-agent workflow patterns: agent orchestration, task decomposition, handoff protocols, Base x402 payment between agents. Best patterns for: ${goal}`);

  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark analyst persona — systems thinking, workflow design.
Design optimal agent coordination strategy.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "complexity": "simple|moderate|complex",
  "recommended_pattern": "<orchestrator|pipeline|swarm|hybrid>",
  "bottleneck_risk": "high|medium|low",
  "cost_estimate": "<per workflow run in USD>",
  "analyst_verdict": "<1-2 sentences>"
}`,
    messages: [{ role: "user", content: `Goal: ${goal}\nAgents available: ${agents || "Blue Agent, Aeon, MiroShark"}\nConstraints: ${constraints || "none"}\nResearch: ${researchRaw ?? "multi-agent systems"}` }],
    temperature: 0.3,
    maxTokens: 500,
  });
  const analyst = extractJsonObject(msRaw) ?? {};

  const resultRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — multi-agent workflow architect for Base ecosystem.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "workflow_score": <0-100>,
  "pattern": "pipeline|orchestrator|swarm|hybrid",
  "agents": [{"name":"<agent>","role":"<orchestrator|worker|validator>","task":"<specific task>","output":"<what it produces>"}],
  "steps": [{"step":<number>,"agent":"<who>","action":"<what>","input":"<from where>","output":"<to where>"}],
  "handoff_protocol": "<how agents pass work>",
  "payment_flow": "<x402 payment routing between agents>",
  "failure_modes": ["<what can go wrong>"],
  "estimated_latency": "<total time to complete>",
  "estimated_cost": "<total USD per run>",
  "implementation_notes": ["<key implementation detail>"],
  "summary": "<2 sentences>"
}`,
    messages: [{ role: "user", content: `Goal: ${goal}\nAgents: ${agents || "Blue Agent, Aeon, MiroShark"}\nConstraints: ${constraints || "none"}\nResearch: ${researchRaw ?? "multi-agent"}\nAnalyst: ${JSON.stringify(analyst)}` }],
    temperature: 0.3,
    maxTokens: 1400,
  });

  const result = extractJsonObject(resultRaw);
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
  return proxyTool(req, ENDPOINT);
}
