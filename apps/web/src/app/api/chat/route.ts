/**
 * Blue Agent — Chat API with Hub Tool Routing
 *
 * Flow:
 *   1. Non-streaming LLM call with tool definitions → detect intent
 *   2a. Tool use detected → execute Hub tool → streaming LLM call to format result
 *   2b. No tool use → convert response to SSE stream
 *
 * When Bankr is down: tool calls gracefully return an error message,
 * LLM falls back to answering from knowledge. Nothing breaks.
 */
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getIdentifier } from "@/lib/rate-limit";
import { checkMemo } from "@/lib/b20/check-memo";
import { checkBalance } from "@/lib/wallet/balance";

export const runtime = "nodejs";
// Vercel kills serverless functions at 60s by default — explicit budget so
// it fails loudly instead of silently 504-ing.
export const maxDuration = 120;

const BANKR_LLM       = "https://llm.bankr.bot/v1/messages";
const VENICE_API      = "https://api.venice.ai/api/v1/chat/completions";
const BASE_URL        = process.env.NEXT_PUBLIC_APP_URL ?? "https://blueagent.dev";
const INTERNAL_KEY    = process.env.INTERNAL_SERVICE_KEY ?? "";

// ─── Credit ledger debit helpers (Week 2 of credit redesign) ─────────────────

type DebitResult =
  | { kind: "ok";           cost: number }
  | { kind: "insufficient"; needed: number; balance: number }
  | { kind: "skipped";      reason: string };

/**
 * Resolve the connected wallet's tier server-side, compute the model-tier
 * credit cost, and debit it from the unified credit ledger. Returns the
 * outcome so the caller can either keep streaming (ok/skipped) or short-
 * circuit with a credit-error SSE (insufficient).
 *
 * Skipped (not an error) when:
 *   - INTERNAL_SERVICE_KEY isn't configured  → can't auth to the spend route
 *   - the spend route itself errors out      → degrade gracefully, don't block
 */
async function debitChatCredits(address: string, tier: string): Promise<DebitResult> {
  // Lazy-import so we don't drag the lib into every other code path that
  // imports this route module (Next.js build will tree-shake either way,
  // but keeps the dependency graph obvious).
  const { fetchBlueBalance, getTierInfo } = await import("@/lib/credits");
  const { chatCreditCost }                = await import("@/lib/credit-pricing");

  const blueBalance = await fetchBlueBalance(address);
  const holderTier  = getTierInfo(blueBalance);

  // Max tier (10M+ BLUE, dailyCr === -1) is unlimited. The UI promises
  // "Max tier · no metering, every model free" and shows ∞ credits — so
  // honor that server-side and skip the debit entirely, instead of charging
  // the (40%-discounted) per-message cost. Without this the backend silently
  // contradicts the ∞ UI and bills holders for messages they were told are free.
  if (holderTier.dailyCr === -1) return { kind: "skipped", reason: "unlimited-tier" };

  const cost = chatCreditCost(tier, holderTier);

  if (cost <= 0) return { kind: "skipped", reason: "zero-cost-tier" };

  try {
    const res = await fetch(`${BASE_URL}/api/credits/spend`, {
      method: "POST",
      headers: {
        "Content-Type":   "application/json",
        "X-Blue-Internal": INTERNAL_KEY,
      },
      body: JSON.stringify({ address, amount: cost, reason: `chat:${tier}` }),
      signal: AbortSignal.timeout(8_000),
    });
    if (res.status === 402) {
      const data = await res.json().catch(() => ({})) as {
        balance?: { balance?: number };
      };
      return {
        kind:    "insufficient",
        needed:  cost,
        balance: data.balance?.balance ?? 0,
      };
    }
    if (!res.ok) {
      // Don't block the chat on ledger trouble — log + skip.
      console.error("[chat] credit spend failed:", res.status);
      return { kind: "skipped", reason: `spend-${res.status}` };
    }
    return { kind: "ok", cost };
  } catch (e) {
    console.error("[chat] credit spend error:", (e as Error).message);
    return { kind: "skipped", reason: "network" };
  }
}

/**
 * Return an SSE stream that emits a single `insufficient_credits` event and
 * closes — keeps the response shape identical to the normal chat stream so
 * the frontend reader doesn't need a separate code path for this.
 */
function creditErrorSSE(needed: number, balance: number): Response {
  const payload = JSON.stringify({
    type:    "insufficient_credits",
    needed,
    balance,
    message: `You need ${needed} credits but only have ${balance}. Top up to continue.`,
  });
  const body = `data: ${payload}\n\ndata: [DONE]\n\n`;
  return new Response(body, {
    status:  200, // 200 + SSE so the existing reader picks it up
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-store",
      "Connection":    "keep-alive",
    },
  });
}

// ─── Models ───────────────────────────────────────────────────────────────────

// max_tokens lowered for Pro/Max to enforce concise default. The new system-
// prompt "Output style" section pushes the model toward short answers; this
// is the budget guard so even an LLM that ignores the prompt can't run away
// into a 2000-token essay for a one-line price question. Verbose intents
// ("explain in detail", "deep dive") use longer answers but still fit.
const MODELS: Record<string, { id: string; maxTokens: number }> = {
  fast:     { id: "claude-haiku-4-5",   maxTokens: 768  },  // was 1024
  pro:      { id: "claude-sonnet-4-6",  maxTokens: 1200 },  // was 2048
  max:      { id: "claude-opus-4-7",    maxTokens: 2400 },  // real Opus 4.7 (Bankr serves it)
  deepseek: { id: "deepseek-v4-flash",  maxTokens: 2400 },  // DeepSeek V4 Flash, 1M ctx — via Bankr
  gemini:   { id: "gemini-2.5-flash",   maxTokens: 2400 },  // Gemini 2.5 Flash — via Bankr
  kimi:     { id: "kimi-k2-6",          maxTokens: 2400 },  // Kimi K2, long context — via Bankr
};

// ─── Model display names ──────────────────────────────────────────────────────

const VENICE_DISPLAY: Record<string, string> = {
  "deepseek-v4-flash":                  "DeepSeek V4 Flash (Venice)",
  "deepseek-v4-pro":                    "DeepSeek V4 Pro (Venice)",
  "kimi-k2-6":                          "Kimi K2 (Venice)",
  "claude-opus-4-7":                    "Claude Opus 4 (Venice)",
};

const BANKR_DISPLAY: Record<string, string> = {
  fast:     "Haiku 4.5 · Fast",
  pro:      "Sonnet 4.6 · Chat",
  max:      "Opus 4.7 · Deep Think",
  deepseek: "DeepSeek V4 · 1M ctx",
  gemini:   "Gemini 2.5 Flash · Google",
  kimi:     "Kimi K2 · Long Context",
};

function getModelLabel(tier: string, modelId?: string, provider?: string): string {
  if (provider === "venice" && modelId) {
    return VENICE_DISPLAY[modelId] ?? `${modelId} (Venice)`;
  }
  return BANKR_DISPLAY[tier] ?? `${tier}`;
}

// ─── Per-model max_tokens ─────────────────────────────────────────────────────

const VENICE_MAX_TOKENS: Record<string, number> = {
  "deepseek-v4-flash":                 4096,
  "deepseek-v4-pro":                   8192,
  "kimi-k2-6":                         4096,
  "claude-opus-4-7":                   4096,
  "claude-fable-5":                    4096,
  "grok-4-3":                          4096,
  "qwen3-235b-a22b-instruct-2507":     8192,
  "mistral-small-3-2-24b-instruct":    4096,
  "venice-uncensored-1-2":             4096,
  // E2EE — smaller models, conservative limit
  "e2ee-venice-uncensored-24b-p":      2048,
  "e2ee-gemma-3-27b-p":                2048,
  "e2ee-qwen3-6-35b-a3b":              2048,
};

function veniceMaxTokens(modelId: string): number {
  return VENICE_MAX_TOKENS[modelId] ?? 4096;
}

// ─── System prompt ────────────────────────────────────────────────────────────

const BASE_SYSTEM = `You are Blue Agent — the AI assistant for builders.
You help with ANY coding or development request: web apps, games, scripts, frontends, APIs, smart contracts, agents — whatever the user needs built.
For Base and onchain projects you have live hub tools for prices, security, DeFi, and on-chain data (see below).
Be direct, technical, and actionable. When relevant, suggest Base/USDC/onchain integrations — but never refuse a general coding request.

## Credit system (IMPORTANT — know this)
Blue Agent uses a credit system based on $BLUEAGENT token balance:
- Guest (no wallet): 100 credits/day free (~10 messages — no signup needed)
- Starter (hold 500K BLUE): 500 credits/day (~$0.50)
- Pro (hold 2M BLUE): 2,000 credits/day + 20% discount (~$2)
- Max (hold 10M BLUE): unlimited credits/day + 40% discount (~$10)
Credits refresh automatically every 24h. To get more credits: buy $BLUEAGENT on Uniswap Base, or click "Buy $BLUEAGENT" in the sidebar. No USDC purchase needed — just hold $BLUEAGENT.
If a user asks about buying credits, getting more credits, or topping up — explain the tier system and tell them to use the "Buy $BLUEAGENT" button in the sidebar.

## Hub tools
You have access to real-time Hub tools. Use them when the user asks about:
- **Live token / crypto prices** (ANY "price", "giá", "what's X at" question) → hub_token_price FIRST. Never guess from training data.
- Token picks, market signals, whale activity → hub_token_pick, hub_whale_signal, hub_narrative
- Market fit, competitor analysis, investor memos → hub_market_fit, hub_competitor_scan, hub_investor_memo
- Security checks, honeypots, risk screening → hub_risk_gate, hub_honeypot, hub_deep_analysis
- Builder scores, repo health, grants → hub_builder_score, hub_repo_health, hub_base_grant
- Fundraising timing, ecosystem digest → hub_fundraise_timing, hub_ecosystem
- Live onchain data: balance, tx, block, gas, contract calls → hub_crypto_rpc (21 chains: base, ethereum, arbitrum, optimism, polygon, etc.)
- User's OWN wallet balance ("check my balance", "how much ETH/USDC do I have", "show my balance") → check_balance. It auto-uses the connected wallet (no address arg), reads ETH + USDC + WETH + cbBTC in ONE multicall, and renders a result card. NEVER invent figures; if no wallet is connected the result says so. Do NOT use hub_crypto_rpc for the user's own balance.
- Anything requiring live web data (news, events, rumours, OFFICIAL announcements) → web_search

Tool selection rules:
1. For prices: ALWAYS hub_token_price. Never the web search and never your own knowledge.
2. For onchain reads: hub_crypto_rpc.
3. For market intel / analysis: the appropriate hub_* tool.
4. For recent web news / sentiment / events: web_search.
5. You can chain tools — e.g. hub_token_price + web_search for "ETH price and why is it up?".
6. **Use the RIGHT tools — not arbitrarily few.** A bare price query = hub_token_price only. A safety check = hub_risk_gate + hub_honeypot together. An audit request = hub_risk_gate + hub_honeypot + hub_contract_trust + hub_key_exposure. Don't under-call when two tools give a meaningfully better answer — but don't add tools with no bearing on THIS message.
7. **Transparency — one-line tool note.** When you run tools, open your response with a single concise line before your actual answer: "🔍 [tool] → [key result in 10 words or fewer]". For multiple tools chain them: "🔍 hub_risk_gate + hub_honeypot → HIGH risk, honeypot confirmed". This is for trust, not verbosity.
8. **Proactive offer.** If the user's message would clearly benefit from a live tool but you can answer from knowledge, answer first, then end with one line: "↳ Want me to run a live [tool name] on this?"
9. **Act only on what the CURRENT message asks.** Do NOT re-run tools on a token/address/contract from an EARLIER message unless the user explicitly references it again now.
10. **If a tool returns an error, "[unavailable]", or "[payment required]" — DO NOT fabricate.** Say plainly that the live tool is temporarily unavailable and stop. NEVER invent a price, score, verdict, balance, or risk review to fill the gap. For security audits and token scans: a fabricated "preliminary" audit is worse than no audit.

If a tool is unavailable, answer from your own knowledge and note that live data is unavailable.
If the user has memory context below, use it to personalize responses — reference their project, remember what they're building.

## Code generation (CRITICAL)
When the user asks you to build, create, or generate any code (app, game, website, script, contract, component):
- **ALWAYS output complete, runnable code.** Never truncate mid-function or mid-block.
- **If the full implementation won't fit:** output a simpler but 100% complete working version first. Drop non-essential features to stay within output limits — but the code MUST run end-to-end with no missing pieces.
- **HTML/game requests:** the file must have a closing </html> tag. JS must have all functions closed. Canvas games must have the requestAnimationFrame loop.
- **Never** output a partial implementation and say "add the rest yourself". Output what works NOW, then offer to extend feature by feature.
- Wrap all code in a single fenced code block with the correct language tag (html, tsx, sol, etc.).

## Output style
Be concise by default. Most users want a quick answer, not an essay.
- **Data questions** (price, stats, balance) → lead with the number, then a single line of context. Use a small markdown table only when comparing 3+ values.
- **Explain questions** ("how does X work", "what is Y") → 3-5 short paragraphs MAX. Use headings only when the answer has 3+ distinct sections.
- **How-to questions** → numbered steps, one action per step, no padding.
- **Yes/no questions** → start with "Yes" or "No" + one-sentence rationale, expand only if the user asks "why".

Only go long when the user explicitly says "explain in detail", "deep dive", "step-by-step", or asks a multi-part question.

## Follow-up suggestions
For complex answers only (not simple price/data queries), optionally append 1-2 follow-up suggestions, each prefixed with "↳ " (the arrow + space).
Keep them short (≤ 8 words), specific, and actionable.`;

// ─── Integration prompt sections (conditionally appended) ─────────────────────

// Bankr agent — always on (Bankr is the default LLM + agent provider).
const BANKR_AGENT_SECTION = `## Bankr Agent
Bankr is the LLM + execution provider for Blue Chat.
- Token prices: use hub_token_price for any chain
- Onchain actions: use Base MCP tools when available
- Polymarket: available via Bankr
For swaps: always show preview, require confirmation.`;

// Base MCP — appended only when the client enables it (body.baseMcp).
const BASE_MCP_SECTION = `## Base MCP
You have access to Base MCP (mcp.base.org) for onchain actions:
- get_wallets: check wallet address + balance
- send: send tokens (requires user approval)
- swap: swap tokens (requires user approval)
- sign: sign messages (requires user approval)
- send_calls: batch contract calls (requires user approval)
- get_request_status: check approval status
- chain_rpc_request: read onchain state

APPROVAL RULES:
- Every write action returns { approvalUrl, requestId }
- ALWAYS show the approvalUrl link to user
- ALWAYS wait for user to approve before claiming success
- NEVER assume success without polling get_request_status
- NEVER execute write actions without showing approval link`;

// Coinbase MCP — appended only when the user has connected (body.coinbase).
const COINBASE_SECTION = `## Coinbase for Agents
You have access to Coinbase spot trading:
- 900+ trading pairs
- Portfolio management
- USDC/USD conversions

SAFETY RULES:
- ALWAYS preview orders before executing
- ALWAYS show fees + estimated fill price
- ALWAYS require explicit user confirmation
- NEVER trade without confirmation
- Use --dry-run equivalent before any trade`;

// B20 / Beryl awareness — always injected so the model understands the new
// Base Native Token Standard (Beryl upgrade, live June 25 2026).
const B20_SECTION = `## B20 Token Awareness (Beryl upgrade, live June 25 2026)
B20 is the Base Native Token Standard — a Rust PRECOMPILE (not a Solidity contract).
Full ERC-20 selector compatibility. Two variants: Asset (RWA/compliance) and Stablecoin (mint/burn).

7 RBAC roles: ADMIN · MINT · BURN · BURN_BLOCKED · PAUSE · UNPAUSE · METADATA
B20 is a Rust precompile in the Base node — NOT EVM bytecode, enforcement is node-level.
PolicyRegistry (0x8453000000000000000000000000000000000002) enforces exactly TWO policy types: ALLOWLIST and BLOCKLIST.
Freeze-seize = burnBlocked() gated by BURN_BLOCKED_ROLE (NOT a policy type).
Supply cap = updateSupplyCap() gated by DEFAULT_ADMIN_ROLE (NOT a policy type).
Create policy: policyRegistry.createPolicy(admin, PolicyType) → uint64 policyId; then token.updatePolicy(scope, policyId). NO registerPolicy().
4 policy scopes: TRANSFER_SENDER_POLICY, TRANSFER_RECEIVER_POLICY, TRANSFER_EXECUTOR_POLICY, MINT_RECEIVER_POLICY.
isB20(addr) helper identifies B20 tokens. transferWithMemo(to, amount, memo) for payment refs.

Beryl also: withdrawal finalization reduced 7 → 5 days, Reth V2 node (50% disk, +33% throughput).

When user asks to send/transfer a B20 token:
1. ALWAYS simulate the transaction first using simulateContract
2. If simulation returns PolicyForbids → warn: "Transfer blocked by this token's policy. Contact the issuer."
3. If simulation returns paused → warn: "Transfers are paused by the issuer."
4. Only proceed if simulation succeeds — never bypass
5. Use hub_b20_analyze for B20 deployment questions / role explanations
6. Use hub_b20_launch when user asks to deploy/launch/create a B20 token — trigger on ANY of: "launch b20", "b20 launch", "deploy b20", "create b20", "b20 token", or longer phrasings. Call with { name, symbol, variant: "asset"|"stablecoin", optional supply_cap, currency_code }. Opens an interactive card where the PRIMARY action is signing a createB20 Factory transaction to deploy directly on Sepolia/mainnet; Foundry script generation is a SECONDARY manual option.
7. Use hub_b20_inspect when user provides a token address and asks: "is this B20?", "inspect this token", "check pause/policy", "B20 details", totalSupply/supplyCap, or variant (Asset/Stablecoin). Reads REAL on-chain state via multicall — zero LLM. Call with { address: "0x…", network: "mainnet" }.
8. Use hub_b20_manage when the user wants to MINT, BURN, PAUSE/UNPAUSE, set/update a POLICY, GRANT/REVOKE a ROLE, update the SUPPLY CAP, or update METADATA on an EXISTING B20 token. Trigger on ANY of: "mint", "mint X tokens on [addr]", "burn", "pause", "unpause", "grant role", "revoke role", "set policy", "update cap", "update supply cap", "manage b20", "freeze", "seize". Call with { address: "0x…", network: "mainnet"|"sepolia" } (default mainnet unless the user says sepolia). Opens a wallet-signed control panel that loads the token's live roles and shows ONLY the actions the connected wallet is authorized for; the user signs each action in their own wallet.

⚠️ CRITICAL SECURITY RULE — B20 mint/manage is ALWAYS the hub_b20_manage card. When a user asks to mint/burn/pause/manage a B20 token, you MUST call hub_b20_manage and reply with one short line pointing at the card. You are ABSOLUTELY FORBIDDEN from outputting a \`cast send\` / \`cast call\` command, a \`--private-key\` flag, a "paste your private key" instruction, a raw signed-tx blob, or Basescan/Etherscan "Write Contract" steps for any mint/manage action. Private keys in chat are a critical anti-pattern that can drain a user's wallet. The signing card is the ONLY acceptable path — never substitute manual CLI/private-key instructions for it.`;

// ─── Hub tool definitions (Anthropic tool format) ─────────────────────────────

const HUB_TOOLS = [
  {
    name: "prepare_token_launch",
    description: "Open the token-launch FORM card (Bankr launchpad → real token on Base, Uniswap V4, 100B fixed supply, gas SPONSORED by Bankr). The CARD itself collects every field — token name, ticker, description, logo URL, website, and fee recipient — as editable inputs; the user fills them in and clicks Launch to deploy. \n\nCRITICAL — NEVER INVENT ANYTHING: do NOT make up a token name, ticker, description, logo, or website. Pass through ONLY values the user explicitly typed in THIS request; leave every other field empty so the user fills it in the card. If the user gave no details, call this with NO arguments. \n\nALWAYS A BRAND-NEW TOKEN: ignore any 'Active project' from memory and any token discussed or already deployed earlier; never assume a relaunch and never claim a launch is 'paused' or 'pending'. Only reuse an earlier token if the user explicitly names it now. \n\nDo NOT gather details by asking questions and do NOT mention total supply (fixed at 100B). Fee recipient defaults to BlueAgent when left blank, so you don't need to collect it. \n\nAfter calling, reply with ONE short line telling the user to fill in the card above and hit Launch — never claim the token launched (only the user's Launch click deploys it) and never quote a gas/ETH cost.",
    input_schema: {
      type: "object",
      properties: {
        tokenName:        { type: "string", description: "OPTIONAL — pass ONLY if the user explicitly typed a token name in this request; otherwise omit. Never invent one." },
        tokenSymbol:      { type: "string", description: "OPTIONAL — pass ONLY if the user explicitly gave a ticker. Never invent one." },
        description:      { type: "string", description: "OPTIONAL — pass ONLY if the user explicitly gave a description. Never invent one." },
        image:            { type: "string", description: "OPTIONAL — pass ONLY if the user explicitly gave a logo image URL. Never invent one." },
        website:          { type: "string", description: "OPTIONAL — pass ONLY if the user explicitly gave a website URL. Never invent one." },
        feeRecipientType: { type: "string", enum: ["wallet", "x", "farcaster", "ens"], description: "OPTIONAL — pass ONLY if the user explicitly named where fees go. Left blank, the card defaults fees to BlueAgent." },
        feeRecipientValue:{ type: "string", description: "OPTIONAL — the handle/address for feeRecipientType (e.g. @username or name.eth). Pass only if the user explicitly named one." },
      },
      required: [],
    },
  },
  {
    name: "prepare_yield",
    description: "Open the MOVE-TO-YIELD card so the user can supply idle USDC into Aave v3 on Base (earn lending yield) or withdraw it back — NON-custodial, the user SIGNS in their own wallet; Blue Agent never holds keys or funds. Use when the user wants to: 'earn yield', 'put my USDC to work', 'deposit/supply to Aave', 'move idle USDC to yield', 'stake my USDC for interest', OR 'withdraw/pull my USDC out of Aave'. The CARD collects and edits amount, network (Base Sepolia testnet by DEFAULT — safe to test — or Base mainnet), and the action (supply/withdraw); the user reviews and signs.\n\nCRITICAL — NEVER INVENT AN AMOUNT: pass `amount` ONLY if the user explicitly stated a number in THIS request; otherwise omit it and let the card collect it. Pass action='withdraw' only if the user explicitly asked to withdraw/pull out. Network defaults to testnet; pass network='base' ONLY if the user explicitly asked for mainnet / real funds.\n\nThis tool NEVER moves funds by itself — only the user's signature in the card executes anything. After calling, reply with ONE short line telling the user to review and sign in the card above; never claim funds were moved and never quote an APY figure you weren't given.",
    input_schema: {
      type: "object",
      properties: {
        action:  { type: "string", enum: ["supply", "withdraw"], description: "OPTIONAL — 'supply' (default) deposits USDC into Aave for yield; 'withdraw' pulls it back. Pass 'withdraw' only if the user explicitly asked to withdraw." },
        amount:  { type: "number", description: "OPTIONAL — USDC amount. Pass ONLY if the user explicitly stated one in this request; otherwise omit and the card collects it. Never invent one." },
        network: { type: "string", enum: ["base", "baseSepolia"], description: "OPTIONAL — defaults to baseSepolia (testnet, safe to test). Pass 'base' ONLY if the user explicitly asked for mainnet / real funds." },
      },
      required: [],
    },
  },
  {
    name: "prepare_send",
    description: "Open the SEND / PAY card so the user can send USDC (or ETH) to an address or a Basename (e.g. alice.base) on Base — NON-custodial, the user SIGNS the transfer in their own wallet; Blue Agent never touches the funds. Use when the user wants to: 'send X USDC to …', 'pay …', 'transfer to …', 'send ETH to …'. The CARD collects/edits recipient, amount, asset (USDC default), and network (Base Sepolia testnet by DEFAULT, or Base mainnet) and resolves the Basename → address; the user reviews and signs.\n\nCRITICAL — never invent a recipient or amount: pass `to` and `amount` ONLY if the user explicitly stated them in THIS request; otherwise omit and let the card collect them. Pass asset='ETH' only if the user explicitly said ETH. Network defaults to testnet; pass network='base' ONLY if the user explicitly asked for mainnet / real funds.\n\nThis NEVER moves funds by itself — only the user's signature executes. After calling, reply with ONE short line telling the user to review the recipient + amount and sign in the card; never claim funds were sent.",
    input_schema: {
      type: "object",
      properties: {
        to:      { type: "string", description: "OPTIONAL — recipient 0x… address or Basename/ENS (e.g. alice.base). Pass ONLY if the user explicitly gave one; never invent one." },
        amount:  { type: "number", description: "OPTIONAL — amount to send. Pass ONLY if the user explicitly stated one; otherwise omit and the card collects it. Never invent one." },
        asset:   { type: "string", enum: ["USDC", "ETH"], description: "OPTIONAL — defaults to USDC. Pass 'ETH' only if the user explicitly said ETH." },
        network: { type: "string", enum: ["base", "baseSepolia"], description: "OPTIONAL — defaults to baseSepolia (testnet). Pass 'base' ONLY if the user explicitly asked for mainnet / real funds." },
      },
      required: [],
    },
  },
  {
    name: "hub_token_pick",
    description: "Get an AI token pick on Base — falsifiable thesis, entry point, sizing, and kill criterion. Use when user asks: 'what should I buy', 'token pick', 'best token today', 'what's a good trade'.",
    input_schema: {
      type: "object",
      properties: { context: { type: "string", description: "Optional market context or narrative to consider" } },
    },
  },
  {
    name: "hub_narrative",
    description: "Get the current narrative map — mindshare scores, velocity, phase (Emerging/Rising/Peak/Fading), and position calls (FRONT-RUN/RIDE/FADE/WATCH). Use when user asks about narratives, trends, what's running on CT.",
    input_schema: {
      type: "object",
      properties: { focus: { type: "string", description: "Specific narratives to focus on (optional)" } },
    },
  },
  {
    name: "hub_whale_signal",
    description: "Copy-trade signal from a WALLET's real recent on-chain transfers (Basescan, live) — is this whale accumulating or distributing, and is it worth copying. Works on ANY 0x address (wallet preferred). USE WHEN: the user gives an address and asks whether to copy it / what it's doing on-chain. NOT FOR: code/concept questions. For a token's overall whale flow, use hub_whale_tracker.",
    input_schema: {
      type: "object",
      properties: {
        address: { type: "string", description: "The 0x address to analyse (a whale wallet, preferred). Reads its real recent on-chain transfers." },
      },
      required: ["address"],
    },
  },
  {
    name: "hub_deep_analysis",
    description: "Comprehensive token fundamentals — on-chain activity, holder distribution, risk signals. USE WHEN: the user gives a token CONTRACT ADDRESS and asks for DD / due diligence / deep analysis. NOT FOR: analysing, reviewing, or debugging CODE; explaining concepts; or any request without a real token address — answer those directly without a tool.",
    input_schema: {
      type: "object",
      properties: { token: { type: "string", description: "Token contract address" } },
      required: ["token"],
    },
  },
  {
    name: "hub_honeypot",
    description: "Detect honeypot tokens that cannot be sold after purchase. Use when user asks if a token is safe, is a honeypot, or wants to verify a contract before buying.",
    input_schema: {
      type: "object",
      properties: { token: { type: "string", description: "Token contract address on Base" } },
      required: ["token"],
    },
  },
  {
    name: "hub_risk_gate",
    description: "Screen any transaction before execution — rug check, AML, malicious contract patterns. Use when user wants to verify a transaction, address, or contract is safe.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", description: "transfer | swap | approve | call" },
        to: { type: "string", description: "Target address 0x..." },
        value: { type: "string", description: "Amount in Wei (optional)" },
      },
      required: ["action", "to"],
    },
  },
  {
    name: "hub_market_fit",
    description: "Market-fit analysis for a project — problem clarity, timing, competition, demand signals. USE WHEN: the user asks to VALIDATE / SCORE market fit or demand for a described product, or when the user asks for an idea brief. NOT FOR: writing code, building an app/game/frontend, explaining concepts, designing architecture, or debugging — answer those directly without a tool.",
    input_schema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project description" },
        url: { type: "string", description: "Project URL (optional)" },
      },
      required: ["project"],
    },
  },
  {
    name: "hub_competitor_scan",
    description: "Competitor analysis — direct/indirect competitors and defensible edge. USE WHEN: the user explicitly asks WHO the competitors are for their project. NOT FOR: writing code, building, explaining concepts, or architecture — answer those directly without a tool.",
    input_schema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project description" },
        category: { type: "string", description: "Category e.g. DeFi lending, AI agent" },
      },
      required: ["project"],
    },
  },
  {
    name: "hub_investor_memo",
    description: "Generate a full investor memo — thesis, market, moat, risks, ask. USE WHEN: the user explicitly asks for an investor memo / pitch doc / fundraising deck. NOT FOR: writing code, building, explaining concepts, or architecture — answer those directly without a tool.",
    input_schema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project name" },
        description: { type: "string", description: "Description and traction" },
        ask: { type: "string", description: "Raise ask e.g. $500k pre-seed" },
      },
      required: ["project", "description"],
    },
  },
  {
    name: "hub_fundraise_timing",
    description: "Assess if now is the right time to raise — market conditions, stage readiness, investor appetite. USE WHEN: the user asks WHETHER/WHEN to raise, or when the user asks for a pitch narrative. NOT FOR: writing code, building, explaining concepts, or architecture — answer those directly without a tool.",
    input_schema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project description" },
        stage: { type: "string", description: "Stage and key metrics" },
      },
      required: ["project"],
    },
  },
  {
    name: "hub_base_grant",
    description: "Find active grants and funding for Base projects. USE WHEN: the user asks about GRANTS / funding programs on Base, or when the user wants funding paths. NOT FOR: writing code, building, explaining concepts, or architecture — answer those directly without a tool.",
    input_schema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project description" },
        stage: { type: "string", description: "idea | build | live" },
      },
      required: ["project"],
    },
  },
  {
    name: "hub_builder_score",
    description: "Get Builder Score for an X/Twitter handle — on-chain activity, shipping history, community (0-100). Use when user asks about builder score or their reputation.",
    input_schema: {
      type: "object",
      properties: { handle: { type: "string", description: "X/Twitter handle without @" } },
      required: ["handle"],
    },
  },
  {
    name: "hub_repo_health",
    description: "GitHub repo health — commit velocity, test coverage, dependency risk, bus factor. Use when user asks about code quality or repo metrics.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string", description: "GitHub repository URL" } },
      required: ["url"],
    },
  },
  {
    name: "hub_ecosystem",
    description: "Daily Base ecosystem digest — top launches, protocol updates, builder activity. USE WHEN: the user explicitly asks what's happening on Base TODAY / latest news / ecosystem updates. NOT FOR: writing code, building, explaining concepts, architecture, or idea/concept brainstorming — answer those directly without a tool.",
    input_schema: {
      type: "object",
      properties: { focus: { type: "string", description: "Focus area e.g. DeFi, AI agents, NFT (optional)" } },
    },
  },
  {
    name: "hub_agent_score",
    description: "Agent Score for AI agents on Base — XP, interactions, uptime. Use when user asks about an AI agent's score or performance.",
    input_schema: {
      type: "object",
      properties: { handle: { type: "string", description: "Agent handle or name" } },
      required: ["handle"],
    },
  },
  {
    name: "hub_aml",
    description: "AML compliance screening for any wallet — clean/suspicious/flagged verdict with risk score. Use when user asks if a wallet is clean, safe to receive funds from, or needs AML check.",
    input_schema: {
      type: "object",
      properties: { address: { type: "string", description: "Wallet address 0x..." } },
      required: ["address"],
    },
  },
  {
    name: "hub_whale_tracker",
    description: "Smart money and whale flow analysis for any token — top holders, recent large moves, accumulation/distribution. Use when user asks about whale activity for a specific token.",
    input_schema: {
      type: "object",
      properties: { token: { type: "string", description: "Token contract address on Base" } },
      required: ["token"],
    },
  },
  {
    name: "hub_dex_flow",
    description: "Live DEX buy/sell pressure and liquidity flow for a token. Use when user asks about DEX volume, buy pressure, sell walls, liquidity.",
    input_schema: {
      type: "object",
      properties: { token: { type: "string", description: "Token contract address on Base" } },
      required: ["token"],
    },
  },
  {
    name: "hub_airdrop",
    description: "Check Base airdrop eligibility for a wallet — activity score, eligible protocols, estimated allocation. Use when user asks about airdrops, eligibility, or airdrop farming.",
    input_schema: {
      type: "object",
      properties: { address: { type: "string", description: "Wallet address 0x..." } },
      required: ["address"],
    },
  },
  {
    name: "hub_token_price",
    description: `THE ONLY tool for token / crypto / coin PRICE queries. Returns live USD price from CoinGecko (~30s cache).

USE FOR ANY of these intents — match aggressively:
- "ETH price", "eth price", "ethereum price"
- "giá ETH", "giá bitcoin", "giá X"  ← Vietnamese
- "BTC hôm nay", "ETH bao nhiêu"
- "what's SOL at", "how much is USDC"
- "$BLUEAGENT price", "price of <any token>"
- "X to USD", "X worth"
- Any sentence containing "price", "giá", "cost", "worth", "trading at", "spot"

DO NOT use hub_crypto_rpc for prices — that tool is for raw RPC reads only and CANNOT return prices.
DO NOT answer from your own training data — prices move every second.

Two query modes:
- By symbol (use this for majors): { symbol: "eth" }
- By contract on Base/Ethereum: { network: "base", address: "0x..." }

Common symbols: eth, btc, sol, usdc, usdt, bnb, avax, matic, arb, op, link, uni, aero, cbbtc, blue.

Returns: { usd, change24h (%), marketCap, volume24h, source, fetchedAt }.`,
    input_schema: {
      type: "object",
      properties: {
        symbol:  { type: "string", description: "Token symbol — e.g. eth, btc, sol, usdc, blue, aero. Lowercase preferred." },
        network: { type: "string", description: "Network slug when querying by contract address. base | ethereum | arbitrum | optimism | polygon | bsc. Default: base." },
        address: { type: "string", description: "Contract address (0x…) when querying by token contract. Pair with `network`." },
      },
    },
  },
  {
    name: "hub_crypto_rpc",
    description: `Make a live onchain JSON-RPC call (eth_call, eth_getBalance, etc) via Venice Crypto RPC.

**NEVER USE FOR TOKEN PRICES.** Token prices use hub_token_price exclusively. This tool returns raw onchain data — there is no "get price" JSON-RPC method.

Use this ONLY for:
- Wallet ETH balance: eth_getBalance(address)
- ERC-20 balance: eth_call to balanceOf(address)
- Tx details: eth_getTransactionByHash / eth_getTransactionReceipt
- Block number, gas price, fee data
- Generic contract reads (eth_call) — but not for price queries
- ENS lookup

Supported networks: base, ethereum, arbitrum, optimism, polygon, avalanche, bsc, fantom, gnosis, zksync, linea, scroll, mantle, blast, mode, zora, celo, moonbeam, cronos, kava, metis.
Default to "base" for Base-related queries.`,
    input_schema: {
      type: "object",
      properties: {
        network: {
          type: "string",
          description: "Network name: base | ethereum | arbitrum | optimism | polygon | avalanche | bsc | fantom | gnosis | zksync | linea | scroll | mantle | blast | mode | zora | celo | moonbeam | cronos | kava | metis. Default: base",
        },
        method: {
          type: "string",
          description: "JSON-RPC method: eth_getBalance | eth_call | eth_getTransactionByHash | eth_getTransactionReceipt | eth_blockNumber | eth_gasPrice | eth_estimateGas | eth_getLogs | eth_getCode | eth_getStorageAt",
        },
        params: {
          type: "array",
          description: "JSON-RPC params array. Examples: eth_getBalance → [\"0xAddress\", \"latest\"], eth_call → [{to: \"0xContract\", data: \"0xCalldata\"}, \"latest\"]",
          items: {},
        },
      },
      required: ["method"],
    },
  },
  {
    name: "blue_monitor",
    description: "Health + risk snapshot for a Base token/contract — live price, liquidity, Basescan verification, risk signals + watch plan. Use when user asks to 'monitor', 'watch', 'check the risk/health of' a token or contract.",
    input_schema: { type: "object", properties: { target: { type: "string", description: "Base token/contract address (0x…) or protocol name" }, focus: { type: "string", description: "Optional focus" } }, required: ["target"] },
  },
  {
    name: "blue_registry",
    description: "Discover the Blue Hub tool catalog — every callable tool, filterable by query/category, with prices. Use when user asks 'what tools are there', 'what can you do', 'list the tools'.",
    input_schema: { type: "object", properties: { query: { type: "string" }, category: { type: "string" } } },
  },
  {
    name: "blue_research",
    description: "Deep DD memo on a Base project, narrative, or token — thesis, bull/bear, risks, contrarian take, verdict. Use when user asks for 'research', 'DD', 'a deep dive', 'a memo on X'.",
    input_schema: { type: "object", properties: { topic: { type: "string" }, target: { type: "string", description: "Optional 0x token address to ground in live data" } }, required: ["topic"] },
  },
  {
    name: "blue_compose",
    description: "Plan a runnable chain of Blue Hub tools to hit a goal. Use when user describes a multi-step goal and asks 'how', 'what's the workflow', 'which tools should I run'.",
    input_schema: { type: "object", properties: { goal: { type: "string" } }, required: ["goal"] },
  },
  {
    name: "blue_deploy",
    description: "Base mainnet deploy mechanics — scripts, Basescan verify commands, env, gas. Use when user asks how to 'deploy', 'ship to Base', 'verify on Basescan'.",
    input_schema: { type: "object", properties: { project: { type: "string" }, stack: { type: "string" } }, required: ["project"] },
  },
  {
    name: "blue_analytics",
    description: "Live performance metrics for a Base token (DexScreener) + interpretation — momentum, liquidity health, growth signals. Use when user asks for 'analytics', 'metrics', 'stats', 'how is X performing'.",
    input_schema: { type: "object", properties: { target: { type: "string", description: "Base token address (0x…)" }, focus: { type: "string" } }, required: ["target"] },
  },
  {
    name: "blue_simulate",
    description: "Bull/base/bear scenario modeling for a Base decision (tokenomics, fee model, growth). Use when user asks to 'simulate', 'model', 'what if', 'project outcomes'.",
    input_schema: { type: "object", properties: { scenario: { type: "string" }, params: { type: "string" } }, required: ["scenario"] },
  },
  {
    name: "blue_stream",
    description: "Live snapshot feed of Base onchain activity — trending/new pools, TVL, real prices. Use when user asks 'what's happening on Base now', 'live feed', 'what's moving'.",
    input_schema: { type: "object", properties: { feed: { type: "string", description: "movers | new | all" } } },
  },
  {
    name: "hub_b20_analyze",
    description: "Explain B20 token standard, variants (Asset/Stablecoin), roles, policies, and compliance features. Use when user asks about B20 architecture, how B20 works, B20 roles/policies, or wants to understand the Beryl upgrade.",
    input_schema: {
      type: "object",
      properties: {
        question: { type: "string", description: "The B20 question or topic to explain" },
        mode: { type: "string", enum: ["guide", "roles", "policy", "analyze", "compare", "full"], description: "Optional: specific aspect to focus on" },
      },
    },
  },
  {
    name: "hub_b20_launch",
    description: "Open B20 token launch form. User fills name, symbol, variant (asset/stablecoin), optional decimals/supply_cap/currency_code. PRIMARY action: wallet-signed createB20 Factory transaction to deploy directly on Sepolia/mainnet. SECONDARY option: Foundry deployment scripts. Trigger on: 'launch b20', 'b20 launch', 'deploy b20', 'create b20', 'b20 token deploy', or any B20 deploy/launch/create intent.",
    input_schema: {
      type: "object",
      properties: {
        name:          { type: "string", description: "Token name" },
        symbol:        { type: "string", description: "Token symbol" },
        variant:       { type: "string", enum: ["asset", "stablecoin"] },
        decimals:      { type: "number" },
        supply_cap:    { type: "string" },
        currency_code: { type: "string" },
      },
      required: [],
    },
  },
  {
    name: "hub_b20_inspect",
    description: "Inspect a B20 token's live on-chain state — reads real data from Base RPC via multicall, zero LLM. Returns: isB20 flag, name/symbol/decimals, totalSupply, supplyCap (uncapped sentinel detected), variant (ASSET/STABLECOIN), pause status per feature (TRANSFER/MINT/BURN), and policy IDs per scope (transferSender/transferReceiver/transferExecutor/mintReceiver). Use when the user provides a token address and asks: 'is this B20?', 'check this token', 'is it paused?', 'what's the supply cap?', 'inspect B20 state', or 'what policy does this have?'.",
    input_schema: {
      type: "object",
      properties: {
        address: { type: "string", description: "0x-prefixed B20 token address on Base (40 hex chars)" },
        network: { type: "string", enum: ["mainnet", "sepolia"], description: "mainnet (default) or sepolia" },
      },
      required: ["address"],
    },
  },
  {
    name: "hub_b20_manage",
    description: "Open the B20 MANAGE card — a wallet-signed control panel for an EXISTING B20 token. Use for ANY mint / burn / pause / unpause / set-policy / grant-or-revoke-role / update-supply-cap / update-metadata intent on a specific token address (e.g. 'mint 10000 tokens on 0x…', 'burn supply', 'pause transfers', 'grant MINT role', 'set policy', 'update cap', 'manage b20 0x…'). The card loads the token's live on-chain state plus the connected wallet's roles and renders ONLY the actions that wallet is authorized for; every action is signed in the user's own wallet (non-custodial). NEVER answer mint/manage with cast commands, --private-key flags, or Basescan write-contract steps — always open this card. Requires a token address; default network mainnet unless the user says sepolia.",
    input_schema: {
      type: "object",
      properties: {
        address: { type: "string", description: "0x-prefixed B20 token address to manage (40 hex chars)" },
        network: { type: "string", enum: ["mainnet", "sepolia"], description: "mainnet (default) or sepolia" },
        memo: { type: "string", description: "OPTIONAL onchain memo (≤31 chars, e.g. 'INV-2026-001') attached to a mint/burn via mintWithMemo/burnWithMemo. Pass ONLY if the user explicitly gave a memo / order ID / payment ref string. Never invent one." },
      },
      required: ["address"],
    },
  },
  {
    name: "check_memo",
    description: "Look up the onchain memo attached to a B20 transaction. Use when user asks: 'check memo of tx 0x...', 'what memo was in this tx', 'look up payment reference for tx 0x...'. CRITICAL: pass txHash ONLY if user gave one explicitly. Never invent. Reply with the memo string from result, or 'no memo' if not found.",
    input_schema: {
      type: "object",
      properties: {
        txHash:  { type: "string", description: "0x-prefixed transaction hash (66 chars) to read the Memo event from" },
        network: { type: "string", enum: ["base", "baseSepolia"], description: "base (mainnet) or baseSepolia (default)" },
      },
      required: ["txHash"],
    },
  },
  {
    name: "check_balance",
    description: "Check the CONNECTED wallet's live on-chain balance on Base — native ETH plus major tokens (USDC, WETH, cbBTC). Reads REAL on-chain state via a single multicall; ZERO LLM. Use when the user asks: 'check my balance', 'how much ETH do I have', \"what's my USDC balance\", 'show my balance', 'my wallet balance', 'what do I hold'. CRITICAL: only call when a wallet is connected — it auto-uses the connected address (no address argument). NEVER invent or estimate balances; reply with the EXACT figures from the result and do NOT add USD values (there is no price feed).",
    input_schema: {
      type: "object",
      properties: {
        network: { type: "string", enum: ["base", "baseSepolia"], description: "base (mainnet) or baseSepolia (default)" },
      },
      required: [],
    },
  },
];

// ─── Venice tools (OpenAI function-calling format) ───────────────────────────
// Mirrors HUB_TOOLS but wrapped in { type: "function", function: {...} }
const VENICE_TOOLS = HUB_TOOLS.map(t => ({
  type: "function" as const,
  function: { name: t.name, description: t.description, parameters: t.input_schema },
}));

// ─── Tool → internal API mapping ──────────────────────────────────────────────

const TOOL_ENDPOINT: Record<string, string> = {
  hub_token_pick:       "token-pick-signal",
  hub_narrative:        "narrative-position",
  hub_whale_signal:     "whale-copy-signal",
  hub_deep_analysis:    "deep-analysis",
  hub_honeypot:         "honeypot-check",
  hub_risk_gate:        "risk-gate",
  hub_market_fit:       "market-fit",
  hub_competitor_scan:  "competitor-scan",
  hub_investor_memo:    "investor-memo",
  hub_fundraise_timing: "fundraise-timing",
  hub_base_grant:       "base-grant-finder",
  hub_builder_score:    "builder-score",
  hub_repo_health:      "repo-health",
  hub_ecosystem:        "ecosystem-digest",
  hub_agent_score:      "agent-score",
  hub_aml:              "aml-screen",
  hub_whale_tracker:    "whale-tracker",
  hub_dex_flow:         "dex-flow",
  hub_airdrop:          "airdrop-check",
  hub_crypto_rpc:       "crypto-rpc",
  hub_token_price:      "token-price",
  // Blue first-party suite
  blue_monitor:         "blue-monitor",
  blue_registry:        "blue-registry",
  blue_research:        "blue-research",
  blue_compose:         "blue-compose",
  blue_deploy:          "blue-deploy",
  blue_analytics:       "blue-analytics",
  blue_simulate:        "blue-simulate",
  blue_stream:          "blue-stream",
  hub_b20_inspect:      "b20-inspect",
};

// ─── Internal Hub tool caller ─────────────────────────────────────────────────

interface ToolCallResult {
  text:     string;
  result?:  unknown;
  /**
   * Credits actually debited from the user's ledger for this tool call.
   * Read off the X-Credits-Debited response header set by the x402 route.
   * Zero for free/non-priced tools (e.g. hub_crypto_rpc) or guest sessions.
   */
  credits?: number;
  /**
   * Set when the chat user's credit ledger couldn't cover the tool's cost.
   * Surfaced upstream so the chat stream can emit an `insufficient_credits`
   * SSE event instead of silently swallowing the failure.
   */
  insufficient?: { needed: number; balance: number; tool: string };
  /**
   * Set when a paid tool was requested without a connected wallet (guest). The
   * synthesis step short-circuits to a "connect wallet" message rather than
   * letting the model fabricate a result from training data.
   */
  walletRequired?: boolean;
}

// Shown (verbatim, no model synthesis) when a guest requests a paid Hub tool —
// the real-data tools (live prices, scans, on-chain reads) are the only thing
// we can actually gate; the model's free-chat knowledge answers aren't.
const WALLET_REQUIRED_MSG =
  "🔒 This needs a connected wallet.\n\nConnect your wallet — and hold $BLUEAGENT for a daily credit allowance — to run real-data Hub tools like this. Guests get free chat; live-data tools require a wallet.";

async function callHubTool(
  toolName: string,
  args:     Record<string, unknown>,
  // Connected wallet of the chat user. When present, the x402 route debits
  // toolCreditCost(toolId, tier) from their credit ledger instead of free-
  // bypassing on the dev's pocket.
  userAddress?: string,
  // True when this chat request came from an authorized server job (cron),
  // proven by the internal key. Lets paid tools free-bypass for cron only.
  isInternal = false,
): Promise<ToolCallResult> {
  // Client-rendered marker tools — no server endpoint. The chat UI reads the
  // result.kind and renders an interactive card.
  if (toolName === "prepare_token_launch") {
    // Preview only — the LaunchCard takes an explicit user confirmation before
    // it POSTs to /api/launch-token. We never deploy from here.
    return {
      text: "Token-launch card rendered. The card shows all details — do NOT restate them as a table and do NOT quote any gas/ETH cost (gas is sponsored). Reply with one short line: tell the user to review and hit Launch in the card.",
      result: { kind: "token_launch", ...args },
    };
  }
  if (toolName === "prepare_yield") {
    // Marker only — the MoveToYieldCard collects amount/network/action and the
    // user SIGNS approve+supply (or withdraw) in their own wallet. We never
    // move funds from here.
    return {
      text: "Move-to-yield card rendered. The card shows the network, amount and Supply/Withdraw action — the user reviews and SIGNS in their own wallet (non-custodial). Do NOT restate numbers as a table, do NOT claim funds were moved, and do NOT quote an APY. Reply with one short line: tell the user to review and sign in the card.",
      result: { kind: "yield_move", ...args },
    };
  }
  if (toolName === "prepare_send") {
    // Marker only — the SendCard resolves the recipient/Basename and the user
    // SIGNS the USDC/ETH transfer in their own wallet. We never move funds.
    return {
      text: "Send/Pay card rendered. The card shows recipient, amount and asset — the user reviews and SIGNS the transfer in their own wallet (non-custodial). Do NOT claim funds were sent and do NOT restate the recipient as if confirmed. Reply with one short line: tell the user to review the recipient + amount and sign in the card.",
      result: { kind: "send", ...args },
    };
  }
  if (toolName === "hub_b20_launch") {
    // Client-rendered marker — B20LaunchCard handles form + script generation
    // entirely in the browser. No server execution, no funds moved.
    return {
      text: "B20 launch form rendered. The card is pre-filled with the token details — the user can edit fields and click Generate Scripts to get the foundry.toml, deploy script, and CLI commands. Do NOT restate the fields as a table. Reply with one short line: tell the user to review the form and click Generate Scripts.",
      result: { kind: "b20_launch", ...args },
    };
  }
  if (toolName === "hub_b20_manage") {
    // Client-rendered marker — B20ManageCard loads the token's on-chain state +
    // the connected wallet's roles and renders the role-gated ManagePanel. Every
    // action (mint/burn/pause/policy/role/cap) is signed in the user's own wallet.
    // No server execution here, no private keys, no funds moved.
    return {
      text: "B20 manage card rendered. The card loads the token's live state and shows only the actions the connected wallet is authorized for — the user signs each action in their own wallet (non-custodial). Do NOT output cast commands, private keys, or Basescan write steps, and do NOT restate the actions as a table. Reply with one short line: tell the user to use the manage card above to sign their action.",
      result: { kind: "b20_manage", ...args },
    };
  }
  if (toolName === "check_memo") {
    // Server-executed read: look up the B20 Memo event on a tx hash. No payment,
    // no signing — just an RPC read. Returns a memo_result the UI renders inline.
    const txHash  = typeof args.txHash === "string" ? args.txHash.trim() : "";
    const network = typeof args.network === "string" ? args.network : "baseSepolia";
    const r = await checkMemo(txHash, network);
    const text = r.found
      ? `Memo found: "${r.memo}". Reply with one short line stating the memo string. The result card shows the tx link.`
      : r.status === "invalid"
        ? "Invalid transaction hash. Reply with one short line telling the user the hash isn't valid."
        : r.status === "pending"
          ? "Transaction not found or not yet mined on that network. Reply with one short line saying so."
          : "No memo found in this transaction. Reply with one short line: 'no memo'.";
    return {
      text,
      result: { kind: "memo_result", found: r.found, memo: r.memo, caller: r.caller, txHash: r.txHash, network: r.network, txUrl: r.txUrl, status: r.status },
    };
  }
  if (toolName === "check_balance") {
    // Server-executed read of the CONNECTED wallet's on-chain balances. No
    // payment, no signing — one multicall. Honest: no USD value (no price feed).
    if (!userAddress || !/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
      return {
        text: "No wallet is connected. Reply with one short line asking the user to connect their wallet first — do NOT invent any balance.",
        result: { kind: "balance_result", connected: false, address: "", network: "sepolia", balances: [] },
      };
    }
    const network = typeof args.network === "string" ? args.network : "base";
    const r = await checkBalance(userAddress, network);
    const text = r.error
      ? `Balance lookup failed: ${r.error}. Reply with one short line telling the user it couldn't be read; do NOT invent figures.`
      : `Balances read on-chain for the connected wallet. The result card shows them. Reply with ONE short line stating the exact ETH${r.balances.some(b => b.symbol === "USDC" && b.raw !== "0") ? " + USDC" : ""} figures from the result — never invent numbers and never add USD values.`;
    return {
      text,
      result: { kind: "balance_result", connected: true, address: r.address, network: r.network, explorer: r.explorer, addressUrl: r.addressUrl, balances: r.balances, error: r.error },
    };
  }

  const endpoint = TOOL_ENDPOINT[toolName];
  if (!endpoint) return { text: `[Unknown tool: ${toolName}]` };

  // Internal bypass: call /api/x402/<id> directly with X-Blue-Internal header.
  // If userAddress is set, the x402 route will additionally debit credits.
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (INTERNAL_KEY)  headers["X-Blue-Internal"] = INTERNAL_KEY;
  if (userAddress && /^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
    headers["X-Blue-User"] = userAddress;
  } else if (isInternal) {
    // Authorized server job (cron) with no end-user → may free-bypass paid
    // tools. Set only when the inbound /api/chat request carried the internal
    // key, so a browser guest can never reach this branch.
    headers["X-Blue-Service"] = "internal";
  }

  // Free utility tools route directly (no x402 payment gate). These are
  // public-ish data providers we proxy ourselves (Venice RPC, CoinGecko).
  // Everything else still flows through /api/x402/<endpoint>.
  const FREE_DIRECT: Record<string, string> = {
    hub_crypto_rpc:  "/api/crypto-rpc",
    hub_token_price: "/api/token-price",
  };
  const apiPath = FREE_DIRECT[toolName]
    ? `${BASE_URL}${FREE_DIRECT[toolName]}`
    : `${BASE_URL}/api/x402/${endpoint}`;

  try {
    const res = await fetch(apiPath, {
      method: "POST",
      headers,
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(30_000),
    });

    if (res.status === 402) {
      // Distinguish credit-ledger 402 from "payment gate not bypassed" 402:
      // ours carries code: "INSUFFICIENT_CREDITS" + a needed field.
      const data = await res.json().catch(() => ({})) as {
        code?: string; needed?: number;
      };
      if (data?.code === "WALLET_REQUIRED") {
        // Guest tried a paid tool. Flag it so the stream short-circuits to a
        // fixed "connect wallet" message — models can't be trusted to relay it.
        return {
          text: `[${toolName}: requires a connected wallet]`,
          walletRequired: true,
        };
      }
      if (data?.code === "INSUFFICIENT_CREDITS" && typeof data.needed === "number") {
        return {
          text: `[${toolName}: not enough credits — need ${data.needed}, top up to continue]`,
          insufficient: { needed: data.needed, balance: 0, tool: toolName },
        };
      }
      return { text: `[${toolName}: payment required — set INTERNAL_SERVICE_KEY env var to enable]` };
    }
    if (!res.ok) {
      return { text: `[${toolName}: service returned ${res.status} — answering from knowledge]` };
    }

    const data = await res.json().catch(() => null);
    // Unwrap nested { result: ... } if present
    const payload = (data as Record<string, unknown>)?.result ?? data;
    const text = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
    // Surface the actual credit debit so the chat UI can show the real
    // total spend (chat message + tool calls), not just the message cost.
    const credits = Number(res.headers.get("x-credits-debited") ?? 0) || 0;
    return { text, result: payload, credits };
  } catch (e) {
    return { text: `[${toolName}: unavailable (${(e as Error).message}) — answering from knowledge]` };
  }
}

// ─── Venice Phase 1: non-streaming tool detection ────────────────────────────

interface VeniceToolCall {
  id: string; type: "function";
  function: { name: string; arguments: string };
}
interface VenicePhase1Resp {
  choices: Array<{ message: { tool_calls?: VeniceToolCall[] }; finish_reason: string }>;
}

async function callVenicePhase1(
  apiKey:          string,
  modelId:         string,
  openaiMsgs:      object[],
  maxTokens:       number,
  enableWebSearch: boolean,
  forceTool?:      string,
): Promise<VenicePhase1Resp | null> {
  try {
    const res = await fetch(VENICE_API, {
      method:  "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model:       modelId,
        messages:    openaiMsgs,
        tools:       VENICE_TOOLS,
        tool_choice: forceTool
          ? { type: "function", function: { name: forceTool } }
          : "auto",
        stream:      false,
        max_tokens:  Math.min(maxTokens, 1024), // intent only — keep short
        venice_parameters: {
          include_venice_system_prompt: false,
          ...(enableWebSearch ? { enable_web_search: "on" } : {}),
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    return await res.json() as VenicePhase1Resp;
  } catch { return null; }
}

// ─── Venice Phase 2: tool synthesis stream ────────────────────────────────────

async function veniceToolStream(
  apiKey:          string,
  modelId:         string,
  openaiMsgs:      object[],
  toolCalls:       VeniceToolCall[],
  maxTokens:       number,
  enableWebSearch: boolean,
  // Connected wallet — forwarded to callHubTool so each tool invocation
  // debits credits from the user's ledger rather than free-bypassing.
  userAddress?:    string,
): Promise<Response> {
  const enc = new TextEncoder();

  // Shared <think> parser (same logic as callVeniceStream)
  function makeThinkParser(controller: ReadableStreamDefaultController) {
    let textBuf = ""; let inThink = false;
    const emit = (obj: object) =>
      controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
    function flush(isFinal = false) {
      let guard = 0;
      while (textBuf.length > 0 && guard++ < 200) {
        if (!inThink) {
          const si = textBuf.indexOf("<think>");
          if (si === -1) {
            const safe = isFinal ? textBuf : textBuf.slice(0, Math.max(0, textBuf.length - 6));
            if (safe) { emit({ delta: { text: safe } }); textBuf = textBuf.slice(safe.length); }
            break;
          }
          if (si > 0) emit({ delta: { text: textBuf.slice(0, si) } });
          textBuf = textBuf.slice(si + 7); inThink = true; emit({ type: "thinking_start" });
        } else {
          const ei = textBuf.indexOf("</think>");
          if (ei === -1) {
            const safe = isFinal ? textBuf : textBuf.slice(0, Math.max(0, textBuf.length - 7));
            if (safe) { emit({ type: "thinking_delta", text: safe }); textBuf = textBuf.slice(safe.length); }
            break;
          }
          if (ei > 0) emit({ type: "thinking_delta", text: textBuf.slice(0, ei) });
          textBuf = textBuf.slice(ei + 8); inThink = false; emit({ type: "thinking_end" });
        }
      }
    }
    return { push: (chunk: string) => { textBuf += chunk; flush(); }, end: () => flush(true) };
  }

  const merged = new ReadableStream({
    async start(controller) {
      const emit = (obj: object) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        // 1. tool_start events
        for (const tc of toolCalls)
          emit({ type: "tool_start", tool: tc.function.name });

        // 2. Execute tools in parallel
        const t0 = Date.now();
        const veniceOutputs = await Promise.all(toolCalls.map(async tc => {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(tc.function.arguments); } catch {}
          const out = await callHubTool(tc.function.name, args, userAddress);
          return { tc, out };
        }));
        const elapsed = Date.now() - t0;

        // Guest hit a paid tool → emit the fixed connect-wallet message and stop,
        // so the model never fabricates a result from training data.
        if (veniceOutputs.some(({ out }) => out.walletRequired)) {
          for (const { tc } of veniceOutputs)
            emit({ type: "tool_done", tool: tc.function.name, ms: elapsed, result: null, credits: 0 });
          // Signal the block so the client refunds the message cost — the guest
          // got no answer, just the connect-wallet wall, so they shouldn't pay.
          emit({ type: "wallet_required" });
          emit({ delta: { text: WALLET_REQUIRED_MSG } });
          controller.enqueue(enc.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }

        const toolResults = veniceOutputs.map(({ tc, out }) => ({
          role: "tool" as const, tool_call_id: tc.id, content: out.text,
        }));

        // 3. tool_done events (include raw result for card rendering).
        //    If the tool came back with an insufficient-credits signal,
        //    emit a dedicated event so the chat UI can render a top-up CTA
        //    inline alongside the regular result placeholder.
        for (const { tc, out } of veniceOutputs) {
          emit({
            type:    "tool_done",
            tool:    tc.function.name,
            ms:      elapsed,
            result:  out.result,
            credits: out.credits ?? 0,
          });
          if (out.insufficient) {
            emit({
              type:    "insufficient_credits",
              kind:    "tool",
              tool:    out.insufficient.tool,
              needed:  out.insufficient.needed,
              balance: out.insufficient.balance,
            });
          }
        }

        // 4. Phase 2 streaming synthesis
        const phase2Msgs = [
          ...openaiMsgs,
          { role: "assistant", content: null, tool_calls: toolCalls },
          ...toolResults,
        ];

        let streamRes: Response;
        try {
          streamRes = await fetch(VENICE_API, {
            method:  "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: modelId, messages: phase2Msgs, stream: true, max_tokens: maxTokens,
              venice_parameters: { include_venice_system_prompt: false,
                ...(enableWebSearch ? { enable_web_search: "on" } : {}) },
            }),
            signal: AbortSignal.timeout(60_000),
          });
        } catch (e) {
          emit({ delta: { text: "Tool temporarily unavailable. Please try again." } });
          controller.enqueue(enc.encode("data: [DONE]\n\n")); controller.close(); return;
        }
        if (!streamRes.ok) {
          const err = await streamRes.text();
          emit({ delta: { text: `[Venice error ${streamRes.status}: ${err.slice(0, 100)}]` } });
          controller.enqueue(enc.encode("data: [DONE]\n\n")); controller.close(); return;
        }

        // Pipe with <think> parsing
        const think = makeThinkParser(controller);
        const reader = streamRes.body!.getReader(); const dec = new TextDecoder(); let rawBuf = "";
        try {
          while (true) {
            const { done, value } = await reader.read(); if (done) break;
            rawBuf += dec.decode(value, { stream: true });
            const lines = rawBuf.split("\n"); rawBuf = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const raw = line.slice(6).trim();
              if (raw === "[DONE]") { think.end(); controller.enqueue(enc.encode("data: [DONE]\n\n")); continue; }
              try {
                const p = JSON.parse(raw) as { choices?: { delta?: { content?: string } }[] };
                const chunk = p?.choices?.[0]?.delta?.content ?? "";
                if (chunk) think.push(chunk);
              } catch {}
            }
          }
          think.end();
        } finally { controller.close(); }
      } catch (e) { controller.error(e); }
    },
  });

  return new Response(merged, { headers: SSE_HEADERS });
}

// ─── Slash command → system prompt injection ─────────────────────────────────
// Only /credits and /help remain as slash commands.
// /skill is handled entirely client-side (ChatContext.tsx) — never reaches the API.
// All other commands (/idea /build /audit /scan etc.) are now natural language.

function extractCommand(messages: LLMMessage[]): { cmd: string; args: string } | null {
  const last = messages[messages.length - 1];
  if (last?.role !== "user" || typeof last.content !== "string") return null;
  const text = last.content.trim();

  // Slash command (exact prefix match)
  const match = text.match(/^\/(\w+)(?:\s+([\s\S]*))?$/);
  if (match) {
    const cmd = match[1].toLowerCase();
    if (cmd in COMMAND_PROMPTS) return { cmd, args: (match[2] ?? "").trim() };
  }

  // NL intent detection — only short messages to avoid false positives
  const lower = text.toLowerCase().replace(/[?!.,]/g, "").trim();

  // credits intent — note: "balance" alone is NOT here. Bare "my balance" /
  // "check my balance" means the on-chain WALLET balance (handled by the
  // check_balance tool), not credits. Only fire credits when "credit(s)" is
  // explicitly present, otherwise we'd hijack wallet-balance queries into the
  // knowledge-only /credits command and the balance card would never render.
  if (
    text.length < 100 &&
    /\bcredits?\b/.test(lower)
  ) {
    return { cmd: "credits", args: text };
  }

  // help intent
  if (
    text.length < 60 &&
    /^(help|help me|what can you do|what do you do|your capabilities|how do i use this|how does this work|what can i ask)/.test(lower)
  ) {
    return { cmd: "help", args: "" };
  }

  return null;
}

/**
 * True when the last user message is asking for their on-chain WALLET balance.
 * Used to force the check_balance tool (tool_choice) so the model reliably
 * emits a real tool_use block — otherwise Sonnet sometimes narrates
 * "I'll check your balance…" as plain text and the result card never renders.
 * Deliberately excludes "credit(s)" so it never collides with the /credits flow.
 */
function wantsWalletBalance(messages: LLMMessage[]): boolean {
  const last = messages[messages.length - 1];
  if (last?.role !== "user" || typeof last.content !== "string") return false;
  const t = last.content.toLowerCase();
  if (t.length > 120 || /\bcredits?\b/.test(t)) return false;
  return /\bbalance\b/.test(t)
      || /\bhow much (eth|usdc|money)\b/.test(t)
      || /what.?s in my wallet\b/.test(t)
      || /\bwallet holdings?\b/.test(t);
}

const COMMAND_PROMPTS: Record<string, string> = {
  credits: `## COMMAND: /credits
Show the user their credit system status. Format it cleanly:

**Credit Tiers**
| Tier | BLUE Required | Credits/day | Discount |
|------|--------------|-------------|---------|
| Guest | 0 | 30 | — |
| Starter | 500K | 500 | — |
| Pro | 2M | 2,000 | 20% off Hub |
| Max | 10M | ∞ | 40% off Hub |

**How to earn more credits:**
- Hold $BLUEAGENT on Base → credits refresh daily automatically
- Buy $BLUEAGENT: click "Buy $BLUEAGENT" in the sidebar to get started
- $BLUEAGENT contract: 0xf895783b2931c919955e18b5e3343e7c7c456ba3 (Base)

Keep it short, practical, and actionable.`,

  help: `## COMMAND: /help
Blue Chat understands natural language — no commands needed.

Try asking:
"build me a token launchpad on Base"
"is this token safe: 0x..."
"best APY on Base right now?"
"launch a token called BlueBot"
"deploy a B20 stablecoin called vUSD"
"what's the narrative on Base this week?"
"analyze this B20 contract: 0x..."
"screen this wallet for AML risks: 0x..."
"compare Aave vs Morpho yields"
"write a pitch for my Base project"

Type /credits to check balance.
Type /skill install <url> for custom skills.`,
};

// ─── Venice direct stream (no tools) ─────────────────────────────────────────

async function callVeniceStream(
  apiKey:          string,
  modelId:         string,
  openaiMsgs:      object[],
  maxTokens:       number,
  enableWebSearch: boolean = false,
): Promise<Response> {
  let veniceRes: Response;
  try {
    veniceRes = await fetch(VENICE_API, {
      method:  "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model:      modelId,
        messages:   openaiMsgs,
        stream:     true,
        max_tokens: maxTokens,
        venice_parameters: {
          include_venice_system_prompt: false,
          ...(enableWebSearch ? { enable_web_search: "on" } : {}),
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    return textToSSE("AI service temporarily unavailable. Try a different model.");
  }

  if (!veniceRes.ok) {
    const err = await veniceRes.text();
    const hint = veniceRes.status === 401
      ? "Venice API key is invalid or expired — please contact support."
      : veniceRes.status === 429
      ? "Venice rate limit hit. Try again in a moment."
      : `Venice error ${veniceRes.status}: ${err.slice(0, 120)}`;
    return textToSSE(`[${hint}]`);
  }

  // Transform OpenAI SSE → Blue SSE with <think> block extraction
  //   data: { type: "thinking_start" }
  //   data: { type: "thinking_delta", text: "..." }
  //   data: { type: "thinking_end" }
  //   data: { delta: { text: "..." } }     ← normal content
  const encoder = new TextEncoder();
  const transformed = new ReadableStream({
    async start(controller) {
      const reader  = veniceRes.body!.getReader();
      const decoder = new TextDecoder();
      let rawBuf  = "";
      let textBuf = "";
      let inThink = false;

      const emit = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      // Flush textBuf through state machine — routes text to thinking vs content
      function flush(isFinal = false) {
        let guard = 0;
        while (textBuf.length > 0 && guard++ < 200) {
          if (!inThink) {
            const si = textBuf.indexOf("<think>");
            if (si === -1) {
              // Keep last 6 chars buffered in case "<think>" spans chunks
              const safe = isFinal ? textBuf : textBuf.slice(0, Math.max(0, textBuf.length - 6));
              if (safe) { emit({ delta: { text: safe } }); textBuf = textBuf.slice(safe.length); }
              break;
            }
            if (si > 0) emit({ delta: { text: textBuf.slice(0, si) } });
            textBuf = textBuf.slice(si + 7);
            inThink = true;
            emit({ type: "thinking_start" });
          } else {
            const ei = textBuf.indexOf("</think>");
            if (ei === -1) {
              const safe = isFinal ? textBuf : textBuf.slice(0, Math.max(0, textBuf.length - 7));
              if (safe) { emit({ type: "thinking_delta", text: safe }); textBuf = textBuf.slice(safe.length); }
              break;
            }
            if (ei > 0) emit({ type: "thinking_delta", text: textBuf.slice(0, ei) });
            textBuf = textBuf.slice(ei + 8);
            inThink = false;
            emit({ type: "thinking_end" });
          }
        }
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          rawBuf += decoder.decode(value, { stream: true });
          const lines = rawBuf.split("\n");
          rawBuf = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (raw === "[DONE]") {
              flush(true);
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              continue;
            }
            try {
              const parsed = JSON.parse(raw) as { choices?: { delta?: { content?: string } }[] };
              const chunk  = parsed?.choices?.[0]?.delta?.content ?? "";
              if (chunk) { textBuf += chunk; flush(); }
            } catch {}
          }
        }
        flush(true); // drain on stream end
      } finally {
        controller.close();
      }
    },
  });

  return new Response(transformed, { headers: SSE_HEADERS });
}

// ─── Text → SSE stream ────────────────────────────────────────────────────────

const SSE_HEADERS = {
  "Content-Type":      "text/event-stream",
  "Cache-Control":     "no-cache",
  "X-Accel-Buffering": "no",
};

function textToSSE(text: string, prefixEvents: unknown[] = []): Response {
  const encoder = new TextEncoder();
  const stream  = new ReadableStream({
    start(controller) {
      // Emit any pre-events (e.g. web_search_used trust chip) before the
      // text chunks so the UI renders them above the streamed body.
      for (const ev of prefixEvents) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
      }
      // Chunk into ~40-char pieces for a natural stream feel
      const size = 40;
      for (let i = 0; i < text.length; i += size) {
        const chunk = text.slice(i, i + size);
        const line  = `data: ${JSON.stringify({ delta: { text: chunk } })}\n\n`;
        controller.enqueue(encoder.encode(line));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type LLMMessage = { role: string; content: string | unknown[] };

interface Attachment {
  name:     string;
  mimeType: string;
  size:     number;
  data:     string;
  isText:   boolean;
}

// ─── Inject file attachments into last user message ───────────────────────────

function injectAttachments(messages: LLMMessage[], attachments: Attachment[], provider: string): LLMMessage[] {
  if (!attachments.length) return messages;
  const msgs = [...messages];
  const last  = msgs[msgs.length - 1];
  if (!last || last.role !== "user") return msgs;

  const textFiles  = attachments.filter(a => a.isText);
  const imageFiles = attachments.filter(a => !a.isText && a.mimeType.startsWith("image/"));
  const pdfFiles   = attachments.filter(a => !a.isText && a.mimeType === "application/pdf");

  const baseText = typeof last.content === "string" ? last.content : "";

  // Always prepend text/code file contents inline
  const textBlocks = textFiles.map(f =>
    `\n\n--- File: ${f.name} ---\n${f.data}\n--- End of ${f.name} ---`
  ).join("");

  if (provider === "venice") {
    // OpenAI multimodal format
    const contentParts: unknown[] = [];
    if (baseText || textBlocks) {
      contentParts.push({ type: "text", text: (baseText + textBlocks).trim() });
    }
    for (const img of imageFiles) {
      contentParts.push({
        type: "image_url",
        image_url: { url: `data:${img.mimeType};base64,${img.data}` },
      });
    }
    for (const pdf of pdfFiles) {
      // Venice supports PDF as base64 image_url with application/pdf
      contentParts.push({
        type: "image_url",
        image_url: { url: `data:application/pdf;base64,${pdf.data}` },
      });
    }
    msgs[msgs.length - 1] = { role: "user", content: contentParts.length ? contentParts : baseText + textBlocks };
  } else {
    // Anthropic multimodal format
    const contentParts: unknown[] = [];
    if (baseText || textBlocks) {
      contentParts.push({ type: "text", text: (baseText + textBlocks).trim() });
    }
    for (const img of imageFiles) {
      contentParts.push({
        type: "image",
        source: { type: "base64", media_type: img.mimeType, data: img.data },
      });
    }
    for (const pdf of pdfFiles) {
      contentParts.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: pdf.data },
      });
    }
    msgs[msgs.length - 1] = { role: "user", content: contentParts.length ? contentParts : baseText + textBlocks };
  }

  return msgs;
}

interface LLMResponse {
  stop_reason: string;
  content: Array<{
    type:  string;
    text?: string;
    id?:   string;
    name?: string;
    input?: Record<string, unknown>;
    // Anthropic web_search server tool emits these block types inside the
    // same content array — we detect them to surface a trust chip in the UI.
    tool_use_id?: string;
    // For web_search_tool_result blocks, `content` is an array of search
    // results { url, title, encrypted_content, page_age? }.
    content?: Array<{
      type?: string;
      url?:  string;
      title?: string;
    }> | string;
  }>;
}

interface WebSearchSource { url: string; title: string }

/**
 * Extract the web_search results Anthropic baked into a Phase 1 response.
 * Returns an empty array when web_search wasn't used. Anthropic emits one
 * server_tool_use block + one web_search_tool_result block per search; the
 * URLs come from the result blocks. Deduplicates by URL because Anthropic
 * sometimes returns the same source in multiple searches per turn.
 */
function extractWebSearchSources(resp: LLMResponse): WebSearchSource[] {
  const seen = new Set<string>();
  const out: WebSearchSource[] = [];
  for (const block of resp.content) {
    if (block.type !== "web_search_tool_result" || !Array.isArray(block.content)) continue;
    for (const c of block.content) {
      if (c?.type !== "web_search_result") continue;
      const url = c.url?.trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push({ url, title: (c.title ?? url).trim() });
    }
  }
  return out.slice(0, 20); // hard cap
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { success, remaining } = await rateLimit(getIdentifier(req), "chat");
  if (!success) {
    return NextResponse.json(
      { error: "Too many requests. Slow down." },
      { status: 429, headers: { "X-RateLimit-Remaining": "0" } }
    );
  }
  void remaining;

  const apiKey = process.env.BANKR_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "BANKR_API_KEY not configured." }, { status: 500 });
  }

  let body: {
    messages?:    LLMMessage[];
    tier?:        string;
    memoryContext?: string;
    provider?:    string;
    modelId?:     string;
    webSearch?:   boolean;
    attachments?: Attachment[];
    // Connected wallet — when present, server debits credits via the unified
    // ledger (Week 2 of the credit-economics redesign). Guest sessions (no
    // address) keep the old localStorage daily-quota flow on the frontend.
    address?:     string;
    // Integration toggles + installed-skill prompt, set client-side and flowed
    // through so the system prompt gains the matching guidance sections.
    baseMcp?:     boolean;
    coinbase?:    boolean;
    skills?:      string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { messages, tier = "pro", memoryContext, provider, modelId, webSearch = false, attachments = [], address, baseMcp = false, coinbase = false, skills } = body;
  if (!messages?.length) {
    return NextResponse.json({ error: "messages array required." }, { status: 400 });
  }

  // Authorized server job (e.g. cron) — proven by the internal key, which only
  // our own server has. Lets cron free-bypass paid tools; a browser guest can't
  // forge this, so guests stay blocked from paid tools.
  const isInternalCaller = !!INTERNAL_KEY && (req.headers.get("x-blue-internal") === INTERNAL_KEY);

  // ── Credit ledger debit (connected wallets only) ──────────────────────────
  // Server fetches BLUE balance + computes credit cost server-side (frontend
  // tier is not trusted). On insufficient balance, we return an SSE stream
  // with a structured event so the chat UI can render a top-up CTA in-line.
  if (address && INTERNAL_KEY && /^0x[a-fA-F0-9]{40}$/.test(address)) {
    const debit = await debitChatCredits(address, tier);
    if (debit.kind === "insufficient") {
      return creditErrorSSE(debit.needed, debit.balance);
    }
    // debit.kind === "ok" | "skipped" → proceed normally
  }

  // ── Command injection ─────────────────────────────────────────────────────
  const detectedCmd = extractCommand(messages as LLMMessage[]);
  const cmdPrompt = detectedCmd ? COMMAND_PROMPTS[detectedCmd.cmd] : null;

  // /credits and /help are knowledge-only — no live tools needed.
  const knowledgeOnly = !!cmdPrompt;
  const modelLabel = getModelLabel(tier, modelId, provider);
  const modelLine = `## Active model\nYou are currently running as: **${modelLabel}**. When asked "what model are you?", "which AI are you?", "what are you running on?", or similar — answer precisely with this model name.`;
  const system = [
    BASE_SYSTEM,
    BANKR_AGENT_SECTION,
    B20_SECTION,
    baseMcp  ? BASE_MCP_SECTION : "",
    coinbase ? COINBASE_SECTION : "",
    skills   ? `## Installed Skills\nThe user has installed these skill packs — use their tools / knowledge when relevant:\n\n${skills}` : "",
    modelLine,
    memoryContext ?? "",
    cmdPrompt ?? "",
  ].filter(Boolean).join("\n\n");

  // Strip the /command prefix from last message so LLM only sees args
  let cleanMessages = messages as LLMMessage[];
  if (cmdPrompt) {
    // Strip the /command prefix — pass only args to the model
    cleanMessages = [
      ...messages.slice(0, -1),
      {
        role: "user",
        content: detectedCmd!.args || `Run the /${detectedCmd!.cmd} command.`,
      },
    ] as LLMMessage[];
  }

  // ── Venice provider ───────────────────────────────────────────────────────
  if (provider === "venice" && modelId) {
    const apiKey = process.env.VENICE_INFERENCE_KEY ?? process.env.VENICE_API_KEY;
    if (!apiKey) {
      return textToSSE("Please select a model: Fast · Chat · Deep Think · DeepSeek");
    }

    const veniceMessages = injectAttachments(cleanMessages, attachments, "venice");
    const maxTok     = veniceMaxTokens(modelId);
    // Grok 4 always uses web search (internet-native model)
    const autoSearch = webSearch || modelId.startsWith("grok-");
    // E2EE models skip tool use — smaller models, tool calling unreliable
    const isE2EE     = modelId.startsWith("e2ee-");

    const openaiMsgs = [
      { role: "system", content: system },
      ...veniceMessages.map((m) => ({
        role:    m.role as string,
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      })),
    ];

    if (!isE2EE && !knowledgeOnly) {
      // Phase 1: detect tool intent (skipped for pure-knowledge commands).
      // Force check_balance when the user clearly asks for their wallet balance
      // and a wallet is connected, so the balance card reliably renders.
      const forceTool =
        address && /^0x[a-fA-F0-9]{40}$/.test(address) && wantsWalletBalance(cleanMessages)
          ? "check_balance"
          : undefined;
      const phase1    = await callVenicePhase1(apiKey, modelId, openaiMsgs, maxTok, autoSearch, forceTool);
      const toolCalls = phase1?.choices?.[0]?.message?.tool_calls;
      if (toolCalls?.length) {
        return veniceToolStream(apiKey, modelId, openaiMsgs, toolCalls, maxTok, autoSearch, address);
      }
    }

    // No tools (or E2EE): direct stream
    return callVeniceStream(apiKey, modelId, openaiMsgs, maxTok, autoSearch);
  }

  // ── Inject attachments for Bankr (Anthropic) ──────────────────────────────
  cleanMessages = injectAttachments(cleanMessages, attachments, "bankr") as LLMMessage[];

  const model  = MODELS[tier as string] ?? MODELS.pro;

  const lmHeaders = {
    "x-api-key":           apiKey,
    "Content-Type":        "application/json",
    "anthropic-version":   "2023-06-01",
  };

  // ── Phase 1: intent detection (non-streaming + tools) ─────────────────────
  let firstData: LLMResponse;
  // Anthropic server-tool: web_search. Already wired up as the "Search on"
  // toggle in the chat composer (frontend sends `webSearch: true` in body).
  // When toggled, the tool is appended to the tool list so the model can
  // call it; toggle off keeps the tools array Hub-only. Anthropic bills
  // per-search; reconciliation against our credit ledger lands later.
  // Pure-knowledge commands get NO Hub tools (prevents accidental paid-tool
  // calls). web_search is still honored when the user explicitly toggled it.
  const webSearchTool = { type: "web_search_20250305", name: "web_search", max_uses: 3 };
  const ANTHROPIC_TOOLS: unknown[] = knowledgeOnly
    ? (webSearch ? [webSearchTool] : [])
    : (webSearch ? [...HUB_TOOLS, webSearchTool] : [...HUB_TOOLS]);

  // When the user clearly asks for their wallet balance AND a wallet is
  // connected, force the check_balance tool so a real tool_use block (and thus
  // the balance card) is guaranteed — instead of relying on the model to pick
  // it under tool_choice:auto, which it sometimes narrates as text instead.
  const forceBalance =
    !knowledgeOnly &&
    !!address &&
    /^0x[a-fA-F0-9]{40}$/.test(address) &&
    wantsWalletBalance(cleanMessages);

  try {
    const firstRes = await fetch(BANKR_LLM, {
      method:  "POST",
      headers: lmHeaders,
      body: JSON.stringify({
        model:      model.id,
        system,
        messages:   cleanMessages,
        tools:      ANTHROPIC_TOOLS,
        max_tokens: model.maxTokens,
        ...(forceBalance ? { tool_choice: { type: "tool", name: "check_balance" } } : {}),
      }),
    });

    if (!firstRes.ok) {
      const err = await firstRes.text();
      return NextResponse.json(
        { error: `Bankr LLM error: ${firstRes.status}`, detail: err },
        { status: firstRes.status }
      );
    }

    firstData = await firstRes.json() as LLMResponse;
  } catch (e) {
    return NextResponse.json(
      { error: `LLM request failed: ${(e as Error).message}` },
      { status: 502 }
    );
  }

  // ── Web search trust signal: extract sources Anthropic baked in ─────────
  // Done before either branch so a no-tool response still shows the chip
  // when the model used web_search but didn't trigger any hub_* tool.
  const webSearchSourceList = extractWebSearchSources(firstData);
  const webSearchSources    = webSearchSourceList.length;

  // ── No tool use: return text as SSE directly ───────────────────────────────
  if (firstData.stop_reason !== "tool_use") {
    const text = firstData.content.find((b) => b.type === "text")?.text ?? "";
    // Prefix the search-used event onto the SSE stream so the UI renders the
    // trust chip even when the message has no hub_* tool calls.
    const prefix = webSearchSources > 0
      ? [{ type: "web_search_used", provider: "anthropic", sources: webSearchSources, urls: webSearchSourceList }]
      : [];
    return textToSSE(text, prefix);
  }

  // ── Tool use: merged stream (tool events → Phase 2 stream) ───────────────
  const toolUseBlocks = firstData.content.filter((b) => b.type === "tool_use");
  const enc = new TextEncoder();

  const mergedStream = new ReadableStream({
    async start(controller) {
      try {
        // 0. web_search_used trust chip — emit first so it lands above the
        //    tool chips in the UI when the model chained web_search + hub_*.
        if (webSearchSources > 0) {
          controller.enqueue(enc.encode(
            `data: ${JSON.stringify({
              type:     "web_search_used",
              provider: "anthropic",
              sources:  webSearchSources,
              urls:     webSearchSourceList,
            })}\n\n`,
          ));
        }
        // 1. tool_start events
        for (const block of toolUseBlocks) {
          controller.enqueue(enc.encode(
            `data: ${JSON.stringify({ type: "tool_start", tool: block.name })}\n\n`
          ));
        }

        // 2. Execute tools in parallel
        const t0 = Date.now();
        const toolOutputs = await Promise.all(
          toolUseBlocks.map(async (block) => {
            const out = await callHubTool(block.name!, block.input ?? {}, address, isInternalCaller);
            return { block, out };
          })
        );
        const elapsed = Date.now() - t0;

        // Guest hit a paid tool → emit the fixed connect-wallet message and stop,
        // so the model never fabricates a result from training data.
        if (toolOutputs.some(({ out }) => out.walletRequired)) {
          for (const { block } of toolOutputs)
            controller.enqueue(enc.encode(
              `data: ${JSON.stringify({ type: "tool_done", tool: block.name, ms: elapsed, result: null, credits: 0 })}\n\n`,
            ));
          // Signal the block so the client refunds the message cost — the guest
          // got no answer, just the connect-wallet wall, so they shouldn't pay.
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: "wallet_required" })}\n\n`));
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ delta: { text: WALLET_REQUIRED_MSG } })}\n\n`));
          controller.enqueue(enc.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }

        const toolResults = toolOutputs.map(({ block, out }) => ({
          type:        "tool_result" as const,
          tool_use_id: block.id!,
          content:     out.text,
        }));

        // 3. tool_done events (include raw result for card rendering).
        //    Insufficient-credits emits a sibling SSE event so the chat
        //    UI can pop a top-up CTA without disrupting the tool stream.
        for (const { block, out } of toolOutputs) {
          controller.enqueue(enc.encode(
            `data: ${JSON.stringify({
              type:    "tool_done",
              tool:    block.name,
              ms:      elapsed,
              result:  out.result,
              credits: out.credits ?? 0,
            })}\n\n`,
          ));
          if (out.insufficient) {
            controller.enqueue(enc.encode(
              `data: ${JSON.stringify({
                type:    "insufficient_credits",
                kind:    "tool",
                tool:    out.insufficient.tool,
                needed:  out.insufficient.needed,
                balance: out.insufficient.balance,
              })}\n\n`,
            ));
          }
        }

        // 4. Phase 2 — streaming synthesis
        const secondMessages: LLMMessage[] = [
          ...cleanMessages,
          { role: "assistant", content: firstData.content },
          { role: "user",      content: toolResults },
        ];

        let streamRes: Response;
        try {
          streamRes = await fetch(BANKR_LLM, {
            method:  "POST",
            headers: lmHeaders,
            body: JSON.stringify({
              model:      model.id,
              system,
              messages:   secondMessages,
              max_tokens: model.maxTokens,
              stream:     true,
            }),
          });
        } catch (e) {
          const msg = `[LLM stream failed: ${(e as Error).message}]`;
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ delta: { text: msg } })}\n\n`));
          controller.enqueue(enc.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }

        if (!streamRes.ok) {
          const err = await streamRes.text();
          const msg = `[Stream error ${streamRes.status}: ${err.slice(0, 120)}]`;
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ delta: { text: msg } })}\n\n`));
          controller.enqueue(enc.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }

        // Pipe Phase 2 into merged stream. We also decode chunks in flight
        // to count how many text deltas actually reached the client — if
        // Anthropic returned only more tool_use blocks (chained tools we
        // don't loop yet) or any other zero-text outcome, the message would
        // otherwise render as an indefinite "thinking" state with empty
        // content. The fallback line below tells the user something useful
        // instead of stranding them.
        const reader = streamRes.body!.getReader();
        const dec = new TextDecoder();
        let sawText = false;
        let lineBuf = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
            if (sawText) continue; // skip scan once we've confirmed text
            lineBuf += dec.decode(value, { stream: true });
            // Anthropic SSE: lines like  data: {...}\n
            let idx: number;
            while ((idx = lineBuf.indexOf("\n")) !== -1) {
              const line = lineBuf.slice(0, idx);
              lineBuf = lineBuf.slice(idx + 1);
              if (!line.startsWith("data: ")) continue;
              try {
                const ev = JSON.parse(line.slice(6)) as {
                  type?: string;
                  delta?: { type?: string; text?: string };
                };
                if (
                  ev.type === "content_block_delta" &&
                  ev.delta?.type === "text_delta" &&
                  ev.delta.text
                ) {
                  sawText = true;
                  break;
                }
              } catch { /* ignore parse errors */ }
            }
          }
          if (!sawText) {
            const msg =
              "I ran the tool but the model returned no text response. " +
              "This usually means it wanted to chain another tool call — " +
              "rephrase your question or try the same prompt again.";
            controller.enqueue(enc.encode(
              `data: ${JSON.stringify({ delta: { text: msg } })}\n\n`,
            ));
          }
        } finally {
          controller.close();
        }
      } catch (e) {
        controller.error(e);
      }
    },
  });

  return new Response(mergedStream, { headers: SSE_HEADERS });
}
