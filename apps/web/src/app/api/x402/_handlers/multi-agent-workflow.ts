// x402/multi-agent-workflow/index.ts
// Multi-Agent Workflow Builder — Aeon deep-research + MiroShark analyst + Blue build
// Price: $0.50

type Msg = { role: string; content: string };
async function llm(system: string, user: string, temp = 0.4, tokens = 1000): Promise<string> {
  const r = await fetch("https://llm.bankr.bot/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.LLM_API_KEY ?? process.env.BANKR_API_KEY ?? "", "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-4-5", system, messages: [{ role: "user", content: user }] as Msg[], temperature: temp, max_tokens: tokens }),
  });
  if (!r.ok) throw new Error(`LLM ${r.status}: ${await r.text()}`);
  const d = await r.json() as { content?: { text: string }[] };
  return d.content?.[0]?.text ?? "";
}
function parseJson(t: string): Record<string, unknown> | null {
  let s = t.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const i = s.indexOf("{"), j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  try { return JSON.parse(s); } catch { try { return JSON.parse(s.replace(/[\x00-\x1F]/g, " ")); } catch { return null; } }
}
async function aeon(skill: string, focus = ""): Promise<string | null> {
  try {
    const r = await fetch(`https://raw.githubusercontent.com/aaronjmars/aeon/main/skills/${skill}/SKILL.md`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const p = await r.text();
    return await llm(`You are Aeon. Synthesize from training knowledge. Today: ${new Date().toISOString().split("T")[0]}.`,
      `Follow skill template. Be concrete.\n\nSkill:\n${p}${focus ? `\nFocus: ${focus}` : ""}\n\nReturn only skill output.`, 0.2, 1200);
  } catch { return null; }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { goal?: string; agents?: string; constraints?: string } = {};
    try { const t = await req.text(); if (t.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const goal = body.goal ?? url.searchParams.get("goal") ?? "";
    const agents = body.agents ?? url.searchParams.get("agents") ?? "";
    const constraints = body.constraints ?? url.searchParams.get("constraints") ?? "";
    if (!goal) return Response.json({ error: "goal is required (what should the multi-agent workflow accomplish?)" }, { status: 400 });

    const researchRaw = await aeon("deep-research", `multi-agent workflow patterns: agent orchestration, task decomposition, handoff protocols, Base x402 payment between agents. Best patterns for: ${goal}`);

    const msRaw = await llm(`You are MiroShark analyst persona — systems thinking, workflow design.
Design optimal agent coordination strategy.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "complexity": "simple|moderate|complex",
  "recommended_pattern": "<orchestrator|pipeline|swarm|hybrid>",
  "bottleneck_risk": "high|medium|low",
  "cost_estimate": "<per workflow run in USD>",
  "analyst_verdict": "<1-2 sentences>"
}`,
      `Goal: ${goal}\nAgents available: ${agents || "Blue Agent, Aeon, MiroShark"}\nConstraints: ${constraints || "none"}\nResearch: ${researchRaw ?? "multi-agent systems"}`, 0.3, 500);
    const analyst = parseJson(msRaw) ?? {};

    const resultRaw = await llm(`You are Blue Agent — multi-agent workflow architect for Base ecosystem.
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
      `Goal: ${goal}\nAgents: ${agents || "Blue Agent, Aeon, MiroShark"}\nConstraints: ${constraints || "none"}\nResearch: ${researchRaw ?? "multi-agent"}\nAnalyst: ${JSON.stringify(analyst)}`, 0.3, 1400);

    let result = parseJson(resultRaw);
    if (!result) result = { degraded: true, note: "Synthesis briefly unavailable - please retry." };

    return Response.json({ tool: "multi-agent-workflow", timestamp: new Date().toISOString(), goal, agents, analyst, ...result, disclaimer: "AI-generated workflow advisory — any cost, latency, and score figures are rough estimates, not measured benchmarks or a guarantee. Validate before relying on them." });
  } catch (e) {
    return Response.json({ error: "Multi-agent workflow failed", message: (e as Error).message }, { status: 500 });
  }
}
