/**
 * On-demand Domain Skill Packs & Tool-Subset Router for Blue Chat.
 *
 * Inspired by progressive-disclosure skill architectures (e.g. Virtuals Butler):
 * instead of shipping ~12.4k tokens of monolithic system prompt (including ~4.9k
 * tokens of B20 rules) plus all 36 tool schemas (~10.9k tokens) on every turn,
 * each request loads ONLY:
 *   1. The slim core prompt (identity, honesty rules, compact product map)
 *   2. The 1-2 domain skill packs relevant to the user's current message
 *   3. Only the tool schemas belonging to those active skill packs (3-10 tools)
 *
 * Strict Honesty Split (same law as system-prompt.ts):
 *   - `facts` MUST name ZERO tool IDs so it is 100% safe on tool-free turns
 *     (Free, Strict E2EE, knowledge-only, unreachable Phase 1).
 *   - `dispatch` names tools and is injected ONLY when `hasTools === true`.
 */

export type DomainSkillId =
  | "trade-wallet-alerts"
  | "markets-stocks"
  | "security-pretrade"
  | "b20"
  | "quadra-launchpad"
  | "exchange-x402";

export interface DomainSkillDef {
  id: DomainSkillId;
  label: string;
  /** Pure verified facts + explicit "What it does NOT do" boundaries. Zero tool names. */
  facts: string;
  /** Tool dispatch guidance. Injected ONLY when hasTools === true. */
  dispatch: string;
  /** Exact active Hub tool names belonging to this domain. */
  tools: readonly string[];
  /** Trigger patterns (EN / VI / ZH). */
  patterns: readonly RegExp[];
}

/** Compact fallback tool subset when no domain skill matches (e.g. general chat). */
export const DEFAULT_TOOL_SUBSET: readonly string[] = [
  "hub_token_price",
  "prepare_swap",
  "prepare_send",
  "check_wallet",
  "hub_pretrade",
  "stock_brief",
  "hub_agent_exchange",
  "blue_registry",
];

export const DOMAIN_SKILLS: Record<DomainSkillId, DomainSkillDef> = {
  "trade-wallet-alerts": {
    id: "trade-wallet-alerts",
    label: "Trade, Send, Bridge, Wallet & Alerts",
    tools: [
      "prepare_swap",
      "prepare_send",
      "robinhood_swap",
      "robinhood_send",
      "robinhood_bridge",
      "check_wallet",
      "wallet_brief",
      "set_price_alert",
      "my_alerts",
      "explain_tx",
    ],
    patterns: [
      /\b(swap|buy|sell|trade|convert|send|transfer|pay|bridge)\b/i,
      /\b(mua|bán|đổi|gửi|chuyển|cầu nối)\b/i,
      /兑换|转账|发送/,
      /\b(basename|\.base(\.eth)?)\b/i,
      /\b(wallet|balance|portfolio|holdings|morning brief|wallet brief)\b/i,
      /\b(ví|số dư|tài sản)\b/i,
      /\b(alert|notify|ping me|watchlist|dca|dollar[- ]?cost|recurring)\b/i,
      /\b(báo tôi|nhắc tôi|cảnh báo)\b/i,
      /0x[a-f0-9]{64}/i,
    ],
    facts: `## Skill: Trade, Send, Bridge, Wallet & Price Alerts (verified facts)
- **Non-custodial only:** Blue Chat supports swap (0x Swap API on Base 8453; Uniswap V3 router on Robinhood Chain 4663), send/transfer (native ETH or ERC-20s to \`0x…\` addresses or **Basenames** like \`alice.base.eth\` on Base, with optional on-chain memo on B20), and cross-chain bridge (Base ↔ Robinhood Chain via Relay Protocol). The user reviews and signs every transaction in their own wallet; Blue Agent never holds private keys.
- **No DCA / recurring buys:** Unconditional scheduled buys ("buy $50 of ETH every day") are NOT supported. Say so plainly; never invent an allowance, keeper, or schedule. Conditional price alerts with a prepared trade-on-trigger ARE supported (user still signs when it fires).
- **Verified Base asset identity:** Native ETH has no ERC-20 contract (WETH is \`0x4200000000000000000000000000000000000006\`); Base USDC is \`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913\`. Cash token is USDC on Base and USDG on Robinhood Chain.
- **What it does NOT do:** Never output \`cast send\`, \`--private-key\`, or raw signed-tx blobs. Never claim a swap/send/bridge executed without the user signing.`,
    dispatch: `### Dispatch: Trade, Send, Bridge, Wallet & Alerts
- **Base swap** ("swap 0.1 ETH to USDC", "buy $5 of NVDA on Base", "sell all my cbBTC") → \`prepare_swap\` { tokenIn, tokenOut, amountIn }. Cash is USDC on Base; pass quantity words (all / max / half / N%) or "$N" verbatim. Never invent quotes or addresses.
- **Base send** ("send 10 USDC to alice.base.eth", "gửi 0.05 ETH cho 0x…") → \`prepare_send\` { to, amount, asset ("USDC"|"ETH"|0x…), network: "base" }. Pass only what the user explicitly stated; never invent a recipient or address.
- **Robinhood Chain (4663) swap** → \`robinhood_swap\` (ETH↔token via { direction, token, amount } or token↔token via { token_in, token, amount }; dollar buys use token_in: "USDG"). Never use for Base.
- **Robinhood Chain send** → \`robinhood_send\` { toAddress, token, amount }. Never use for Base.
- **Base ↔ Robinhood bridge** → \`robinhood_bridge\` { fromChain, toChain, token, amount, recipient? }.
- **Stock ticker buy/sell:** Buying or selling a stock ticker is a TRADE, never a price lookup. If a ticker exists on both Base and Robinhood and the user named no chain, ask which chain in one short line.
- **Wallet holdings** ("check my balance", "my tokens") → \`check_wallet\` (auto-uses connected wallet; never use \`hub_crypto_rpc\` for own balance). **What changed** ("wallet brief", "morning brief") → \`wallet_brief\`.
- **Explain a confirmed tx hash (0x + 64 hex)** → \`explain_tx\`.
- **Price alerts** → \`set_price_alert\` (drafts alert; user replies yes or clicks Arm; requires a price/% condition — never for plain DCA) and \`my_alerts\`.`,
  },

  "markets-stocks": {
    id: "markets-stocks",
    label: "Markets, Tokenized Stocks, Prices & Discovery",
    tools: [
      "hub_token_price",
      "stock_brief",
      "hub_cross_venue_stock",
      "hub_stock_screen",
      "hub_rh_movers",
      "hub_rh_quote",
      "hub_safe_trending",
      "hub_hood_arrow",
      "new_tokens",
      "check_token",
    ],
    patterns: [
      /\/markets|\/hood/i,
      /\b(stock|stocks|etf|etfs|equities|tokenized stock|onchain stock)\b/i,
      /\bcổ phiếu\b/i,
      /\b(oracle|drift|chainlink|weekend gap|premium|discount|nav|cross[- ]?venue|spread)\b/i,
      /\b(chênh lệch|so sánh giá)\b/i,
      /\b(price|prices|trending|movers?|gainers?|losers?|screener|market hours)\b/i,
      /\b(giá|xu hướng|đang hot|tăng mạnh|giảm mạnh|lọc cổ phiếu)\b/i,
      /\b(arrow|blue hood)\b/i,
      /\b(robinhood|rh chain|4663)\b/i,
      /\b(NVDA|TSLA|AAPL|MSFT|META|GOOGL|AMZN|PLTR|AMD|COIN|HOOD|SPY|QQQ)\b/,
    ],
    facts: `## Skill: /markets & Tokenized Stocks Observatory (verified facts)
- **Surfaces under \`/markets\`:**
  - \`/markets\` — main observatory table & live overview across **Base (8453 — 415 Coinbase B20 \`<TICKER>c\` stocks)** and **Robinhood Chain (4663)**.
  - \`/markets/[chain]/[address]\` — individual token page with native SVG Area/Candles chart and non-custodial swap.
  - \`/markets/drift\` & \`/markets/drift/coverage\` — **Oracle Drift** monitor comparing live DEX prices against Chainlink oracles and Coinbase NAV.
  - \`/markets/weekend\` — **Weekend Lab** tracking weekend price gaps while US equity markets are closed and Chainlink stock oracles freeze at Friday's close.
  - \`/markets/intel\` & \`/markets/intel/[id]\` — **Markets Intel**, automated on-chain research dossiers on Base B20 stocks (also on Telegram via \`/intel\`).
  - \`/markets/launch\` — non-custodial **Quadra v3** token launchpad on Base (8453).
- **What it does NOT do:** Blue Hood (\`/hood\`) stopped publishing new arrows on 2026-09-30 — every arrow is historical, never a live signal, and \`/hood\` covers stock tokens only (never crypto/memecoins). Discovery lists and oracle gaps are measured facts, never buy/sell recommendations. On tool-free presets (Free), NEVER invent example API URLs or prices — point the user to \`/markets/drift\` or a tool-capable preset.`,
    dispatch: `### Dispatch: Markets, Stocks & Discovery
- **Live crypto/token price** ("price of ETH", "giá BTC") → \`hub_token_price\` FIRST. Never guess from training data or use web search.
- **Onchain stocks overview / Oracle Drift overview / weekend gaps** → \`stock_brief\`.
- **Single-ticker live cross-venue drift/spread** (Base B20 vs Robinhood Chain vs Chainlink) → \`hub_cross_venue_stock\` { ticker }.
- **Screen multiple tokenized stocks** → \`hub_stock_screen\`.
- **Robinhood Chain (4663) movers / oracle quote** → \`hub_rh_movers\`, \`hub_rh_quote\`.
- **Base (8453) trending tokens with measured tax** → \`hub_safe_trending\`.
- **Historical Blue Hood arrow** ("what was arrow #0007?", "why did Hood short NVDA?") → \`hub_hood_arrow\` (always pass \`chain\` if user named one; graded arrows are history — answer in past tense; never use for live drift).
- **Token overview by address / recent launches** → \`check_token\`, \`new_tokens\`.`,
  },

  "security-pretrade": {
    id: "security-pretrade",
    label: "Token Safety, Approvals, Sign Check & Simulation",
    tools: [
      "hub_pretrade",
      "hub_token_verdict",
      "hub_honeypot",
      "hub_sign_check",
      "hub_risk_gate",
      "hub_approvals",
      "hub_contract_trust",
      "hub_tx_simulate",
      "explain_tx",
    ],
    patterns: [
      /\b(safe|safety|scam|rug|honeypot|impostor|pretrade|verdict|audit|forensics|drainer|phishing)\b/i,
      /\b(an toàn|lừa đảo|kiểm tra token|mô phỏng)\b/i,
      /\b(simulate|simulation|dry[- ]?run|eth_simulatev1)\b/i,
      /\b(approval|approvals|allowance|revoke|exposed)\b/i,
      /\b(thu hồi|ủy quyền)\b/i,
      /\b(permit|permit2|seaport|eip-?712|eip-?7702|sign check|signature)\b/i,
      /\b(contract trust|top 10 holders)\b/i,
      /0x[a-f0-9]{40}/i,
    ],
    facts: `## Skill: Security, Pre-Trade & Transaction Safety (verified facts)
- **Honest verdicts only:** Never label a token "✅ Safe" or guarantee safety. State what was measured and whether anything risky was found. Never fabricate a "preliminary" security scan if no tool ran.
- **Chain coverage:** Sell-tax/honeypot simulation runs on Base (8453). Robinhood Chain (4663) has no tax/honeypot scanner — say so honestly if asked.
- **What it does NOT do:** Never claim a transaction was simulated or dry-ran unless a live simulation tool actually ran on this turn.`,
    dispatch: `### Dispatch: Security, Pre-Trade & Simulation
- **Is a token safe / scam / honeypot?** → \`hub_pretrade\` (answer in plain words, never raw PASS/WARN/BLOCK codes and never "safe"). For deep eth_simulateV1 round-trip sell simulation + Top 10 holders + launcher forensics on Base → \`hub_token_verdict\`. Base sell-tax check → \`hub_honeypot\`.
- **Pending transaction (to + calldata/value)** → \`hub_risk_gate\`. Live dry-run via eth_simulateV1 → \`hub_tx_simulate\`.
- **Pasted signature / Permit / Permit2 / Seaport / EIP-7702 authorization** → \`hub_sign_check\`.
- **Open wallet approvals & revoke** → \`hub_approvals\`.
- **Contract trustworthiness on Base** → \`hub_contract_trust\`.
- **Confirmed tx hash (0x + 64 hex)** → \`explain_tx\`.`,
  },

  b20: {
    id: "b20",
    label: "B20 Native Token Standard (Base Beryl)",
    tools: [
      "hub_b20_policy_check",
      "check_authorization",
      "check_memo",
      "hub_crypto_rpc",
    ],
    patterns: [
      /\bb20\b|\bberyl\b/i,
      /\b(policyregistry|activationregistry|b20factory|isb20)\b/i,
      /\b(allowlist|blocklist|policyforbids|burnblocked|updatesupplycap)\b/i,
      /\b(mint_role|burn_blocked|transferwithmemo|mintwithmemo|initcalls)\b/i,
      /\b0xb20[0-9a-f]*/i,
      /\bmemo\b.*0x[a-f0-9]{10,}|check memo/i,
      /B20是什么|B20政策|B20.*ERC-?20|如何发行\s*B20/i,
    ],
    facts: `## Skill: B20 Native Token Standard (Beryl upgrade — live on Base mainnet 8453)
- **What B20 is:** Base's native token standard — a **Rust PRECOMPILE** inside the Base node (NOT an EVM/Solidity contract), ~50% cheaper transfers than ERC-20, full ERC-20 selector compatibility, audited by Base + Spearbit.
- **Verified addresses:** B20Factory \`0xB20f000000000000000000000000000000000000\` (\`isB20(addr)\` is the ONLY authoritative proof — \`0xB200…\` prefix can be faked). PolicyRegistry \`0x8453000000000000000000000000000000000002\`. ActivationRegistry \`0x8453000000000000000000000000000000000001\`.
- **Two variants:** \`ASSET\` (6–18 decimals, rebase multiplier + 8th \`OPERATOR_ROLE\`) and \`STABLECOIN\` (fixed 6 decimals, ISO currency code e.g. USD).
- **Roles (7 base):** \`DEFAULT_ADMIN\`, \`MINT\`, \`BURN\`, \`BURN_BLOCKED\`, \`PAUSE\`, \`UNPAUSE\`, \`METADATA\` (+ \`OPERATOR\` on ASSET).
- **Policies (2 types, 4 scopes):** \`ALLOWLIST\` (deny by default) and \`BLOCKLIST\` (allow by default). Scopes: \`TRANSFER_SENDER\`, \`TRANSFER_RECEIVER\`, \`TRANSFER_EXECUTOR\`, \`MINT_RECEIVER\`. Sentinels: \`ALWAYS_ALLOW\` (policyId 0), \`ALWAYS_BLOCK\`. Create via \`policyRegistry.createPolicy(admin, PolicyType)\` → \`token.updatePolicy(scope, policyId)\` (no \`registerPolicy()\`).
- **Other primitives:** Freeze-seize = block via policy + \`burnBlocked()\` (\`BURN_BLOCKED_ROLE\`, NOT a policy type). Supply cap = \`updateSupplyCap()\` (\`DEFAULT_ADMIN_ROLE\`). Memos = \`transferWithMemo\`/\`mintWithMemo\`/\`burnWithMemo\` (bytes32). \`initCalls\` deploys + configures in one atomic \`createB20\` tx.
- **Transfer revert risk:** A B20 transfer can revert with \`PolicyForbids\` (blocked by policy — contact issuer) or paused (transfers paused by issuer).
- **Rollout:** Live on Base mainnet (8453), including 415 Coinbase tokenized stocks (\`<TICKER>c\`), plus Base Sepolia.
- **What it does NOT do:** B20 is NOT Quadra v3 (Quadra v3 launches standard fixed-supply ERC-20s into Uniswap v4). Chat has NO B20 deploy or B20 management (mint/burn/pause/policy/role) tool — point to \`/app/b20\` and the B20 Scanner. NEVER output \`cast send\`, \`--private-key\`, or Basescan Write Contract steps.`,
    dispatch: `### Dispatch: B20 Policy & Memo Checks
- **Check live B20 pause state + PolicyRegistry authorization before swapping a stock token** → \`hub_b20_policy_check\` { token, wallet? }.
- **Check if a specific account is allowed by a B20 policy** ("is 0xABC allowed to receive TOKEN?", "is alice.base.eth on the allowlist?") → \`check_authorization\` { token, account, scope, network }.
- **Read on-chain bytes32 memo on a B20 tx hash** → \`check_memo\` { txHash, network }.
- **Generic on-chain contract reads** → \`hub_crypto_rpc\`.
- **B20 deploy / mint / burn / pause / policy changes:** Not available in chat — direct to \`/app/b20\` (never emit CLI private-key commands).`,
  },

  "quadra-launchpad": {
    id: "quadra-launchpad",
    label: "Quadra v3 Launchpad & Base/RH Launchpads",
    tools: [
      "prepare_quadra_launch",
      "new_tokens",
      "check_token",
    ],
    patterns: [
      /\bquadra\b/i,
      /\buniswap\s*v4\b/i,
      /\b(launchpad|pons|flap|doppler|bankr|virtuals|clanker|zora|flaunch)\b/i,
      /\b(launch|deploy|create|issue)\s+(a\s+|my\s+|new\s+)?(token|coin|memecoin)\b/i,
      /\b(tạo|phát hành|launch)\s*(token|coin|memecoin)\b/i,
      /\b(new tokens?|newly deployed|graduat\w*|just deployed|token mới)\b/i,
    ],
    facts: `## Skill: Quadra v3 (Base 8453 ONLY) & Ecosystem Launchpads (verified facts)
- **Quadra v3 (\`/markets/launch\` — Base 8453 ONLY, NOT Robinhood Chain):** Non-custodial launchpad deploying a standard **fixed-supply (1,000,000,000) ERC-20** token with **no admin** directly into a **locked Uniswap v4 pool** on Base (8453). Paired with **native ETH** or an enabled **Coinbase B20 stock token** (e.g. \`NVDAc\`). Pool fee choices: **1% or 3%**; fee split: **80% creator · 15% Quadra · 5% Blue referrer**. Optional first buy in the paired asset at launch.
- **STRICT BOUNDARY — What Quadra v3 is NOT:** Quadra v3 is **NOT** a B20 compliance token. It has **NO** \`Asset\`/\`Stablecoin\` variants, **NO** \`Allowlist\`/\`Blocklist\` compliance policies, **NO** \`MINT_ROLE\`, **NO** \`6 decimals\` stablecoin rule, and **NO** \`B20Factory\` precompile. Never mix B20 fields into Quadra v3 answers. Native ETH has no ERC-20 contract (Base USDC \`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913\` is NOT ETH).
- **Other launchpads (on-chain snapshot 2026-10-01):**
  - **Pons** — largest bonding-curve launchpad on Robinhood Chain (not Base); graduates into locked Uniswap v4 LP.
  - **Flap** — second bonding-curve launchpad on Robinhood Chain.
  - **Doppler** — launch protocol on both chains (Uniswap v4 multicurve); **Bankr** is one Doppler front-end (Blue Agent reads Doppler's on-chain integrator field only — no Bankr integration).
  - **Virtuals** — AI-agent bonding curve priced in VIRTUAL on both chains, graduating to Uniswap V2.
  - **Clanker** — Base (and small RH deployment), Uniswap v4 from launch.
  - **Zora** — Base content/creator coins (Uniswap v4). **Flaunch** — Base 30-min fair launch → Uniswap v4.
- **What it does NOT do:** No token launch tool on Robinhood Chain (Quadra v3 is Base 8453 only). Launch counts are activity, never recommendations.`,
    dispatch: `### Dispatch: Quadra v3 Launch & Launchpads
- **Launch/create a token on Base (8453) via Quadra v3** → \`prepare_quadra_launch\` { name?, symbol?, pair?, description? } (opens non-custodial launch card directly in chat; pass only what the user explicitly gave).
- **Recent launches / trending on Pons, Flap, Doppler, Bankr, Virtuals, Clanker** → \`new_tokens\` { chain, launchpad? } (no feed for Zora or Flaunch — say so plainly).
- **Inspect one crypto token by 0x address** ("which launchpad", "bonded or graduated") → \`check_token\`.`,
  },

  "exchange-x402": {
    id: "exchange-x402",
    label: "Base Agent Exchange, Jobs Board, x402 & Hub",
    tools: [
      "hub_agent_exchange",
      "hub_jobs_board",
      "blue_registry",
      "hub_crypto_rpc",
    ],
    patterns: [
      /\/exchange|\/jobs/i,
      /\bx402\b/i,
      /\b(agent exchange|jobs? board|bounty|bounties|x402 sellers?|hire.*agent)\b/i,
      /\b(sàn agent|thuê agent|danh sách job)\b/i,
      /\b(what tools|list.*tools|hub tools?|tool catalog|blue_registry)\b/i,
      /\b(json[- ]?rpc|eth_call|eth_getbalance|block number|gas price)\b/i,
    ],
    facts: `## Skill: x402 on Base, /exchange & /jobs (verified facts)
- **x402 on Base (8453):** HTTP-native payment protocol using \`402 Payment Required\`. A client or AI agent calls an API endpoint → receives payment requirements (amount, asset, payTo) → pays **USDC on Base (8453)** per call → retries with payment proof. No API keys, accounts, or monthly subscriptions.
- **How Blue Agent uses x402:** (1) Blue Agent Hub (\`/api/x402/*\` & MCP) exposes 33+ Web3/DeFi/security/stock tools pay-per-call in USDC on Base; (2) Base Agent Exchange (\`/exchange\`) indexes third-party x402 sellers ranked by measured on-chain USDC volume, paid calls, and paying wallets; (3) Blue Chat (\`/chat\`) gives humans 100 free credits/day (guest) or 500/day (any connected wallet) plus USDC credit packs.
- **\`/exchange\` (Base Agent Exchange):** Index & marketplace for **x402 agent APIs/endpoints** on Base — **NOT a token swap DEX**. Subpages: \`/exchange\` (leaderboard), \`/exchange/[payTo]\` (seller profile), \`/exchange/discovered\`, \`/exchange/sell\` & \`/exchange/create\` (list an API), \`/exchange/analytics\` & \`/exchange/usage\`, \`/exchange/tokenize\`, \`/exchange/docs\`.
- **\`/jobs\` (Blue Agent Jobs Board):** Task & bounty board on Base where users post open jobs with USDC budgets to hire agents (\`/jobs\`, \`/jobs/[id]\`).
- **Core difference:** \`/exchange\` = automated pay-per-call x402 API endpoints; \`/jobs\` = open tasks/bounties posted for agents to claim and complete.`,
    dispatch: `### Dispatch: Exchange, Jobs, Hub Registry & RPC
- **Live Base Agent Exchange leaderboard / x402 sellers** ("top x402 sellers", "discover agents on Base") → \`hub_agent_exchange\`.
- **Live open jobs & bounties on Blue Agent Jobs Board** → \`hub_jobs_board\`.
- **Discover/list Hub tools** ("what tools are there", "list the tools") → \`blue_registry\`.
- **Live on-chain JSON-RPC reads** (block height, gas, eth_call across 11 EVM mainnets incl. base & robinhood) → \`hub_crypto_rpc\` (never for prices or user's own wallet balance; always quote server \`decoded\` decimals verbatim, never convert hex in your head).`,
  },
};

export const ALL_DOMAIN_SKILL_IDS: readonly DomainSkillId[] = Object.keys(DOMAIN_SKILLS) as DomainSkillId[];

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (p && typeof p === "object" && typeof (p as { text?: unknown }).text === "string" ? (p as { text: string }).text : ""))
      .join(" ");
  }
  return "";
}

/**
 * Select the 0-3 most relevant domain skills for the current chat turn.
 * Pure & deterministic — runs in <1ms before prompt assembly and Phase 1.
 */
export function selectDomainSkills(
  messages: readonly { role: string; content: unknown }[],
): DomainSkillId[] {
  const userTexts: string[] = [];
  for (let i = messages.length - 1; i >= 0 && userTexts.length < 2; i--) {
    if (messages[i]?.role === "user") {
      const t = textOf(messages[i].content).trim();
      if (t) userTexts.push(t);
    }
  }
  const latest = userTexts[0] ?? "";
  if (!latest) return [];

  // For short follow-ups ("còn trên Base thì sao?", "what about NVDA?"), include
  // the prior user message so domain context carries over cleanly.
  const isShortFollowUp = latest.length < 60 && userTexts.length > 1;
  const hay = isShortFollowUp ? `${latest}\n${userTexts[1]}` : latest;

  const scored: Array<{ id: DomainSkillId; hits: number }> = [];
  for (const id of ALL_DOMAIN_SKILL_IDS) {
    let hits = 0;
    for (const re of DOMAIN_SKILLS[id].patterns) {
      if (re.test(hay)) hits++;
    }
    if (hits > 0) scored.push({ id, hits });
  }

  if (scored.length === 0) return [];
  scored.sort((a, b) => b.hits - a.hits);
  return scored.slice(0, 2).map((s) => s.id);
}

/**
 * Union of tool names allowed in Phase 1 for the active domain skills.
 * Falls back to DEFAULT_TOOL_SUBSET (8 core tools) when no domain matched,
 * while strictly excluding tools that belong solely to user-disabled skills.
 */
export function selectToolSubset(
  skillIds: readonly DomainSkillId[],
  disabledSkills?: ReadonlySet<string>,
): ReadonlySet<string> {
  const enabledSkillIds = ALL_DOMAIN_SKILL_IDS.filter((id) => !disabledSkills?.has(id));
  if (skillIds.length > 0) {
    const out = new Set<string>();
    for (const id of skillIds) {
      if (disabledSkills?.has(id)) continue;
      for (const t of DOMAIN_SKILLS[id].tools) out.add(t);
    }
    return out;
  }

  if (!disabledSkills || disabledSkills.size === 0) {
    return new Set(DEFAULT_TOOL_SUBSET);
  }

  // Keep a default tool only if at least one non-disabled skill owns it.
  const enabledTools = new Set<string>();
  for (const id of enabledSkillIds) {
    for (const t of DOMAIN_SKILLS[id].tools) enabledTools.add(t);
  }
  return new Set(DEFAULT_TOOL_SUBSET.filter((t) => enabledTools.has(t)));
}

/**
 * Render the active domain skill packs into the system prompt.
 * When `hasTools === false`, ONLY `facts` are emitted (zero tool names).
 */
export function buildSelectedSkillsPrompt(
  skillIds: readonly DomainSkillId[],
  hasTools: boolean,
): string {
  if (!skillIds.length) return "";
  return skillIds
    .map((id) => {
      const s = DOMAIN_SKILLS[id];
      return hasTools ? `${s.facts}\n\n${s.dispatch}` : s.facts;
    })
    .join("\n\n");
}
