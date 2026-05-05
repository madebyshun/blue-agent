// x402/deep-analysis/index.ts
// Deep Project Due Diligence - 0.35 USDC per analysis
// Powered by Blue Agent

import { callBankrLLM, extractJsonObject } from "@blue-agent/bankr";

async function callLLM(options: {
  model: string;
  system: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  return callBankrLLM({
    model: options.model,
    system: options.system,
    messages: options.messages,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
  });
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { contractAddress?: string; projectName?: string; ticker?: string } = {};

    try {
      const text = await req.text();
      if (text && text.trim().startsWith("{")) {
        body = JSON.parse(text);
      }
    } catch {
      // ignore
    }

    const url = new URL(req.url);
    if (!body.contractAddress && !body.projectName) {
      body.contractAddress = url.searchParams.get("contractAddress") || undefined;
      body.projectName = url.searchParams.get("projectName") || undefined;
      body.ticker = url.searchParams.get("ticker") || undefined;
    }

    const { contractAddress, projectName, ticker } = body;

    if (!contractAddress && !projectName) {
      return Response.json({ error: "Please provide either contractAddress or projectName" }, { status: 400 });
    }

    const input = contractAddress ? contractAddress : `${projectName}${ticker ? ` (${ticker})` : ""}`;

    console.log(`[BlueAgent DeepAnalysis] Analyzing: ${input}`);

    const systemPrompt = `You are a senior crypto due diligence analyst on Base chain, powered by Blue Agent.

CRITICAL: Return ONLY raw JSON. No markdown. No backticks. No code blocks. Start with { and end with }.

Return ONLY a valid JSON object with this exact structure. No extra text:

{
  "projectName": "string",
  "ticker": "string or null",
  "contractAddress": "string or null",
  "riskScore": number (0-100, higher = riskier),
  "overallScore": number (0-100),
  "rugProbability": number (0-100),
  "categories": {
    "Tokenomics": number (0-100),
    "Liquidity": number (0-100),
    "CodeQuality": number (0-100),
    "TeamActivity": number (0-100),
    "Community": number (0-100),
    "Transparency": number (0-100)
  },
  "keyRisks": ["short risk point 1", "short risk point 2"],
  "keyStrengths": ["short strength point 1", "short strength point 2"],
  "summary": "Professional 3-4 sentence summary",
  "recommendation": "Strong Buy | Buy | Caution | Avoid | High Risk",
  "suggestedActions": ["actionable recommendation 1", "actionable recommendation 2"]
}`;

    const llmResponse = await callLLM({
      model: "claude-haiku-4-5",
      system: systemPrompt,
      messages: [{ role: "user", content: `Perform a deep due diligence analysis on: ${input}` }],
      temperature: 0.65,
      maxTokens: 800,
    });

    const result = extractJsonObject(llmResponse);
    return Response.json(result, { status: 200 });
  } catch (error) {
    console.error("[BlueAgent DeepAnalysis] Error:", error);
    return Response.json({ error: "Failed to perform deep project analysis", message: (error as Error).message }, { status: 500 });
  }
}
