// x402/launch-advisor/index.ts
// Token Launch Advisor - $3.00 USDC per plan
// Powered by Blue Agent

import { callBankrLLM, extractJsonObject } from "@blue-agent/bankr";

async function callLLM(system: string, userContent: string): Promise<string> {
  return callBankrLLM({
    model: "claude-haiku-4-5",
    system,
    messages: [{ role: "user", content: userContent }],
    temperature: 0.7,
    maxTokens: 2000,
  });
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: {
      projectName?: string;
      description?: string;
      targetAudience?: string;
      tokenSupply?: string;
      teamSize?: string;
      budget?: string;
    } = {};
    try {
      const text = await req.text();
      if (text && text.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}

    const { projectName, description, targetAudience } = body;
    if (!projectName || !description) {
      return Response.json({ error: "Please provide projectName and description" }, { status: 400 });
    }

    console.log(`[LaunchAdvisor] Planning launch for: ${projectName}`);

    const systemPrompt = `You are a seasoned Web3 launch strategist for Base ecosystem projects.

CRITICAL: Return ONLY raw JSON. No markdown. No backticks. Start with { and end with }.

{
  "project": "string",
  "score": <0-100 viability>,
  "verdict": "Go | Go with Conditions | No Go",
  "supply": "suggested token supply",
  "distribution": { "community": "40%", "team": "20%", "liquidity": "30%", "treasury": "10%" },
  "timeline": [
    { "phase": "Week 1-2", "focus": "string", "tasks": ["task1", "task2"] },
    { "phase": "Week 3-4", "focus": "string", "tasks": ["task1", "task2"] }
  ],
  "channels": ["marketing channel1", "channel2"],
  "kpis": { "month1": "e.g. 500 holders, $50k volume", "month3": "e.g. 2k holders, $500k volume" },
  "risks": ["risk1", "risk2"],
  "edges": ["competitive advantage1", "advantage2"],
  "summary": "2-3 sentence overview"
}`;

    const userPrompt = `Create a full launch playbook for this Base project:

Project Name: ${projectName}
Description: ${description}
Target Audience: ${targetAudience || "Base builders and traders"}
Team Size: ${body.teamSize || "Not specified"}
Budget: ${body.budget || "Not specified"}
Token Supply: ${body.tokenSupply || "Not specified"}`;

    const llmResponse = await callLLM(systemPrompt, userPrompt);
    const result = extractJsonObject(llmResponse);

    return Response.json(result, { status: 200 });
  } catch (error) {
    console.error("[LaunchAdvisor] Error:", error);
    return Response.json({ error: "Failed to generate launch plan", message: (error as Error).message }, { status: 500 });
  }
}
