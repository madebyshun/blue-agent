// x402/b20-check — detect B20 (compliance-aware ERC-20) patterns in a verified
// Base contract's source. Price: $0.20 — LLM analyses real Basescan source only.

import { getBasescanSource } from "@/lib/moralis";
import { callVeniceLLM } from "@/app/api/_lib/llm";

type BankrMessage = { role: string; content: string };

async function callBankrLLM(opts: {
  model?: string; system: string; messages: BankrMessage[];
  temperature?: number; maxTokens?: number;
}): Promise<string> {
  return callVeniceLLM({ system: opts.system, messages: opts.messages, temperature: opts.temperature, maxTokens: opts.maxTokens });
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  let raw = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s >= 0 && e > s) raw = raw.slice(s, e + 1);
  try { return JSON.parse(raw); } catch {}
  try { return JSON.parse(raw.replace(/[\x00-\x1F\x7F]/g, " ")); } catch {}
  return null;
}

const SYSTEM = `You are a Base chain analyst inspecting a Solidity contract source for "B20" patterns — a compliance-aware ERC-20 (ERC-20 plus on-chain compliance roles and transfer policies). Use ONLY the source provided. NEVER invent functions, roles, or token names not in the source. Return ONLY raw JSON starting with {. No markdown. If data unavailable, return field as null — never estimate.

B20 indicators to look for in the source:
- Compliance ROLES: e.g. COMPLIANCE_ROLE, ISSUER_ROLE, AGENT_ROLE, MINTER_ROLE, FREEZER_ROLE, UPGRADER_ROLE, AccessControl/Ownable role grants.
- Transfer POLICIES: allowlist/whitelist (isWhitelisted, kycVerified), blocklist/blacklist, transfer freezing (freeze/pause/forcedTransfer), identity registry (onchainID, claimTopics), region/lockup restrictions, canTransfer/_beforeTokenTransfer compliance hooks.
- Variant: "Asset" (security/RWA-style token with identity + transfer restrictions), "Stablecoin" (mint/burn + blacklist + pause, fiat-backed style), "Unknown" (compliance roles present but variant unclear), "Not B20" (plain ERC-20 with no compliance layer).

Return ONLY raw JSON:
{
  "is_b20": boolean,
  "b20_variant": "Asset" | "Stablecoin" | "Unknown" | "Not B20",
  "roles_detected": ["role name from source", "..."],
  "policies_detected": ["policy/restriction from source", "..."],
  "compliance_score": number (0-100, how complete the compliance layer is; null if cannot assess),
  "recommendation": "string (one-line assessment for an integrator)"
}`;

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { contract?: string } = {};
    try {
      const text = await req.text();
      if (text?.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}
    const url = new URL(req.url);
    if (!body.contract) {
      body.contract = url.searchParams.get("contract") || url.searchParams.get("address") || undefined;
    }

    const { contract } = body;
    if (!contract || !/^0x[a-fA-F0-9]{40}$/.test(contract)) {
      return Response.json({ error: "Provide a valid contract address (0x...)" }, { status: 400 });
    }

    console.log(`[B20Check] Inspecting: ${contract}`);

    const source = await getBasescanSource(contract).catch(() => null);
    const sourceCode = typeof source?.SourceCode === "string" ? source.SourceCode : "";
    const contractName = typeof source?.ContractName === "string" ? source.ContractName : null;
    const abi = typeof source?.ABI === "string" ? source.ABI : "";

    // No verified source → honest "Unknown", no LLM, no fabricated detection.
    if (!sourceCode || sourceCode.trim() === "" || abi === "Contract source code not verified") {
      return Response.json({
        tool: "b20-check",
        contract,
        is_b20: false,
        b20_variant: "Unknown",
        roles_detected: [],
        policies_detected: [],
        compliance_score: null,
        recommendation: "Contract source is not verified on Basescan, so B20 compliance patterns cannot be inspected. Re-run once the source is verified.",
        note: "Verified contract source unavailable.",
        timestamp: new Date().toISOString(),
      });
    }

    // Cap source size sent to the LLM to stay within token budget.
    const snippet = sourceCode.slice(0, 14000);

    const llmResponse = await callBankrLLM({
      system: SYSTEM,
      messages: [{ role: "user", content: `Contract: ${contract}${contractName ? `\nName: ${contractName}` : ""}\n\nVerified Solidity source (truncated if long):\n${snippet}` }],
      temperature: 0.2,
      maxTokens: 700,
    });

    const parsed = extractJsonObject(llmResponse);
    if (!parsed) {
      return Response.json({
        tool: "b20-check",
        contract,
        is_b20: false,
        b20_variant: "Unknown",
        roles_detected: [],
        policies_detected: [],
        compliance_score: null,
        recommendation: "Analysis synthesis briefly unavailable — source was read but not analysed. Please retry.",
        degraded: true,
        note: "Synthesis briefly unavailable - please retry.",
        timestamp: new Date().toISOString(),
      });
    }

    const variantRaw = String(parsed.b20_variant ?? "Unknown");
    const b20_variant = (["Asset", "Stablecoin", "Unknown", "Not B20"].includes(variantRaw)
      ? variantRaw
      : "Unknown") as "Asset" | "Stablecoin" | "Unknown" | "Not B20";

    let compliance_score: number | null = null;
    if (typeof parsed.compliance_score === "number" && Number.isFinite(parsed.compliance_score)) {
      compliance_score = Math.max(0, Math.min(100, Math.round(parsed.compliance_score)));
    }

    return Response.json({
      tool: "b20-check",
      contract,
      is_b20: parsed.is_b20 === true,
      b20_variant,
      roles_detected: Array.isArray(parsed.roles_detected) ? (parsed.roles_detected as unknown[]).map(String) : [],
      policies_detected: Array.isArray(parsed.policies_detected) ? (parsed.policies_detected as unknown[]).map(String) : [],
      compliance_score,
      recommendation: typeof parsed.recommendation === "string" ? parsed.recommendation : "",
      contract_name: contractName,
      data_source: "Basescan (verified source)",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[B20Check] Error:", error);
    return Response.json(
      { error: "B20 check failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
