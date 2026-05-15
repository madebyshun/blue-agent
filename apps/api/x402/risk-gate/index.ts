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

// Returns: { verified: true/false, unknown: true if API key missing }
async function checkContractVerified(contractAddress: string): Promise<{ verified: boolean; unknown: boolean }> {
  const apiKey = process.env.BASESCAN_API_KEY;

  // No API key — can't verify, mark as unknown (don't assume unverified)
  if (!apiKey) return { verified: false, unknown: true };

  try {
    // Etherscan V2 API (supports Base via chainid=8453)
    const url = `https://api.etherscan.io/v2/api?chainid=8453&module=contract&action=getsourcecode&address=${contractAddress}&apikey=${apiKey}`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data = await res.json() as { status: string; result?: { ContractName?: string }[] };

    if (data.status === "1" && Array.isArray(data.result) && data.result[0]?.ContractName) {
      return { verified: true, unknown: false };
    }
    return { verified: false, unknown: false };
  } catch {
    return { verified: false, unknown: true };
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

    // Contract verification — only if address provided
    let contractStatus: { verified: boolean; unknown: boolean } | null = null;
    if (contractAddress && contractAddress.startsWith("0x") && contractAddress.length === 42) {
      contractStatus = await checkContractVerified(contractAddress);
    }

    const contractNote = contractStatus === null
      ? "No contract address provided"
      : contractStatus.unknown
        ? "Contract verification status unknown (no Basescan API key configured)"
        : contractStatus.verified
          ? "Contract is VERIFIED on Base (Basescan)"
          : "Contract is NOT verified on Base (Basescan)";

    const systemPrompt = `You are a risk management system for AI agents executing onchain transactions on Base.

Evaluate if an action is safe to execute. Use good judgement — not everything is high risk.

Guidelines:
- Well-known tokens and DEXs on Base are generally lower risk
- Small amounts (<$100) with legitimate actions can be APPROVED or WARN
- Large amounts (>$1000) require more caution
- Contract verification unknown (no API key) ≠ suspicious — treat as neutral
- Only BLOCK clear red flags: drain wallet, unlimited approvals, known scam patterns, very large amounts to unknown addresses

Risk decisions:
- APPROVE: low risk, routine action, well-known protocol
- WARN: proceed with caution, verify details first
- BLOCK: clear danger, do not proceed

CRITICAL: Return ONLY raw JSON. No markdown. No backticks. Start with { and end with }.

{
  "decision": "APPROVE" | "WARN" | "BLOCK",
  "riskScore": <0-100>,
  "riskLevel": "Low" | "Medium" | "High" | "Critical",
  "reasons": ["reason1", "reason2"],
  "recommendation": "<what to do>",
  "maxSafeAmount": "<suggested safe amount, e.g. $50 or unlimited>",
  "checks": {
    "contractVerified": <true | false | null>,
    "amountReasonable": <true | false>,
    "actionLegitimate": <true | false>,
    "addressSuspicious": <true | false>
  }
}`;

    const userPrompt = `Risk check:

Action: ${action}
Contract: ${contractAddress || "N/A"}
Amount: ${amount || "Not specified"}
Recipient: ${body.toAddress || "N/A"}
Agent ID: ${body.agentId || "not provided"}
Context: ${body.context || "none"}

Contract status: ${contractNote}`;

    const llmResponse = await callLLM(systemPrompt, userPrompt);
    const result = extractJsonObject(llmResponse) as {
      checks?: { contractVerified?: boolean | null };
    };

    // Inject actual verified status if we got it
    if (contractStatus && result.checks) {
      result.checks.contractVerified = contractStatus.unknown ? null : contractStatus.verified;
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
