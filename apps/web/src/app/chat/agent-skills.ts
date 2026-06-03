// Agent Skills — the raw capabilities Blue Agent has access to.
// Skills = prompt-grounded abilities backed by Bankr LLM + Base MCP.
// These are NOT hub tools (those are productized Tools with pricing).

export type SkillProvider = "Blue Agent" | "Bankr" | "Base MCP";
export type SkillStatus   = "active" | "available" | "soon";

export interface AgentSkill {
  id:          string;
  name:        string;
  description: string;
  provider:    SkillProvider;
  status:      SkillStatus;
  trigger?:    string;   // example prompt to invoke
  badge?:      string;   // e.g. "free", "x402", "Bankr API"
}

export const AGENT_SKILLS: AgentSkill[] = [
  // ── Blue Agent Core ─────────────────────────────────────────────────────────
  {
    id:          "blue-idea",
    name:        "Idea → Brief",
    description: "Turn a rough concept into a fundable brief — problem, why Base, MVP, risks, 24h plan",
    provider:    "Blue Agent",
    status:      "active",
    trigger:     "blue idea ",
    badge:       "free",
  },
  {
    id:          "blue-build",
    name:        "Build → Architecture",
    description: "Architecture, stack, folder structure, integrations, and test plan for Base projects",
    provider:    "Blue Agent",
    status:      "active",
    trigger:     "blue build ",
    badge:       "free",
  },
  {
    id:          "blue-audit",
    name:        "Audit → Security",
    description: "500+ security checks · reentrancy, oracle, MEV, x402, Coinbase Smart Wallet",
    provider:    "Blue Agent",
    status:      "active",
    trigger:     "blue audit ",
    badge:       "free",
  },
  {
    id:          "blue-ship",
    name:        "Ship → Deploy",
    description: "Deployment checklist, verification steps, release notes, monitoring plan",
    provider:    "Blue Agent",
    status:      "active",
    trigger:     "blue ship ",
    badge:       "free",
  },
  {
    id:          "blue-raise",
    name:        "Raise → Pitch",
    description: "Fundraising narrative, investor deck, smart money map, competitive landscape",
    provider:    "Blue Agent",
    status:      "active",
    trigger:     "blue raise ",
    badge:       "free",
  },

  // ── Bankr Agent Skills ───────────────────────────────────────────────────────
  {
    id:          "bankr-wallet-pnl",
    name:        "Wallet PnL",
    description: "Realized and unrealized PnL for any wallet on Base via Bankr",
    provider:    "Bankr",
    status:      "active",
    trigger:     "What's the PnL for wallet ",
    badge:       "Bankr API",
  },
  {
    id:          "bankr-token-price",
    name:        "Token Price",
    description: "Live price, volume, and market cap for any Base token",
    provider:    "Bankr",
    status:      "active",
    trigger:     "What's the current price of ",
    badge:       "Bankr API",
  },
  {
    id:          "bankr-top-holders",
    name:        "Top Holders",
    description: "Whale concentration and top holder list for any token",
    provider:    "Bankr",
    status:      "active",
    trigger:     "Show top holders for token ",
    badge:       "Bankr API",
  },
  {
    id:          "bankr-portfolio",
    name:        "Portfolio Breakdown",
    description: "Full on-chain portfolio — tokens, NFTs, DeFi positions",
    provider:    "Bankr",
    status:      "active",
    trigger:     "/wallet ",
    badge:       "Bankr API",
  },
  {
    id:          "bankr-transfers",
    name:        "Token Transfers",
    description: "Latest transfers and wallet activity for any address on Base",
    provider:    "Bankr",
    status:      "active",
    trigger:     "Show recent transfers for wallet ",
    badge:       "Bankr API",
  },
  {
    id:          "bankr-lp",
    name:        "LP Positions",
    description: "Active Uniswap V3/V4 liquidity positions on Base",
    provider:    "Bankr",
    status:      "active",
    trigger:     "Show LP positions for ",
    badge:       "Bankr API",
  },
  {
    id:          "bankr-nft-floor",
    name:        "NFT Floor Tracker",
    description: "Floor price and volume for Base NFT collections",
    provider:    "Bankr",
    status:      "active",
    trigger:     "Track NFT floor for collection ",
    badge:       "Bankr API",
  },

  // ── Base MCP ─────────────────────────────────────────────────────────────────
  {
    id:          "base-gas-oracle",
    name:        "Gas Oracle",
    description: "Current Base L2 gas prices and fee estimation for transactions",
    provider:    "Base MCP",
    status:      "active",
    trigger:     "What are current Base gas prices?",
    badge:       "Base MCP",
  },
  {
    id:          "base-block-info",
    name:        "Block Info",
    description: "Latest Base block height, timestamp, and network health",
    provider:    "Base MCP",
    status:      "active",
    trigger:     "Show latest Base block information",
    badge:       "Base MCP",
  },
  {
    id:          "base-read-contract",
    name:        "Read Contract",
    description: "Read public state from any verified contract on Base",
    provider:    "Base MCP",
    status:      "active",
    trigger:     "Read the state of Base contract ",
    badge:       "Base MCP",
  },
  {
    id:          "base-basename",
    name:        "Basename Lookup",
    description: "Resolve a .base.eth or Basename to an address",
    provider:    "Base MCP",
    status:      "active",
    trigger:     "Resolve this basename: ",
    badge:       "Base MCP",
  },
  {
    id:          "base-bridge",
    name:        "Base Bridge",
    description: "L1→L2 bridge status, estimate time and cost",
    provider:    "Base MCP",
    status:      "active",
    trigger:     "What's the current Base bridge status?",
    badge:       "Base MCP",
  },
  {
    id:          "base-smart-wallet",
    name:        "Smart Wallet",
    description: "Set up or analyze a Coinbase Smart Wallet on Base",
    provider:    "Base MCP",
    status:      "active",
    trigger:     "Help me set up a Coinbase Smart Wallet",
    badge:       "Base MCP",
  },
  {
    id:          "base-paymaster",
    name:        "Paymaster Check",
    description: "Check if a contract qualifies for Base gas sponsorship",
    provider:    "Base MCP",
    status:      "active",
    trigger:     "Is this contract eligible for Base Paymaster? ",
    badge:       "Base MCP",
  },
  {
    id:          "base-deploy",
    name:        "Deploy to Base",
    description: "Step-by-step deployment guide with Hardhat or Foundry",
    provider:    "Base MCP",
    status:      "active",
    trigger:     "Help me deploy a contract to Base",
    badge:       "Base MCP",
  },
  {
    id:          "base-erc4337",
    name:        "Account Abstraction",
    description: "ERC-4337 smart accounts on Base with Coinbase Bundler",
    provider:    "Base MCP",
    status:      "soon",
    trigger:     "/build ERC-4337 account abstraction on Base",
    badge:       "Base MCP",
  },
  {
    id:          "base-token-launch",
    name:        "Token Launch Pipeline",
    description: "Full token launch — contract, Uniswap pool, launch, list",
    provider:    "Base MCP",
    status:      "soon",
    trigger:     "Help me launch a token on Base",
    badge:       "Base MCP",
  },
];

export const SKILL_PROVIDERS: SkillProvider[] = ["Blue Agent", "Bankr", "Base MCP"];

export const PROVIDER_COLORS: Record<SkillProvider, string> = {
  "Blue Agent": "#4FC3F7",
  "Bankr":      "#A78BFA",
  "Base MCP":   "#34D399",
};

export const PROVIDER_ICONS: Record<SkillProvider, string> = {
  "Blue Agent": "⚡",
  "Bankr":      "🔮",
  "Base MCP":   "🔵",
};
