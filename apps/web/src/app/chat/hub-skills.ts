export type SkillCategory =
  | "Market Intel"
  | "Due Diligence"
  | "Builder Tools"
  | "Fundraise"
  | "Launch"
  | "Agent Network"
  | "Ecosystem"
  | "On-chain"
  | "Base Native";

export interface HubSkill {
  id:          string;
  name:        string;
  description: string;
  trigger:     string;   // inserted into chat input on click
  category:    SkillCategory;
}

export const SKILL_CATEGORIES: SkillCategory[] = [
  "Market Intel", "Due Diligence", "Builder Tools",
  "Fundraise", "Launch", "Agent Network", "Ecosystem",
  "On-chain", "Base Native",
];

export const CATEGORY_ICONS: Record<SkillCategory, string> = {
  "Market Intel":  "📈",
  "Due Diligence": "🔍",
  "Builder Tools": "🏗️",
  "Fundraise":     "💰",
  "Launch":        "🚀",
  "Agent Network": "🤝",
  "Ecosystem":     "🌐",
  "On-chain":      "⛓",
  "Base Native":   "🔵",
};

export const HUB_SKILLS: HubSkill[] = [
  // ── Market Intel ────────────────────────────────────────────────────────────
  { id: "token-pick-signal",      category: "Market Intel",  name: "Token Pick Signal",        description: "AI-powered token pick with thesis, entry, and kill criterion",   trigger: "/pick" },
  { id: "narrative-position",     category: "Market Intel",  name: "Narrative Position",       description: "Current narrative map — mindshare, velocity, phase, calls",      trigger: "What narratives are running on Base right now?" },
  { id: "whale-copy-signal",      category: "Market Intel",  name: "Whale Copy Signal",        description: "Track large wallet moves for a specific token",                   trigger: "Show me whale signals for " },
  { id: "token-momentum-scanner", category: "Market Intel",  name: "Token Momentum Scanner",   description: "Scan tokens by momentum, volume, and on-chain activity",          trigger: "Scan top momentum tokens on Base" },
  { id: "community-sentiment",    category: "Market Intel",  name: "Community Sentiment",      description: "Gauge CT sentiment and holder conviction for a token",            trigger: "What's the sentiment around " },

  // ── Due Diligence ────────────────────────────────────────────────────────────
  { id: "deep-analysis",          category: "Due Diligence", name: "Deep Analysis",            description: "Full token DD — on-chain activity, holders, risk signals",        trigger: "/audit " },
  { id: "honeypot-check",         category: "Due Diligence", name: "Honeypot Check",           description: "Detect honeypot traps and rug-pull patterns before buying",       trigger: "/scan " },
  { id: "risk-gate",              category: "Due Diligence", name: "Risk Gate",                description: "GO/NO-GO risk score for a token or contract",                     trigger: "Run a risk gate on " },
  { id: "contract-trust",         category: "Due Diligence", name: "Contract Trust Score",     description: "Trust scoring based on code quality, owner actions, and history", trigger: "What's the trust score for contract " },
  { id: "protocol-risk-monitor",  category: "Due Diligence", name: "Protocol Risk Monitor",    description: "Monitor ongoing risks for a DeFi protocol",                       trigger: "Monitor risks for " },

  // ── Builder Tools ─────────────────────────────────────────────────────────────
  { id: "market-fit",             category: "Builder Tools", name: "Market Fit Validator",     description: "Validate product-market fit for a Base project idea",             trigger: "/idea " },
  { id: "competitor-scan",        category: "Builder Tools", name: "Competitor Scan",          description: "Map the competitive landscape for your project on Base",           trigger: "Who are the competitors for " },
  { id: "gtm-brief",              category: "Builder Tools", name: "GTM Brief",                description: "Go-to-market brief: channels, messaging, launch sequence",         trigger: "/ship " },
  { id: "stack-recommender",      category: "Builder Tools", name: "Stack Recommender",        description: "Recommend the optimal tech stack for a Base project",             trigger: "/build " },
  { id: "repo-health",            category: "Builder Tools", name: "Repo Health Check",        description: "Assess GitHub repo quality, activity, and contributor health",    trigger: "Check repo health for " },
  { id: "builder-score",          category: "Builder Tools", name: "Builder Score",            description: "Score a builder's on-chain and GitHub activity on Base",          trigger: "What's the builder score for " },

  // ── Fundraise ────────────────────────────────────────────────────────────────
  { id: "investor-memo",          category: "Fundraise",     name: "Investor Memo",            description: "Generate a structured investor memo for your Base project",        trigger: "/raise " },
  { id: "fundraise-timing",       category: "Fundraise",     name: "Fundraise Timing Oracle",  description: "Optimal raise timing based on market cycle and sector momentum",   trigger: "Is now a good time to raise for " },
  { id: "pitch-intelligence",     category: "Fundraise",     name: "Pitch Intelligence",       description: "Competitive pitch analysis — what investors are funding on Base",  trigger: "What are investors funding on Base right now?" },
  { id: "base-grant-finder",      category: "Fundraise",     name: "Base Grant Finder",        description: "Find matching Base ecosystem grants and grants programs",          trigger: "Find Base grants for " },

  // ── Launch ────────────────────────────────────────────────────────────────────
  { id: "token-launch-readiness", category: "Launch",        name: "Token Launch Readiness",   description: "Pre-launch checklist and readiness score for a token on Base",     trigger: "Is my token ready to launch? " },
  { id: "launch-advisor",         category: "Launch",        name: "Launch Advisor",           description: "Step-by-step token launch plan on Base with timeline",             trigger: "Give me a launch plan for " },
  { id: "token-distribution-plan",category: "Launch",       name: "Token Distribution Plan",   description: "Optimal token distribution strategy — allocations, vesting, TGE",  trigger: "Design a token distribution plan for " },
  { id: "agent-token-strategy",   category: "Launch",        name: "Agent Token Strategy",     description: "Strategy for AI agent token launches on Base",                    trigger: "How should I structure my agent token?" },

  // ── Agent Network ─────────────────────────────────────────────────────────────
  { id: "agent-collab-match",     category: "Agent Network", name: "Agent Collab Match",       description: "Find the best agent collaborations for your use case",            trigger: "Which agents should I collaborate with for " },
  { id: "multi-agent-workflow",   category: "Agent Network", name: "Multi-Agent Workflow",     description: "Design a multi-agent workflow for a complex task",                 trigger: "Design a multi-agent workflow for " },
  { id: "agent-revenue-optimizer",category: "Agent Network", name: "Agent Revenue Optimizer",  description: "Optimize revenue streams for an AI agent on Base",                trigger: "How can my agent earn more revenue?" },
  { id: "base-builder-network",   category: "Agent Network", name: "Base Builder Network",     description: "Connect with relevant builders and projects on Base",             trigger: "Who should I connect with on Base for " },

  // ── Ecosystem ────────────────────────────────────────────────────────────────
  { id: "ecosystem-digest",       category: "Ecosystem",     name: "Ecosystem Digest",         description: "Daily digest of Base ecosystem — launches, moves, narratives",     trigger: "What happened on Base today?" },
  { id: "base-protocol-comparison",category: "Ecosystem",   name: "Protocol Comparison",       description: "Compare Base DeFi protocols across TVL, fees, and growth",         trigger: "Compare these Base protocols: " },
  { id: "defi-opportunity",       category: "Ecosystem",     name: "DeFi Opportunity Scanner", description: "Find yield and liquidity opportunities across Base DeFi",          trigger: "Find DeFi opportunities on Base" },
  { id: "wallet-strategy-analyzer",category:"Ecosystem",    name: "Wallet Strategy Analyzer",  description: "Analyze wallet on-chain activity and derive strategy insights",    trigger: "/wallet " },

  // ── On-chain (Bankr) ──────────────────────────────────────────────────────────
  { id: "wallet-portfolio",        category: "On-chain",    name: "Wallet Portfolio",          description: "Full on-chain portfolio breakdown — tokens, NFTs, DeFi positions",  trigger: "/wallet " },
  { id: "token-price-check",       category: "On-chain",    name: "Token Price",               description: "Get live price, volume, and market cap for any Base token",         trigger: "What's the current price of " },
  { id: "top-holders",             category: "On-chain",    name: "Top Holders",               description: "List top holders and whale concentration for a token",             trigger: "Show top holders for token " },
  { id: "token-transfers",         category: "On-chain",    name: "Recent Transfers",          description: "Latest token transfers and wallet activity for an address",        trigger: "Show recent transfers for wallet " },
  { id: "lp-positions",            category: "On-chain",    name: "LP Positions",              description: "Check active Uniswap V3/V4 liquidity positions on Base",           trigger: "Show LP positions for " },
  { id: "token-unlock-calendar",   category: "On-chain",    name: "Token Unlock Calendar",     description: "Upcoming token unlock events and vesting schedules on Base",       trigger: "Show token unlock schedule for " },
  { id: "bankr-wallet-pnl",        category: "On-chain",    name: "Wallet PnL",                description: "Realized and unrealized PnL for any wallet on Base via Bankr",     trigger: "What's the PnL for wallet " },
  { id: "nft-floor-tracker",       category: "On-chain",    name: "NFT Floor Tracker",         description: "Track floor price and volume for Base NFT collections",            trigger: "Track NFT floor for " },

  // ── Base Native ───────────────────────────────────────────────────────────────
  { id: "base-gas-oracle",         category: "Base Native", name: "Base Gas Oracle",           description: "Current Base L2 gas prices and fee estimation for transactions",   trigger: "What are current Base gas prices?" },
  { id: "base-block-info",         category: "Base Native", name: "Base Block Info",           description: "Latest Base block height, timestamp, and network health",          trigger: "Show latest Base block information" },
  { id: "base-contract-read",      category: "Base Native", name: "Read Contract",             description: "Read public state from any verified contract on Base",             trigger: "Read the state of Base contract " },
  { id: "base-name-lookup",        category: "Base Native", name: "Base Name Lookup",          description: "Resolve a .base.eth or Basename to an address",                   trigger: "Resolve this basename: " },
  { id: "coinbase-smart-wallet",   category: "Base Native", name: "Coinbase Smart Wallet",     description: "Set up or analyze a Coinbase Smart Wallet on Base",                trigger: "Help me set up a Coinbase Smart Wallet" },
  { id: "paymaster-check",         category: "Base Native", name: "Paymaster Check",           description: "Check if a contract qualifies for Base gas sponsorship via Paymaster", trigger: "Is contract eligible for Base Paymaster? " },
  { id: "base-bridge-status",      category: "Base Native", name: "Base Bridge",               description: "Check L1→L2 bridge status and estimate bridge time/cost",          trigger: "What's the current Base bridge status?" },
  { id: "base-mcp-contract-deploy",category: "Base Native", name: "Deploy to Base",            description: "Step-by-step deployment guide for contracts on Base with Hardhat/Foundry", trigger: "/ship " },
  { id: "base-account-abstraction",category: "Base Native", name: "Account Abstraction",       description: "Implement ERC-4337 smart accounts on Base with Coinbase Bundler",  trigger: "/build ERC-4337 account abstraction on Base" },
  { id: "base-mcp-token-launch",   category: "Base Native", name: "Base Token Launch",         description: "Full token launch pipeline on Base — contract, pool, launch, list", trigger: "Help me launch a token on Base" },
];
