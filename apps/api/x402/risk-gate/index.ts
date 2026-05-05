// x402/risk-gate/index.ts
// Risk Gate for Agents - $0.05 USDC per check
// Powered by Blue Agent

import { callBankrLLM, extractJsonObject } from "@blue-agent/bankr";

async function callLLM(system: string, userContent: string): Promise<string> {
  return callBankrLLM({
    model: "claude-haiku-4-5",
    system,
    messages: [{ role: "user", content: userContent }],
    temperature: 0.2,
    maxTokens: 600,
  });
}

async function checkContractBasic(contractAddress: string): Promise<any> {
  try {
    const apiKey = process.env.BASESCAN_API_KEY || "";
    const url = `https://api.basescan.org/api?module=contract&action=getabi&address=${contractAddress}&apikey=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    return { verified: data.status === "1", hasAbi: data.result !== "Contract source code not verified" };
  } catch {
    return { verified: false, hasAbi: false };
  }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: {
      action?: string;
      contractAddress?: string;
      amount?: string;
      toAddress?: string;
      agentId?: string;
      context?: string;
    } = {};
    try {
      const text = await req.text();
      if (text && text.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}

    const { action, contractAddress, amount } = body;
    if (!action) {
      return Response.json({ error: "Please provide action to evaluate" }, { status: 400 });
    }

    console.log(`[RiskGate] Checking: ${action} | contract: ${contractAddress}`);

    let contractCheck = null;
    if (contractAddress && contractAddress.startsWith("0x")) {
      contractCheck = await checkContractBasic(contractAddress);
    }

    const systemPrompt = `You are a risk management system for AI agents executing onchain transactions on Base.

Your job: quickly assess if an action is safe to execute. Be conservative — when in doubt, block.

Red flags to always block:
- Unverified contracts for large amounts
- Unusual approval amounts (type(uint256).max)
- Sending to known scam patterns
- Amount exceeds reasonable limits (>$1000 without explicit override)
- Actions that could drain wallet

CRITICAL: Return ONLY raw JSON. No markdown. No backticks. No code blocks. Start with { and end with }.

Return ONLY a valid JSON object:

{
  "decision": "APPROVE" | "BLOCK" | "WARN",
  "riskScore": number (0-100, higher = riskier),
  "riskLevel": "Low" | "Medium" | "High" | "Critical",
  "reasons": ["reason1", "reason2"],
  "recommendation": "string (what agent should do)",
  "maxSafeAmount": "string (suggested max for this action, e.g. $50)",
  "checks": {
    "contractVerified": boolean | null,
    "amountReasonable": boolean,
    "actionLegitimate": boolean,
    "addressSuspicious": boolean
  }
}`;

    const userPrompt = `Risk check request from agent:

Action: ${action}
Contract Address: ${contractAddress || "N/A"}
Amount: ${amount || "Not specified"}
Recipient: ${body.toAddress || "N/A"}
Agent ID: ${body.agentId || "unknown"}
Context: ${body.context || "None provided"}

Contract verification check: ${contractCheck ? JSON.stringify(contractCheck) : "Not checked"}`;

    const llmResponse = await callLLM(systemPrompt, userPrompt);
    const result = extractJsonObject(llmResponse);

    if (contractCheck && result.checks) {
      result.checks.contractVerified = contractCheck.verified;
    }

    return Response.json(result, { status: 200 });
  } catch (error) {
    console.error("[RiskGate] Error:", error);
    return Response.json(
      {
        decision: "BLOCK",
        riskScore: 100,
        riskLevel: "Critical",
        reasons: ["Risk evaluation failed — blocking by default for safety"],
        recommendation: "Do not proceed. Retry or contact support.",
        error: (error as Error).message,
      },
      { status: 200 }
    );
  }
}
