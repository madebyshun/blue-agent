// x402/token-launch/index.ts
// Token Launch Wizard - 1.00 USDC per launch plan
// Deploys fair-launch ERC-20 on Base via Bankr + Clanker

import { callBankrLLM, extractJsonObject } from "@blue-agent/bankr";

async function callLLM(system: string, userContent: string): Promise<string> {
  return callBankrLLM({
    model: "claude-haiku-4-5",
    system,
    messages: [{ role: "user", content: userContent }],
    temperature: 0.7,
    maxTokens: 1500,
  });
}

async function submitToBankrAgent(prompt: string): Promise<{ jobId: string } | null> {
  const apiKey = process.env.BANKR_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.bankr.bot/agent/prompt", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.jobId ? { jobId: data.jobId } : null;
  } catch {
    return null;
  }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: {
      tokenName?: string;
      tokenSymbol?: string;
      description?: string;
      imageUrl?: string;
      twitter?: string;
      website?: string;
    } = {};

    try {
      const text = await req.text();
      if (text && text.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}

    const { tokenName, tokenSymbol, description } = body;
    if (!tokenName || !tokenSymbol || !description) {
      return Response.json(
        { error: "Please provide tokenName, tokenSymbol, and description" },
        { status: 400 }
      );
    }

    const symbol = tokenSymbol.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    console.log(`[TokenLaunch] Planning launch for: ${tokenName} (${symbol})`);

    const systemPrompt = `You are a Base-native token launch strategist. Help founders launch fair-launch tokens via Clanker on Base.

CRITICAL: Return ONLY raw JSON. No markdown. No backticks. Start with { and end with }.

{
  "name": "string",
  "ticker": "string",
  "score": <0-100 launch readiness>,
  "verdict": "Launch Now | Polish First | Pivot",
  "tagline": "one punchy line",
  "supply": "e.g. 1,000,000,000",
  "fees": "1% per trade: 40% creator, 40% Bankr, 20% Clanker",
  "checklist": ["item1", "item2", "item3"],
  "tactics": ["growth tactic1", "tactic2"],
  "risks": ["risk1", "risk2"],
  "summary": "2-3 sentence overview",
  "bankrPrompt": "exact prompt to paste into Bankr to launch this token"
}`;

    const userPrompt = `Generate a launch plan for this Base token:

Name: ${tokenName}
Symbol: ${symbol}
Description: ${description}
${body.twitter ? `Twitter: @${body.twitter.replace("@", "")}` : ""}
${body.website ? `Website: ${body.website}` : ""}
${body.imageUrl ? `Image: ${body.imageUrl}` : ""}

The bankrPrompt field must be the exact natural language prompt someone would paste into Bankr to launch this token. Example format: "Launch a token called [name] ([SYMBOL]) on Base. [Description]. [Optional: Website: url. Twitter: @handle.]"`;

    const llmResponse = await callLLM(systemPrompt, userPrompt);
    const result = extractJsonObject(llmResponse);

    // Attempt live submission to Bankr Agent API if key is available
    let bankrJob: { jobId: string } | null = null;
    if (result.bankrPrompt) {
      bankrJob = await submitToBankrAgent(result.bankrPrompt);
    }

    return Response.json(
      {
        ...result,
        bankrJob: bankrJob
          ? { jobId: bankrJob.jobId, status: "submitted", pollUrl: `https://api.bankr.bot/agent/job/${bankrJob.jobId}` }
          : null,
        meta: {
          chain: "base",
          protocol: "clanker",
          feeRecipient: "your connected wallet",
          docsUrl: "https://docs.bankr.bot",
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[TokenLaunch] Error:", error);
    return Response.json(
      { error: "Failed to generate token launch plan", message: (error as Error).message },
      { status: 500 }
    );
  }
}
