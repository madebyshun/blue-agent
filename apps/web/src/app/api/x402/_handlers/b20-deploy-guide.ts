// x402/b20-deploy-guide — Step-by-step B20 token deployment guide.
// Covers: variant selection, role setup, PolicyRegistry config, code snippets.
// Price: $0.10 — LLM advisory using authoritative B20 docs knowledge.

import { callBankrLLM, extractJsonObject } from "@/app/api/_lib/llm";

const BERYL_LAUNCH = "2026-06-25";

const DEPLOY_KNOWLEDGE = `
B20 DEPLOYMENT REFERENCE (Base Beryl upgrade, ${BERYL_LAUNCH}):

STEP 1 — CHOOSE VARIANT:
- Asset: RWA, security tokens, tokenized real-world assets. Requires PolicyRegistry.
- Stablecoin: Fiat-backed tokens, payment tokens, wrapped stablecoins. Simpler compliance.
Decision tree: Does your token need transfer allowlists or identity verification? → Asset. Need mint/burn + global pause? → Stablecoin.

STEP 2 — DEPLOY VIA B20FACTORY:
Precompile address: determined by Beryl upgrade spec (not a deployed contract).
Function: B20Factory.deploy(name, symbol, decimals, variant, initialAdmin)
- variant: 0 = Asset, 1 = Stablecoin
- initialAdmin: address that receives ADMIN role — use a multisig (e.g. Safe)
Returns: tokenAddress (the new B20 precompile instance address)

STEP 3 — ASSIGN ROLES (all via grantRole):
ADMIN_ROLE = keccak256("ADMIN_ROLE")
MINT_ROLE = keccak256("MINT_ROLE")
BURN_ROLE = keccak256("BURN_ROLE")
BURN_BLOCKED_ROLE = keccak256("BURN_BLOCKED_ROLE")
PAUSE_ROLE = keccak256("PAUSE_ROLE")
UNPAUSE_ROLE = keccak256("UNPAUSE_ROLE")
METADATA_ROLE = keccak256("METADATA_ROLE")

Security recommendations:
- ADMIN → 3-of-5 multisig minimum
- MINT → separate operational wallet or contract
- PAUSE → hot wallet for emergency response
- BURN_BLOCKED → compliance officer wallet

STEP 4 — ASSET ONLY: REGISTER POLICIES via PolicyRegistry:
PolicyRegistry.registerPolicy(tokenAddress, {
  type: "allowlist" | "blocklist" | "freeze_seize" | "supply_cap",
  config: { ... }
})
- allowlist: only pre-approved addresses can receive tokens
- blocklist: blocked addresses cannot send or receive
- freeze_seize: admin can freeze individual wallets
- supply_cap: hard cap on totalSupply enforced at precompile level

STEP 5 — MINT INITIAL SUPPLY (if needed):
token.mint(recipientAddress, amount)
Requires: caller has MINT_ROLE

STEP 6 — VERIFY DEPLOYMENT:
- Call token.name(), token.symbol(), token.decimals() — ERC-20 compat
- Call isB20(tokenAddress) → should return true
- Test transfer: simulate first with simulateContract, then execute

INTEGRATION CHECKLIST:
□ All role holders are multisigs or audited contracts (not EOAs for ADMIN/MINT)
□ Pause capability tested in staging
□ PolicyRegistry config reviewed by legal/compliance for RWA tokens
□ UI shows "B20 token" badge + simulateContract before every transfer
□ Indexed events: Transfer, RoleGranted, PolicyRegistered`;

const SYSTEM = `You are a Base chain deployment expert for B20 tokens (Base Native Token Standard). Provide precise, actionable deployment guidance. Return ONLY raw JSON starting with {. No markdown.

${DEPLOY_KNOWLEDGE}`;

type Step = "variant" | "factory" | "roles" | "policy" | "mint" | "verify" | "checklist" | "full";

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { step?: Step; variant?: "Asset" | "Stablecoin"; context?: string } = {};
    try {
      const text = await req.text();
      if (text?.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}
    const url = new URL(req.url);
    if (!body.step) body.step = (url.searchParams.get("step") as Step) ?? "full";
    if (!body.variant) body.variant = (url.searchParams.get("variant") as "Asset" | "Stablecoin") ?? undefined;
    if (!body.context) body.context = url.searchParams.get("context") ?? undefined;

    const step = body.step ?? "full";
    const variant = body.variant;

    const prompts: Record<Step, string> = {
      variant: `Help a builder choose between B20 Asset and Stablecoin variants. Ask 3 qualifying questions, then recommend a variant with reasoning. ${body.context ? `Context: ${body.context}` : "Assume general use case."}`,
      factory: `Provide exact B20Factory.deploy() call parameters and code snippet for deploying a ${variant ?? "B20"} token on Base. Include: parameter types, recommended decimals, multisig note for initialAdmin.`,
      roles: `List all 7 B20 RBAC roles for a ${variant ?? "B20"} token. For each: role name, role hash derivation, recommended holder (EOA/multisig/contract), and security note. Return as JSON array.`,
      policy: `Explain PolicyRegistry setup for a ${variant === "Stablecoin" ? "Stablecoin (note: no PolicyRegistry needed)" : "B20 Asset token"}. List each policy type, its use case, example config, and when NOT to use it.`,
      mint: `Explain B20 token minting: the mint() function, MINT_ROLE requirement, initial supply best practices, and how to handle airdrops safely with B20 compliance checks.`,
      verify: `Provide a complete B20 deployment verification checklist: function calls to run, expected return values, integration tests for ERC-20 compatibility, and how to verify policy enforcement.`,
      checklist: `Generate a launch-ready checklist for a ${variant ?? "B20"} token deployment. Cover: security, compliance, integration, monitoring, and post-launch ops. Format as actionable checklist items.`,
      full: `Provide a complete step-by-step B20 deployment guide for a ${variant ?? "token"} on Base. Cover all 6 steps: variant selection, factory deployment, role setup, policy config (Asset only), minting, and verification. Include code snippets where helpful. ${body.context ? `Context: ${body.context}` : ""}`,
    };

    const userMsg = prompts[step] ?? prompts.full;

    const raw = await callBankrLLM({
      model: "claude-haiku-4-5",
      temperature: 0,
      maxTokens: 1000,
      system: SYSTEM,
      messages: [{ role: "user", content: userMsg }],
    });

    const parsed = extractJsonObject(raw);

    return Response.json({
      step,
      variant: variant ?? null,
      beryl_live: new Date() >= new Date(BERYL_LAUNCH),
      beryl_launch: BERYL_LAUNCH,
      guide: parsed ?? { content: raw.slice(0, 800) },
      roles: ["ADMIN", "MINT", "BURN", "BURN_BLOCKED", "PAUSE", "UNPAUSE", "METADATA"],
      docs: "https://docs.base.org/base-chain/specs/upgrades/beryl/b20",
    });
  } catch (e) {
    console.error("[b20-deploy-guide]", e);
    return Response.json({ error: "internal error" }, { status: 500 });
  }
}
