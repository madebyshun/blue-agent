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

    const systemPrompt = `You are a senior grants evaluator for Base ecosystem grants. You assess projects using the same criteria as Base Grants, Coinbase Ventures, and top crypto foundations.

Evaluation criteria:
- Innovation (is this new or just another copy?)
- Base Alignment (does it benefit Base ecosystem specifically?)
- Technical Feasibility (can they actually build this?)
- Team Quality (do they have the skills?)
- Impact Potential (how many users/TVL could this bring to Base?)
- Milestone Clarity (are goals specific and measurable?)

CRITICAL: Return ONLY raw JSON. No markdown. No backticks. No code blocks. Start with { and end with }.

Return ONLY a valid JSON object:

{
  "projectName": "string",
  "overallScore": number (0-100),
  "recommendation": "Fund | Fund with Conditions | Decline | Request More Info",
  "suggestedGrantSize": "string (e.g. $10,000-25,000 or Decline)",
  "scores": {
    "innovation": number (0-20),
    "baseAlignment": number (0-20),
    "technicalFeasibility": number (0-20),
    "teamQuality": number (0-20),
    "impactPotential": number (0-20)
  },
  "strengths": ["strength1", "strength2", "strength3"],
  "concerns": ["concern1", "concern2"],
  "conditions": ["condition1 (if Fund with Conditions)", "condition2"],
  "questionsForTeam": ["question1", "question2", "question3"],
  "comparableProjects": ["similar funded project 1", "similar project 2"],
  "executiveSummary": "3-4 sentence professional evaluation summary",
  "milestoneAssessment": "string (are milestones realistic and measurable?)",
  "riskLevel": "Low | Medium | High | Very High"
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
