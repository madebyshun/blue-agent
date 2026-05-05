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

    const systemPrompt = `You are a seasoned Web3 launch strategist with 5+ years experience launching successful tokens on Base. You have helped projects raise $50M+ combined.

CRITICAL: Return ONLY raw JSON. No markdown. No backticks. No code blocks. Start with { and end with }.

Return ONLY a valid JSON object with this structure:

{
  "projectName": "string",
  "launchScore": number (0-100, viability score),
  "executiveSummary": "2-3 sentence overview",
  "tokenomics": {
    "suggestedSupply": "string",
    "distribution": {
      "community": "string (e.g. 40%)",
      "team": "string",
      "liquidity": "string",
      "treasury": "string",
      "marketing": "string"
    },
    "vestingSchedule": "string",
    "initialMarketCap": "string (suggested range)",
    "warnings": ["warning1", "warning2"]
  },
  "launchTimeline": [
    { "week": "Week 1-2", "phase": "string", "tasks": ["task1", "task2"] },
    { "week": "Week 3-4", "phase": "string", "tasks": ["task1", "task2"] },
    { "week": "Week 5-6", "phase": "string", "tasks": ["task1", "task2"] },
    { "week": "Week 7-8", "phase": "string", "tasks": ["task1", "task2"] }
  ],
  "marketingStrategy": {
    "channels": ["channel1", "channel2"],
    "keyMessages": ["message1", "message2"],
    "influencerTiers": "string",
    "communityBuilding": "string"
  },
  "redFlags": ["risk1", "risk2"],
  "competitiveEdge": ["advantage1", "advantage2"],
  "kpis": {
    "week4": { "holders": "string", "volume": "string", "community": "string" },
    "month3": { "holders": "string", "volume": "string", "community": "string" }
  },
  "recommendation": "string (go/no-go + reasoning)"
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
