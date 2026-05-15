// x402/grant-evaluator/index.ts
// Base Grant Evaluator - $5.00 USDC per evaluation
// Powered by Blue Agent

import { callBankrLLM, extractJsonObject } from "@blue-agent/bankr";

async function callLLM(system: string, userContent: string): Promise<string> {
  return callBankrLLM({
    model: "claude-haiku-4-5",
    system,
    messages: [{ role: "user", content: userContent }],
    temperature: 0.4,
    maxTokens: 2000,
  });
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: {
      projectName?: string;
      description?: string;
      teamBackground?: string;
      requestedAmount?: string;
      milestones?: string;
      githubUrl?: string;
      websiteUrl?: string;
    } = {};
    try {
      const text = await req.text();
      if (text && text.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}

    const { projectName, description } = body;
    if (!projectName || !description) {
      return Response.json({ error: "Please provide projectName and description" }, { status: 400 });
    }

    console.log(`[GrantEvaluator] Evaluating: ${projectName}`);

    const systemPrompt = `You are a senior grants evaluator for Base ecosystem grants, using the same criteria as Base Grants and Coinbase Ventures.

CRITICAL: Return ONLY raw JSON. No markdown. No backticks. Start with { and end with }.

{
  "project": "string",
  "score": <0-100>,
  "verdict": "Fund | Fund with Conditions | Decline | Request More Info",
  "grant": "suggested size e.g. $10k-25k or Decline",
  "risk": "Low | Medium | High",
  "strengths": ["strength1", "strength2"],
  "concerns": ["concern1", "concern2"],
  "conditions": ["condition if applicable"],
  "questions": ["key question for team"],
  "summary": "2-3 sentence evaluation"
}`;

    const userPrompt = `Evaluate this Base ecosystem grant application:

Project Name: ${projectName}
Description: ${description}
Team Background: ${body.teamBackground || "Not provided"}
Requested Amount: ${body.requestedAmount || "Not specified"}
Milestones: ${body.milestones || "Not provided"}
GitHub: ${body.githubUrl || "Not provided"}
Website: ${body.websiteUrl || "Not provided"}`;

    const llmResponse = await callLLM(systemPrompt, userPrompt);
    const result = extractJsonObject(llmResponse);

    return Response.json(result, { status: 200 });
  } catch (error) {
    console.error("[GrantEvaluator] Error:", error);
    return Response.json({ error: "Failed to evaluate grant application", message: (error as Error).message }, { status: 500 });
  }
}
