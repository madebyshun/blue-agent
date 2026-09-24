/**
 * The MCP tool manifest — the single array behind BOTH surfaces that publish it.
 *
 * WHY THIS IS A LIB AND NOT A CONST INSIDE THE ROUTE
 * -------------------------------------------------
 * It used to live in `app/api/mcp/route.ts`, and `/docs/mcp` kept a hand-copied
 * snapshot of it in `app/docs/_data.ts`. The snapshot drifted, as hand-copied
 * lists do. MEASURED 2026-09-18: the route served 86 tools; the docs snapshot
 * held 63, of which **7 were served by nothing at all** —
 *
 *   hub_builder_score · hub_brand_score · hub_wallet_pnl · hub_wallet_strategy
 *   hub_portfolio · hub_agent_revenue · hub_agent_token
 *
 * — names present in neither this manifest nor AGENT_TOOLS, published on a page
 * headed "Available tools", and 30 real tools were missing from that page
 * entirely. (The same 7 ids were simultaneously shipping in @blueagent/skill on
 * npm, which is how we know both were copying one imaginary source rather than
 * drifting independently.)
 *
 * A CI check comparing the two copies would have caught that. One array cannot
 * have it: `/docs/mcp` now renders exactly what `/api/mcp` serves, because it is
 * the same object. A derivation keeps being true; a pinned copy only keeps being
 * checked, and only for as long as someone maintains the check.
 *
 * Every consumer here is a SERVER module (`app/api/mcp/route.ts`,
 * `app/docs/_data.ts` and its nine server-rendered docs pages), so importing the
 * whole manifest costs no client bundle. Do NOT import this into a "use client"
 * tree — measured precedent: pulling `agent-tools.ts` into one added 16 kB
 * gzipped to First Load. A client page that needs the number gets a pinned
 * literal and a CI check instead (see scripts/docs-truth-check.ts, group 10).
 *
 * Shape is the MCP `tools/list` wire format — name, description, inputSchema —
 * so the route can return the array verbatim.
 */
export const MCP_TOOLS = [
  // ── Console commands ──────────────────────────────────────────────────────
  {
    name: "blue_idea",
    description: "Turn a rough concept into a fundable brief — problem, why now, why Base, MVP scope, risks, 24h plan.",
    inputSchema: { type: "object", properties: { prompt: { type: "string", description: "Your idea or concept" } }, required: ["prompt"] },
  },
  {
    name: "blue_build",
    description: "Architecture, stack, folder structure, integrations, and test plan for a Base project.",
    inputSchema: { type: "object", properties: { prompt: { type: "string", description: "What to build — brief or requirements" } }, required: ["prompt"] },
  },
  {
    name: "blue_audit",
    description: "Security review — 500+ checks, 13 categories. Critical issues, suggested fixes, go/no-go.",
    inputSchema: { type: "object", properties: { prompt: { type: "string", description: "Code, contract, or system to audit" } }, required: ["prompt"] },
  },
  {
    name: "blue_ship",
    description: "Deployment checklist, verification steps, release notes, and monitoring plan.",
    inputSchema: { type: "object", properties: { prompt: { type: "string", description: "What you're shipping" } }, required: ["prompt"] },
  },
  {
    name: "blue_raise",
    description: "Pitch narrative — market framing, why this wins, traction, ask, target investors.",
    inputSchema: { type: "object", properties: { prompt: { type: "string", description: "Project and raise context" } }, required: ["prompt"] },
  },
  // ── Builder & Research Hub tools ─────────────────────────────────────────
  {
    name: "hub_agent_score",
    description: "Agent Score (0-100) — anchored in REAL GitHub repo activity and/or on-chain wallet activity when supplied; XP/community is a labelled estimate.",
    inputSchema: { type: "object", properties: { handle: { type: "string", description: "Agent handle or name" }, repo: { type: "string", description: "GitHub repo for real dev-activity signal" }, address: { type: "string", description: "Base wallet 0x... for real on-chain activity" } }, required: ["handle"] },
  },
  {
    name: "hub_market_fit",
    description: "Market fit analysis — problem clarity, timing, competition, demand signals for a Base project.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project description" },
        url: { type: "string", description: "Project URL (optional)" },
      },
      required: ["project"],
    },
  },
  {
    name: "hub_token_pick",
    description: "AI token pick — falsifiable thesis, entry, sizing, kill criterion. Returns NO_PICK when nothing clears the bar.",
    inputSchema: { type: "object", properties: { context: { type: "string", description: "Market context (optional)" } } },
  },
  {
    name: "hub_narrative",
    description: "Narrative map — mindshare scores, velocity, phase (Emerging/Rising/Peak/Fading), position calls.",
    inputSchema: { type: "object", properties: { focus: { type: "string", description: "Narratives to focus on (optional)" } } },
  },
  {
    name: "hub_ecosystem",
    description: "Daily Base ecosystem digest — top launches, protocol updates, builder activity.",
    inputSchema: { type: "object", properties: { focus: { type: "string", description: "Area to focus on (optional)" } } },
  },
  {
    name: "hub_competitor_scan",
    description: "Competitor analysis — named competitors are grounded in REAL DefiLlama Base TVL/change when they match a protocol; reasons about defensible edge on top.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Your project description" },
        competitors: { type: "array", items: { type: "string" }, description: "Competitor names (resolved against DefiLlama Base protocols for live TVL)" },
        description: { type: "string", description: "What your project does" },
      },
      required: ["project"],
    },
  },
  {
    name: "hub_investor_memo",
    description: "Full investor memo — thesis, market, moat, risks, ask. Ready to send.",
    inputSchema: {
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
    name: "hub_repo_health",
    description: "GitHub repo health — commit velocity, test coverage, dependency risk, bus factor.",
    inputSchema: { type: "object", properties: { url: { type: "string", description: "GitHub repository URL" } }, required: ["url"] },
  },
  {
    name: "hub_base_grant",
    description: "Find active grants and funding opportunities for your Base project.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project description" },
        stage: { type: "string", description: "idea | build | live" },
      },
      required: ["project"],
    },
  },
  {
    name: "hub_risk_gate",
    description: "Screen any transaction before execution — rug check, AML, malicious contract patterns.",
    inputSchema: {
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
    name: "hub_honeypot",
    description: "Detect honeypot tokens that cannot be sold after purchase.",
    inputSchema: { type: "object", properties: { token: { type: "string", description: "Token contract address on Base" } }, required: ["token"] },
  },
  {
    name: "hub_deep_analysis",
    description: "Comprehensive token fundamentals — on-chain activity, holder distribution, risk signals.",
    inputSchema: { type: "object", properties: { token: { type: "string", description: "Token contract address" } }, required: ["token"] },
  },
  {
    name: "hub_whale_signal",
    description: "Whale wallet copy-trade signals — track large moves for a token on Base.",
    inputSchema: {
      type: "object",
      properties: {
        token: { type: "string", description: "Token address to track" },
        min_usd: { type: "number", description: "Min trade size in USD (default: 10000)" },
      },
      required: ["token"],
    },
  },
  {
    name: "hub_fundraise_timing",
    description: "Is now the right time to raise? Market conditions, stage readiness, investor appetite.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project description" },
        stage: { type: "string", description: "Stage and key metrics" },
      },
      required: ["project"],
    },
  },
  // ── Security (extended) ──────────────────────────────────────────────────
  {
    name: "hub_contract_trust",
    description: "Trust score for any smart contract — code quality, upgrade risk, ownership, audit history.",
    inputSchema: { type: "object", properties: { contract: { type: "string", description: "Contract address 0x..." } }, required: ["contract"] },
  },
  {
    name: "hub_aml_screen",
    description: "AML screening for a wallet address — sanctions, mixer exposure, illicit flow patterns.",
    inputSchema: { type: "object", properties: { address: { type: "string", description: "Wallet address 0x..." } }, required: ["address"] },
  },
  {
    name: "hub_key_exposure",
    description: "Check if a wallet's public key is exposed on-chain (quantum vulnerability risk).",
    inputSchema: { type: "object", properties: { address: { type: "string", description: "Wallet address 0x..." } }, required: ["address"] },
  },
  // ── Research (extended) ───────────────────────────────────────────────────
  {
    name: "hub_token_momentum",
    description: "Token momentum scanner — price velocity, volume spikes, social acceleration for Base tokens.",
    inputSchema: { type: "object", properties: { token: { type: "string", description: "Token address or symbol" }, limit: { type: "number", description: "Number of tokens to scan (default 10)" } } },
  },
  {
    name: "hub_whale_tracker",
    description: "Whale/large-transfer tracker for a Base token or wallet — real Basescan transfer data. Pass a 0x address.",
    inputSchema: { type: "object", properties: { address: { type: "string", description: "Base token or wallet address (0x…) to track" } }, required: ["address"] },
  },
  {
    name: "hub_community_sentiment",
    description: "Community sentiment for a token or project — CT mindshare, Farcaster buzz, Telegram signals.",
    inputSchema: { type: "object", properties: { target: { type: "string", description: "Token symbol, project name, or contract address" } }, required: ["target"] },
  },
  // ── Builder (extended) ────────────────────────────────────────────────────
  {
    name: "hub_launch_simulator",
    description: "Simulate a token or product launch — model price action, liquidity, community growth scenarios.",
    inputSchema: { type: "object", properties: { project: { type: "string", description: "Project/token description" }, supply: { type: "string", description: "Token supply (optional)" } }, required: ["project"] },
  },
  {
    name: "hub_token_launch",
    description: "Token launch readiness — market TIMING grounded in REAL Base data (live chain TVL + trending pools); if a token address is given its live DexScreener market grounds momentum. Returns GO/WAIT + action items.",
    inputSchema: { type: "object", properties: { name: { type: "string" }, ticker: { type: "string" }, description: { type: "string" }, address: { type: "string", description: "Optional: existing token contract 0x... to ground in live market data" } }, required: ["name", "ticker", "description"] },
  },
  {
    name: "hub_builder_dd",
    description: "Deep due diligence on a builder — onchain history, shipped projects, GitHub activity, reputation signals.",
    inputSchema: { type: "object", properties: { handle: { type: "string", description: "X handle, GitHub handle, or wallet" } }, required: ["handle"] },
  },
  {
    name: "hub_roadmap",
    description: "Validate a product roadmap — feasibility, sequencing, market timing, missing milestones.",
    inputSchema: { type: "object", properties: { roadmap: { type: "string", description: "Roadmap or milestones" }, stage: { type: "string" } }, required: ["roadmap"] },
  },
  {
    name: "hub_gtm",
    description: "Go-to-market brief — distribution channels, launch sequence, community strategy for a Base project.",
    inputSchema: { type: "object", properties: { project: { type: "string" }, target: { type: "string", description: "Target audience (optional)" } }, required: ["project"] },
  },
  {
    name: "hub_pitch_intel",
    description: "Pitch intelligence — analyze and strengthen a pitch deck or fundraising narrative with investor-lens feedback.",
    inputSchema: { type: "object", properties: { pitch: { type: "string", description: "Pitch text or deck outline" } }, required: ["pitch"] },
  },
  // ── Premium ───────────────────────────────────────────────────────────────
  {
    name: "hub_defi_opportunity",
    description: "Best DeFi yield opportunities on Base — APY rankings, risk-adjusted returns, protocol safety.",
    inputSchema: { type: "object", properties: { amount: { type: "string", description: "Amount in USD (optional)" }, risk: { type: "string" } } },
  },
  {
    name: "hub_protocol_risk",
    description: "Real-time risk monitor for a Base DeFi protocol — TVL changes, exploit signals, governance risks.",
    inputSchema: { type: "object", properties: { protocol: { type: "string", description: "Protocol name or contract address" } }, required: ["protocol"] },
  },
  // ── Multi-agent ───────────────────────────────────────────────────────────
  {
    name: "hub_multi_agent",
    description: "Orchestrate a multi-agent workflow — route tasks across Blue Agent + Aeon + MiroShark for complex analysis.",
    inputSchema: { type: "object", properties: { task: { type: "string", description: "Task for the agent collective" } }, required: ["task"] },
  },
  {
    name: "hub_agent_match",
    description: "Find the best collaborator agent for a task — match your project with Base agents by capability.",
    inputSchema: { type: "object", properties: { task: { type: "string" } }, required: ["task"] },
  },
  {
    name: "hub_agent_perf",
    description: "Performance report for an AI agent — grounded in REAL GitHub activity (stars/commits/recency) when a repo is supplied; otherwise a labelled estimate.",
    inputSchema: { type: "object", properties: { agent: { type: "string", description: "Agent handle or name" }, repo: { type: "string", description: "GitHub repo (owner/name or URL) to ground the report in real activity" } }, required: ["agent"] },
  },
  // ── Community ─────────────────────────────────────────────────────────────
  {
    name: "hub_community_growth",
    description: "Community growth playbook — channels, content strategy, retention loops, milestones for a Base project.",
    inputSchema: { type: "object", properties: { project: { type: "string" }, current_size: { type: "string", description: "Current size (optional)" } }, required: ["project"] },
  },
  {
    name: "hub_thread_intel",
    description: "Thread intelligence — analyze a CT thread or topic for signal vs noise, key takes, actionable insights.",
    inputSchema: { type: "object", properties: { thread: { type: "string", description: "Thread URL or topic" } }, required: ["thread"] },
  },
  {
    name: "hub_narrative_pulse",
    description: "Real-time narrative pulse — what's being talked about right now on Base CT, velocity and sentiment.",
    inputSchema: { type: "object", properties: { focus: { type: "string", description: "Topic or token to focus on (optional)" } } },
  },
  // ── Catalog parity — Builder & Base ecosystem (extended) ──────────────────
  {
    name: "hub_stack",
    description: "Stack Recommender — optimal tech stack for a Base build: infra, tooling, protocols, integrations.",
    inputSchema: { type: "object", properties: { project: { type: "string", description: "Project type, e.g. DeFi protocol, AI agent, consumer app" }, description: { type: "string", description: "What you're building (optional)" }, team_size: { type: "string", description: "Team size (optional)" }, timeline: { type: "string", description: "Constraints / timeline (optional)" } }, required: ["project"] },
  },
  {
    name: "hub_protocol_compare",
    description: "Base Protocol Comparison — side-by-side of two Base protocols for integrations/partnerships; grounded in DefiLlama TVL where matched.",
    inputSchema: { type: "object", properties: { protocol_a: { type: "string", description: "First protocol, e.g. Aerodrome" }, protocol_b: { type: "string", description: "Second protocol, e.g. Morpho" }, use_case: { type: "string", description: "Your use case (optional)" } }, required: ["protocol_a", "protocol_b"] },
  },
  // ── Catalog parity — On-chain & Earn (extended) ───────────────────────────
  {
    name: "hub_airdrop",
    description: "Airdrop Check — Base airdrop eligibility for a wallet: which protocols, activity score, estimated value.",
    inputSchema: { type: "object", properties: { address: { type: "string", description: "Wallet address 0x..." } }, required: ["address"] },
  },
  {
    name: "hub_dex_flow",
    description: "DEX Flow — volume, buy/sell pressure and liquidity flow for a Base token. Live DexScreener data.",
    inputSchema: { type: "object", properties: { token: { type: "string", description: "Token contract address 0x... or ticker" } }, required: ["token"] },
  },
  {
    name: "hub_lp_analyzer",
    description: "LP Analyzer — impermanent loss, fee income and rebalance recommendation for a liquidity position.",
    inputSchema: { type: "object", properties: { token0: { type: "string", description: "Token 0, e.g. ETH or 0x..." }, token1: { type: "string", description: "Token 1, e.g. USDC or 0x... (optional)" }, entryPrice: { type: "string", description: "Entry price (optional)" }, investedAmount: { type: "string", description: "Invested amount in USD (optional)" } }, required: ["token0"] },
  },
  // ── Catalog parity — Alerts (extended) ────────────────────────────────────
  // ── Catalog parity — Launch & grants (extended) ───────────────────────────
  {
    name: "hub_launch_sim_tier2",
    description: "Launch Simulator (Tier 2) — deep launch simulation with live DexScreener market data: price, volume, liquidity.",
    inputSchema: { type: "object", properties: { project: { type: "string", description: "Project name" }, description: { type: "string", description: "What it does, audience, stage (optional)" }, ticker: { type: "string", description: "Token ticker (optional)" }, contract: { type: "string", description: "Contract 0x... for live data (optional)" } }, required: ["project"] },
  },
  {
    name: "hub_launch_sim_tier3",
    description: "Launch Simulator (Tier 3) — full multi-agent launch report with risk matrix and timeline recommendation.",
    inputSchema: { type: "object", properties: { project: { type: "string", description: "Project name" }, description: { type: "string", description: "What it does, audience, stage (optional)" }, ticker: { type: "string", description: "Token ticker (optional)" }, contract: { type: "string", description: "Contract 0x... for live data (optional)" } }, required: ["project"] },
  },
  {
    name: "hub_grant_eval",
    description: "Grant Evaluator — Base ecosystem grant scoring: innovation, feasibility, impact, team quality.",
    inputSchema: { type: "object", properties: { projectName: { type: "string", description: "Project name" }, description: { type: "string", description: "What you're building and why it matters for Base" }, teamBackground: { type: "string", description: "Team background (optional)" }, requestedAmount: { type: "string", description: "Requested grant amount (optional)" }, milestones: { type: "string", description: "Milestones (optional)" }, githubUrl: { type: "string", description: "GitHub URL (optional)" } }, required: ["projectName", "description"] },
  },
  // ── B20 / Beryl ───────────────────────────────────────────────────────────
  {
    name: "hub_b20_analyze",
    description: "B20 (Base Native Token Standard) guide — variants, roles, policies, integration tips. Powered by Beryl upgrade docs. Optionally analyze a specific contract address.",
    inputSchema: { type: "object", properties: { action: { type: "string", description: "guide | roles | policy | analyze | compare (default: guide)" }, address: { type: "string", description: "Token contract address 0x... (optional)" }, context: { type: "string", description: "Your use case or question (optional)" } } },
  },
  // hub_b20_tracker retired 2026-09-24 with the b20-tracker catalog entry: its
  // launches half came from api.bankr.bot, the last live Bankr call in the repo.
  // ── On-chain primitives & data (new batch) ────────────────────────────────
  {
    name: "hub_token_price",
    description: "Live price, market cap, volume and liquidity for any Base token (DexScreener).",
    inputSchema: { type: "object", properties: { token: { type: "string", description: "Token contract address 0x... or ticker" } }, required: ["token"] },
  },
  {
    name: "hub_pool_scan",
    description: "Trending + newly-active Base pools with the chain TVL snapshot.",
    inputSchema: { type: "object", properties: { limit: { type: "number", description: "Number of pools to return (default 10)" } } },
  },
  {
    name: "hub_wallet_holdings",
    description: "Live ERC-20 and ETH holdings with USD values for a Base wallet (Moralis).",
    inputSchema: { type: "object", properties: { address: { type: "string", description: "Wallet address 0x..." } }, required: ["address"] },
  },
  {
    name: "hub_new_pools",
    description: "Freshly-created Base pools with thin-liquidity honeypot flags.",
    inputSchema: { type: "object", properties: { hours: { type: "number", description: "Window in hours (default 24)" } } },
  },
  {
    name: "hub_gas_tracker",
    description: "Live Base gas price and USD cost estimates for common actions (transfer, swap, deploy).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "hub_quick_safety",
    description: "Fast contract safety check — liquidity, Basescan verification, and risk verdict.",
    inputSchema: { type: "object", properties: { contract: { type: "string", description: "Contract address 0x..." } }, required: ["contract"] },
  },
  {
    name: "hub_wallet_risk",
    description: "AML / risk screen for a Base wallet from real on-chain flow (Moralis).",
    inputSchema: { type: "object", properties: { address: { type: "string", description: "Wallet address 0x..." } }, required: ["address"] },
  },
  {
    name: "hub_b20_check",
    description: "ERC-20 compliance (B20) role and policy detection from verified contract source.",
    inputSchema: { type: "object", properties: { contract: { type: "string", description: "Contract address 0x..." } }, required: ["contract"] },
  },
  // ── B20 calldata builders (MCP-native, free — pure encoders, non-custodial) ──
  // Return { to, data, value } ready for an EIP-5792 send_calls / Base MCP wallet
  // call. The user signs in their own wallet; we never hold keys. No x402 payment.
  {
    name: "b20_encode_deploy",
    description: "Encode a B20 token deployment (createB20). Returns { to, data, value } for the admin wallet to sign via EIP-5792 send_calls / Base MCP — after deploy the admin owns the token and holds MINT_ROLE. Pure calldata builder: no keys, no payment. Run b20_check_activation first — createB20 reverts until B20 is active on the target chain.",
    inputSchema: { type: "object", properties: {
      name: { type: "string", description: "Token name" },
      symbol: { type: "string", description: "Token symbol, e.g. MTK" },
      variant: { type: "string", enum: ["asset", "stablecoin"], description: "asset = configurable decimals 6-18; stablecoin = fixed 6 decimals + currency" },
      admin: { type: "string", description: "0x wallet that signs the deploy and owns the token" },
      decimals: { type: "number", description: "Decimals 6-18 (asset only, default 18)" },
      currency_code: { type: "string", description: "3-letter currency, e.g. USD (stablecoin only)" },
      supply_cap: { type: "string", description: "Max total supply in whole tokens (optional, omit for no cap)" },
      initial_supply: { type: "string", description: "Seed-mint to admin at deploy, in whole tokens (optional)" },
      chainId: { type: "number", description: "8453 = Base Mainnet (default), 84532 = Base Sepolia" },
    }, required: ["name", "symbol", "variant", "admin"] },
  },
  {
    name: "b20_encode_mint",
    description: "Encode a mint on an existing B20 token. Returns { to, data, value } for a wallet holding MINT_ROLE to sign. Optional onchain memo (mintWithMemo). Pure calldata builder — no keys, no payment.",
    inputSchema: { type: "object", properties: {
      tokenAddress: { type: "string", description: "B20 token contract 0x..." },
      to: { type: "string", description: "Recipient 0x..." },
      amount: { type: "string", description: "Amount in whole tokens, e.g. '1000'" },
      decimals: { type: "number", description: "Token decimals" },
      memo: { type: "string", description: "Optional onchain memo, max 31 chars (uses mintWithMemo)" },
    }, required: ["tokenAddress", "to", "amount", "decimals"] },
  },
  {
    name: "b20_encode_grant_mint_role",
    description: "Encode grantRole(MINT_ROLE, account) on a B20 token. Returns { to, data, value } for the DEFAULT_ADMIN_ROLE holder to sign. Pure calldata builder — no keys, no payment.",
    inputSchema: { type: "object", properties: {
      tokenAddress: { type: "string", description: "B20 token contract 0x..." },
      account: { type: "string", description: "0x address to grant MINT_ROLE" },
    }, required: ["tokenAddress", "account"] },
  },
  {
    name: "b20_encode_payment",
    description: "Encode transferWithMemo — send B20 tokens with an onchain memo (order id) for reconciliation. Returns { to, data, value } for the sender to sign. Pure calldata builder — no keys, no payment.",
    inputSchema: { type: "object", properties: {
      tokenAddress: { type: "string", description: "B20 token contract 0x..." },
      to: { type: "string", description: "Recipient 0x..." },
      amount: { type: "string", description: "Amount in whole tokens" },
      decimals: { type: "number", description: "Token decimals (default 6)" },
      memo: { type: "string", description: "Onchain memo / order id, max 31 chars" },
    }, required: ["tokenAddress", "to", "amount", "memo"] },
  },
  {
    name: "b20_check_activation",
    description: "Check whether the B20 ASSET and STABLECOIN standards are activated on Base mainnet or Sepolia — read live from the on-chain ActivationRegistry (isActivated). No wallet, no payment.",
    inputSchema: { type: "object", properties: {
      chainId: { type: "number", description: "8453 = Base Mainnet (default), 84532 = Base Sepolia" },
    } },
  },
  {
    name: "b20_read_token",
    description: "Inspect a B20 token live from Base RPC via multicall — isB20 check, name/symbol/decimals, total supply, supply cap, variant, per-feature pause status, and per-scope policy gating. Deterministic on-chain read (zero LLM). No wallet, no payment.",
    inputSchema: { type: "object", properties: {
      tokenAddress: { type: "string", description: "Token contract 0x..." },
      chainId: { type: "number", description: "8453 = Base Mainnet (default), 84532 = Base Sepolia" },
      account: { type: "string", description: "Optional wallet 0x... — checks whether it holds DEFAULT_ADMIN_ROLE" },
    }, required: ["tokenAddress"] },
  },
  {
    name: "b20_encode_burn",
    description: "Encode burnWithMemo — burn B20 tokens from the caller's own balance with an on-chain memo. Returns { to, data, value } for a wallet holding BURN_ROLE to sign. Pure calldata builder — no keys, no payment.",
    inputSchema: { type: "object", properties: {
      tokenAddress: { type: "string", description: "B20 token contract 0x..." },
      amount: { type: "string", description: "Amount in whole tokens" },
      decimals: { type: "number", description: "Token decimals" },
      memo: { type: "string", description: "On-chain memo, max 31 chars" },
    }, required: ["tokenAddress", "amount", "decimals", "memo"] },
  },
  {
    name: "hub_liquidity_depth",
    description: "Liquidity depth, slippage estimate and exit risk for a Base token.",
    inputSchema: { type: "object", properties: { token: { type: "string", description: "Token contract address 0x... or ticker" } }, required: ["token"] },
  },
  {
    name: "hub_token_distribution",
    description: "Holder concentration and rug-risk distribution score for a Base token (Moralis holders).",
    inputSchema: { type: "object", properties: { contract: { type: "string", description: "Token contract address 0x..." } }, required: ["contract"] },
  },
  {
    name: "hub_base_alpha",
    description: "Base market alpha — narratives, momentum picks, divergence signals. No inputs needed.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "hub_token_alpha",
    description: "Token trade signal — entry, whale confirmation, momentum and risk for a specific Base token.",
    inputSchema: { type: "object", properties: { token: { type: "string", description: "Token contract address 0x... or ticker" } }, required: ["token"] },
  },
  {
    name: "hub_protocol_health",
    description: "Protocol TVL health, trend and risk signals from DefiLlama.",
    inputSchema: { type: "object", properties: { protocol: { type: "string", description: "Protocol name, e.g. Aerodrome" } }, required: ["protocol"] },
  },
  {
    name: "hub_founder_check",
    description: "GitHub-based founder trust score — repos, stars, commit activity.",
    inputSchema: { type: "object", properties: { handle: { type: "string", description: "GitHub handle" } }, required: ["handle"] },
  },
  {
    name: "hub_narrative_live",
    description: "Live Base narrative phases, velocity and entry windows — real-time tracking of what's building vs peaking.",
    inputSchema: { type: "object", properties: { focus: { type: "string", description: "Narrative focus (optional), e.g. AI agents, RWA, DeFi" } } },
  },
  {
    name: "hub_base_activity",
    description: "Onchain activity score and tier for a Base wallet (Moralis).",
    inputSchema: { type: "object", properties: { address: { type: "string", description: "Wallet address 0x..." } }, required: ["address"] },
  },
  {
    name: "hub_scam_detector",
    description: "Detect honeypot, rug and fake-token patterns on a Base contract.",
    inputSchema: { type: "object", properties: { contract: { type: "string", description: "Contract address 0x..." } }, required: ["contract"] },
  },
  {
    name: "hub_cross_yield",
    description: "Best Base yield for a token across protocols (DefiLlama) with risk-adjusted ranking.",
    inputSchema: { type: "object", properties: { token: { type: "string", description: "Token address 0x... or ticker" }, risk_tolerance: { type: "string", enum: ["low", "medium", "high"], description: "Risk tolerance (default medium)" } }, required: ["token"] },
  },
  {
    name: "hub_agent_readiness",
    description: "x402 and MCP readiness probe for an agent endpoint — checks payment support, protocol compliance, and integration.",
    inputSchema: { type: "object", properties: { url: { type: "string", description: "Agent endpoint URL https://..." } }, required: ["url"] },
  },
  {
    name: "hub_base_pulse",
    description: "Base chain market pulse — TVL, DEX volume, sentiment, pulse score. No inputs needed.",
    inputSchema: { type: "object", properties: {} },
  },
  // ── Utility ───────────────────────────────────────────────────────────────
  {
    name: "blue_score",
    description: "Builder Score for a GitHub/Farcaster handle or wallet address on Base (0-100).",
    inputSchema: { type: "object", properties: { handle: { type: "string", description: "Handle or wallet address" } }, required: ["handle"] },
  },
  {
    name: "blue_new",
    description: "Scaffold a new Base project. Templates: base-agent | base-x402 | base-token.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project directory name" },
        type: { type: "string", enum: ["base-agent", "base-x402", "base-token"] },
      },
      required: ["name", "type"],
    },
  },
  {
    name: "blue_monitor",
    description: "On-demand health + risk snapshot for a Base token/contract — live price, liquidity, Basescan verification, risk signals + a watch plan with alert thresholds.",
    inputSchema: { type: "object", properties: { target: { type: "string", description: "Base token/contract address (0x…) or a protocol/token name" }, focus: { type: "string", description: "Optional focus, e.g. liquidity or exit risk" } }, required: ["target"] },
  },
  {
    name: "blue_registry",
    description: "Discover the Blue Hub tool catalog — every callable x402 tool (first-party + community), filterable by query/category, with prices and how-to-call.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "Optional search term" }, category: { type: "string", description: "Optional category filter" } } },
  },
  {
    name: "blue_research",
    description: "Deep DD memo on a Base project, narrative, or token — thesis, bull/bear, risks, contrarian take, verdict. Grounds in live DexScreener data when a token address is given.",
    inputSchema: { type: "object", properties: { topic: { type: "string", description: "Project, narrative, or token to research" }, target: { type: "string", description: "Optional 0x token address to ground in live market data" } }, required: ["topic"] },
  },
  {
    name: "blue_compose",
    description: "Turn a goal into a runnable chain of Blue Hub tools — picks from the real catalog, orders the steps, suggests inputs, and estimates cost.",
    inputSchema: { type: "object", properties: { goal: { type: "string", description: "What you want to accomplish on Base" } }, required: ["goal"] },
  },
  {
    name: "blue_deploy",
    description: "Technical deploy mechanics for Base mainnet — deploy scripts, Basescan verify commands, env vars, gas notes, post-deploy checks. Never invents addresses.",
    inputSchema: { type: "object", properties: { project: { type: "string", description: "What you're deploying (contract/app + stack)" }, stack: { type: "string", description: "Optional: Foundry, Hardhat, viem…" } }, required: ["project"] },
  },
  {
    name: "blue_analytics",
    description: "Performance/metrics read on a Base token — live price, momentum, liquidity health, volume/liquidity ratio, growth signals. Real DexScreener data.",
    inputSchema: { type: "object", properties: { target: { type: "string", description: "Base token contract address (0x…)" }, focus: { type: "string", description: "Optional focus" } }, required: ["target"] },
  },
  {
    name: "blue_simulate",
    description: "Bull/base/bear scenario modeling for a Base decision — tokenomics, fee model, growth, runway — with assumptions, projections, and sensitivities.",
    inputSchema: { type: "object", properties: { scenario: { type: "string", description: "The decision/model to simulate" }, params: { type: "string", description: "Optional parameters/values" } }, required: ["scenario"] },
  },
  {
    name: "blue_stream",
    description: "Live snapshot feed of Base onchain activity — trending & new pools, TVL, real price/volume/liquidity. Pure real data; poll for a near-real-time feed.",
    inputSchema: { type: "object", properties: { feed: { type: "string", description: "movers | new | all (default movers)" } } },
  },
];

/** Counted, never typed. Quoted by SKILL.md, CLAUDE.md, /about and /docs. */
export const MCP_TOOL_COUNT = MCP_TOOLS.length;
