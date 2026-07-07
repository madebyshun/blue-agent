// x402/b20-analyze — B20 (Base Native Token Standard) awareness tool.
// Explains Beryl/B20 architecture, variants, roles, and policies for builders.
// Price: $0.05 — LLM advisory; no on-chain data required.

import { callBankrLLM, extractJsonObject } from "@/app/api/_lib/llm";
import { getB20Activation } from "@/lib/b20/activation";

const B20_KNOWLEDGE = `
Base B20 is the Base Native Token Standard introduced in the Beryl upgrade.

ARCHITECTURE:
- Rust precompile (NOT a Solidity smart contract) at a fixed precompile address
- Full ERC-20 selector compatibility — works with all existing ERC-20 tooling
- B20Factory precompile for deployment — no constructor, no proxy pattern needed
- isB20(addr) helper to identify B20 tokens programmatically

TWO VARIANTS:
1. Asset — compliance-first for RWA/security tokens:
   - Transfer policies enforced at NODE level — B20 is a Rust precompile in the Base node, NOT EVM bytecode
   - PolicyRegistry (0x8453000000000000000000000000000000000002) enforces exactly TWO policy types: ALLOWLIST and BLOCKLIST
   - Freeze-seize = burnBlocked() gated by BURN_BLOCKED_ROLE (NOT a policy type)
   - Supply cap = updateSupplyCap() gated by DEFAULT_ADMIN_ROLE (NOT a policy type)
   - Identity-gated transfers possible via ALLOWLIST policy

2. Stablecoin — mint/burn + compliance for fiat-backed tokens:
   - Mint/burn controls, pause/unpause, blocklist
   - Simpler than Asset: no PolicyRegistry required
   - Good for payment tokens, wrapped stablecoins

7 RBAC ROLES:
1. ADMIN — grants/revokes all other roles
2. MINT — mints new tokens to any address
3. BURN — burns tokens from any address
4. BURN_BLOCKED — burns from blocked/frozen wallets only
5. PAUSE — pauses ALL transfers globally
6. UNPAUSE — resumes transfers after pause
7. METADATA — updates token name, symbol, metadata URI

POLICY REGISTRY (Asset variant only):
- Singleton precompile at 0x8453000000000000000000000000000000000002 on Base
- Exactly TWO policy types: ALLOWLIST and BLOCKLIST (no others)
- Create policy: policyRegistry.createPolicy(admin, PolicyType) → uint64 policyId
- Attach to token: token.updatePolicy(scope, policyId) — NO registerPolicy()
- 4 policy scopes: TRANSFER_SENDER_POLICY, TRANSFER_RECEIVER_POLICY, TRANSFER_EXECUTOR_POLICY, MINT_RECEIVER_POLICY
- Freeze-seize: burnBlocked() gated by BURN_BLOCKED_ROLE — separate from PolicyRegistry
- Supply cap: updateSupplyCap() gated by DEFAULT_ADMIN_ROLE — separate from PolicyRegistry
- All enforcement is node-level (Rust precompile), cannot be bypassed by EVM logic

KEY DIFFERENTIATORS vs ERC-20:
- Compliance is protocol-level, not contract-level (cannot be circumvented)
- Roles stored in precompile state, not contract storage
- transferWithMemo(to, amount, memo) for payment references
- Simulation: simulate before sending to catch PolicyForbids / paused errors

DEPLOYMENT STEPS:
1. Choose variant: Asset (compliance-heavy) or Stablecoin (mint/burn)
2. Call B20Factory.createB20(uint8 variant, bytes32 salt, bytes params, bytes[] initCalls) → token address
   - variant: 0 = ASSET, 1 = STABLECOIN
   - params: ASSET encodes decimals (uint8, 6–18); STABLECOIN encodes currency (string)
   - initCalls: batched setup calls run atomically at deploy, e.g. grantRole(MINT_ROLE, admin), updateSupplyCap, mint(seed)
3. Assign roles: token.grantRole(ROLE_HASH, address)
4. Asset only (if restricted transfers needed):
   a. policyRegistry.createPolicy(admin, PolicyType) → uint64 policyId
   b. token.updatePolicy(scope, policyId) — where scope is one of the 4 POLICY bytes32 constants
5. Mint initial supply: token.mint(to, amount) — requires MINT role

INTEGRATION TIPS:
- Use simulateContract before every transfer of a B20 token
- Check isB20(addr) to detect B20 tokens in your dApp
- B20 tokens ARE compatible with Uniswap v3/v4, Aave, and other Base DeFi
- Coinbase Smart Wallet supports B20 via standard ERC-20 interface`;

const SYSTEM = `You are a Base chain expert specializing in B20 tokens (Base Native Token Standard, Beryl upgrade). Answer precisely and practically. Only use the B20 knowledge provided — never fabricate addresses, function signatures, or facts not documented.

${B20_KNOWLEDGE}

Return ONLY raw JSON starting with {. No markdown fences. If a field has no data, use null.`;

type Action = "guide" | "roles" | "policy" | "analyze" | "compare";

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { action?: Action; address?: string; context?: string } = {};
    try {
      const text = await req.text();
      if (text?.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}
    const url = new URL(req.url);
    if (!body.action) body.action = (url.searchParams.get("action") as Action) ?? "guide";
    if (!body.address) body.address = url.searchParams.get("address") ?? undefined;
    if (!body.context) body.context = url.searchParams.get("context") ?? undefined;

    const action = body.action ?? "guide";

    const prompts: Record<Action, string> = {
      guide: "Provide a complete B20 builder guide: what B20 is, when to use Asset vs Stablecoin, the 7 roles with one-line descriptions, deployment steps, and top 3 integration tips. Be concise and practical.",
      roles: "List all 7 B20 RBAC roles with: name, who should hold it, security risk if compromised, and recommended multi-sig pattern. Return as roles array in JSON.",
      policy: "Explain B20 PolicyRegistry in detail: exactly TWO policy types exist (ALLOWLIST and BLOCKLIST — freeze-seize and supply-cap are NOT policy types). Explain how to create a policy (createPolicy(admin, PolicyType) → policyId) and attach it (token.updatePolicy(scope, policyId)), the 4 policy scopes, enforcement at node level, and when to use each type. Note that freeze-seize uses BURN_BLOCKED_ROLE and supply cap uses updateSupplyCap() — both separate from PolicyRegistry. Include a practical example for an RWA token.",
      analyze: body.address
        ? `Analyze this Base address as a potential B20 token: ${body.address}. Based on B20 architecture, explain what roles and policies it likely has, what variant it is, and integration considerations.${body.context ? ` Context: ${body.context}` : ""}`
        : `Explain B20 token architecture with focus on: how to identify a B20 token (isB20 helper), what makes it different from ERC-20, and how to safely integrate B20 into a dApp.${body.context ? ` Context: ${body.context}` : ""}`,
      compare: "Compare B20 Asset vs Stablecoin variant: use a 5-row table (use_case, compliance_level, policy_registry, roles_needed, typical_deployer). Then recommend which to use for: 1) tokenized treasury, 2) fiat-backed USDC competitor, 3) DAO governance token.",
    };

    const userMsg = prompts[action] ?? prompts.guide;

    // LLM advisory + live on-chain activation read, in parallel.
    const [raw, act] = await Promise.all([
      callBankrLLM({
        model: "claude-haiku-4-5",
        temperature: 0,
        maxTokens: 800,
        system: SYSTEM,
        messages: [{ role: "user", content: userMsg }],
      }),
      getB20Activation("mainnet"),
    ]);

    const parsed = extractJsonObject(raw);

    // act.ok === false ⟹ registry read failed → status unknown, never claim active.
    const assetLive  = act.ok && act.asset;
    const stableLive = act.ok && act.stablecoin;

    return Response.json({
      action_taken: action,
      address: body.address ?? null,
      activation: {
        network:      "mainnet",
        known:        act.ok,
        live:         act.ok ? (assetLive || stableLive) : null,
        asset:        act.ok ? assetLive  : null,
        stablecoin:   act.ok ? stableLive : null,
        source:       "on-chain ActivationRegistry 0x8453…0001 · isActivated",
      },
      b20_variants: ["Asset", "Stablecoin"],
      roles: ["ADMIN", "MINT", "BURN", "BURN_BLOCKED", "PAUSE", "UNPAUSE", "METADATA"],
      analysis: parsed ?? { summary: raw.slice(0, 500) },
      docs: "https://docs.base.org/base-chain/specs/upgrades/beryl/b20",
    });
  } catch (e) {
    console.error("[b20-analyze]", e);
    return Response.json({ error: "internal error" }, { status: 500 });
  }
}
