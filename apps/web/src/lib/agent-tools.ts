// ─── Agent Tool types & seeded data ──────────────────────────────────────────

export type AgentToolInput = {
  key: string;
  label: string;
  placeholder: string;
  required?: boolean;
};

export type CompositeSkill = {
  agentType: "aeon" | "blue" | "miroshark";
  skillId?: string;
  skillFiles?: string[];
  label: string;
};

const X402_BASE = "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5";

export type AgentTool = {
  id: string;
  name: string;
  description: string;
  agentHandle: string;
  agentName: string;
  agentType: "aeon" | "blue" | "miroshark" | "composite";
  category: string;
  skillId?: string;
  skillFiles?: string[];
  inputs: AgentToolInput[];
  isComposite: boolean;
  compositeSkills?: CompositeSkill[];
  featured?: boolean;
  // x402 payment
  price?: string;          // e.g. "$0.20"
  priceUSDC?: number;      // in USDC units (6 decimals), e.g. 200000 = $0.20
  x402Url?: string;        // full x402 endpoint URL — if set, payment is required
  x402Body?: (values: Record<string, string>) => Record<string, unknown>; // maps hub inputs → x402 body
};

// ─── Seeded tools ─────────────────────────────────────────────────────────────

export const AGENT_TOOLS: AgentTool[] = [
  // ── Aeon tools ──────────────────────────────────────────────────────────
  {
    id: "aeon-token-movers",
    name: "Token Movers",
    description: "Top gainers, losers, and trending tokens — filtered for signal vs noise.",
    agentHandle: "aaronjmars-aeon",
    agentName: "Aeon",
    agentType: "aeon",
    category: "market",
    skillId: "token-movers",
    inputs: [{ key: "focus", label: "Focus (optional)", placeholder: "e.g. Base tokens, L2, memecoins" }],
    isComposite: false,
    featured: true,
    price: "$0.25",
    priceUSDC: 250000,
    x402Url: `${X402_BASE}/token-momentum-scanner`,
    x402Body: (v) => ({ chain: "base", context: v.focus ?? "" }),
  },
  {
    id: "aeon-narrative-tracker",
    name: "Narrative Tracker",
    description: "Which narratives are building vs peaking on CT right now.",
    agentHandle: "aaronjmars-aeon",
    agentName: "Aeon",
    agentType: "aeon",
    category: "market",
    skillId: "narrative-tracker",
    inputs: [{ key: "focus", label: "Narrative focus (optional)", placeholder: "e.g. AI agents, RWA, DeFi" }],
    isComposite: false,
    featured: true,
    price: "$0.25",
    priceUSDC: 250000,
    x402Url: `${X402_BASE}/narrative-position`,
    x402Body: (v) => ({ topic: v.focus ?? "" }),
  },
  {
    id: "aeon-token-pick",
    name: "Token Pick",
    description: "Highest-conviction asymmetric token setup right now.",
    agentHandle: "aaronjmars-aeon",
    agentName: "Aeon",
    agentType: "aeon",
    category: "market",
    skillId: "token-pick",
    inputs: [{ key: "focus", label: "Category (optional)", placeholder: "e.g. low-cap DeFi, AI agent tokens" }],
    isComposite: false,
    featured: true,
    price: "$0.20",
    priceUSDC: 200000,
    x402Url: `${X402_BASE}/token-pick-signal`,
    x402Body: (v) => ({ chain: "base", context: v.focus ?? "" }),
  },
  {
    id: "aeon-deep-research",
    name: "Deep Research",
    description: "Full research memo on any token, project, or narrative.",
    agentHandle: "aaronjmars-aeon",
    agentName: "Aeon",
    agentType: "aeon",
    category: "research",
    skillId: "deep-research",
    inputs: [
      { key: "topic", label: "Topic", placeholder: "Token name, project, or narrative to research", required: true },
    ],
    isComposite: false,
    price: "$1.00",
    priceUSDC: 1000000,
    x402Url: `${X402_BASE}/builder-deep-dd`,
    x402Body: (v) => ({ target: v.topic ?? "", type: "project" }),
  },
  {
    id: "aeon-morning-brief",
    name: "Morning Brief",
    description: "Overnight market moves, key events, and what to watch today.",
    agentHandle: "aaronjmars-aeon",
    agentName: "Aeon",
    agentType: "aeon",
    category: "market",
    skillId: "morning-brief",
    inputs: [{ key: "focus", label: "Focus (optional)", placeholder: "e.g. DeFi, Base ecosystem, macro" }],
    isComposite: false,
    price: "$0.20",
    priceUSDC: 200000,
    x402Url: `${X402_BASE}/ecosystem-digest`,
    x402Body: (v) => ({ focus: v.focus ?? "" }),
  },
  {
    id: "aeon-digest",
    name: "Ecosystem Digest",
    description: "Weekly digest of top projects, launches, and ecosystem moves.",
    agentHandle: "aaronjmars-aeon",
    agentName: "Aeon",
    agentType: "aeon",
    category: "research",
    skillId: "digest",
    inputs: [{ key: "focus", label: "Ecosystem focus", placeholder: "e.g. Base, Ethereum, AI agents" }],
    isComposite: false,
    price: "$0.20",
    priceUSDC: 200000,
    x402Url: `${X402_BASE}/ecosystem-digest`,
    x402Body: (v) => ({ focus: v.focus ?? "" }),
  },
  {
    id: "aeon-defi-monitor",
    name: "DeFi Monitor",
    description: "DeFi protocol health — TVL signals, yield opportunities, risk flags.",
    agentHandle: "aaronjmars-aeon",
    agentName: "Aeon",
    agentType: "aeon",
    category: "defi",
    skillId: "defi-monitor",
    inputs: [{ key: "protocol", label: "Protocol (optional)", placeholder: "e.g. Aave, Aerodrome, Morpho" }],
    isComposite: false,
    price: "$0.35",
    priceUSDC: 350000,
    x402Url: `${X402_BASE}/protocol-risk-monitor`,
    x402Body: (v) => ({ protocol: v.protocol ?? "Base DeFi" }),
  },
  {
    id: "aeon-defi-overview",
    name: "DeFi Overview",
    description: "Full DeFi landscape scan — best opportunities across protocols.",
    agentHandle: "aaronjmars-aeon",
    agentName: "Aeon",
    agentType: "aeon",
    category: "defi",
    skillId: "defi-overview",
    inputs: [{ key: "risk", label: "Risk tolerance", placeholder: "low / medium / high" }],
    isComposite: false,
    price: "$0.35",
    priceUSDC: 350000,
    x402Url: `${X402_BASE}/defi-opportunity`,
    x402Body: (v) => ({ strategy: "yield farming", risk_tolerance: v.risk ?? "medium" }),
  },
  {
    id: "aeon-competitor-launch-radar",
    name: "Competitor Launch Radar",
    description: "Recent competitor launches and what they signal for your market.",
    agentHandle: "aaronjmars-aeon",
    agentName: "Aeon",
    agentType: "aeon",
    category: "builder",
    skillId: "competitor-launch-radar",
    inputs: [{ key: "market", label: "Your market", placeholder: "e.g. DeFi aggregators, AI agent tooling", required: true }],
    isComposite: false,
    price: "$0.75",
    priceUSDC: 750000,
    x402Url: `${X402_BASE}/competitor-scan`,
    x402Body: (v) => ({ project: v.market ?? "", description: v.market ?? "" }),
  },
  {
    id: "aeon-github-trending",
    name: "GitHub Trending",
    description: "Trending repos in Web3 and AI — what builders are shipping.",
    agentHandle: "aaronjmars-aeon",
    agentName: "Aeon",
    agentType: "aeon",
    category: "builder",
    skillId: "github-trending",
    inputs: [{ key: "focus", label: "Focus (optional)", placeholder: "e.g. Solidity, TypeScript, AI agents" }],
    isComposite: false,
    price: "$0.35",
    priceUSDC: 350000,
    x402Url: `${X402_BASE}/repo-health`,
    x402Body: (v) => ({ description: v.focus ?? "Web3 trending repos" }),
  },
  {
    id: "aeon-deal-flow",
    name: "Deal Flow",
    description: "Active funding rounds, notable raises, and investor signals.",
    agentHandle: "aaronjmars-aeon",
    agentName: "Aeon",
    agentType: "aeon",
    category: "builder",
    skillId: "deal-flow",
    inputs: [{ key: "stage", label: "Stage (optional)", placeholder: "e.g. seed, Series A, pre-launch" }],
    isComposite: false,
    price: "$0.35",
    priceUSDC: 350000,
    x402Url: `${X402_BASE}/base-grant-finder`,
    x402Body: (v) => ({ stage: v.stage ?? "early", sector: "DeFi / AI agents" }),
  },
  {
    id: "aeon-security",
    name: "Security Brief",
    description: "Recent exploits, vulnerabilities, and security patterns to watch.",
    agentHandle: "aaronjmars-aeon",
    agentName: "Aeon",
    agentType: "aeon",
    category: "security",
    skillId: "security",
    inputs: [{ key: "focus", label: "Focus (optional)", placeholder: "e.g. DeFi bridges, AMMs, lending" }],
    isComposite: false,
    price: "$0.35",
    priceUSDC: 350000,
    x402Url: `${X402_BASE}/protocol-risk-monitor`,
    x402Body: (v) => ({ protocol: v.focus ?? "Base DeFi", position: "security audit" }),
  },

  // ── Composite tools ──────────────────────────────────────────────────────
  {
    id: "composite-base-market-intel",
    name: "Base Market Intel Pack",
    description: "Movers + narratives + top pick — synthesized into one actionable brief.",
    agentHandle: "composite",
    agentName: "Blue + Aeon",
    agentType: "composite",
    category: "market",
    inputs: [{ key: "focus", label: "Focus (optional)", placeholder: "e.g. Base DeFi, AI agent tokens" }],
    isComposite: true,
    compositeSkills: [
      { agentType: "aeon", skillId: "token-movers",      label: "Token Movers" },
      { agentType: "aeon", skillId: "narrative-tracker", label: "Narrative Tracker" },
      { agentType: "aeon", skillId: "token-pick",        label: "Token Pick" },
    ],
    featured: true,
    price: "$0.35",
    priceUSDC: 350000,
    x402Url: `${X402_BASE}/market-fit`,
    x402Body: (v) => ({ description: v.focus ?? "Base ecosystem market analysis", name: "Market Intel" }),
  },
  {
    id: "composite-builder-intel",
    name: "Builder Intel Pack",
    description: "Deep research + competitor launches + GitHub signals — full builder context.",
    agentHandle: "composite",
    agentName: "Blue + Aeon",
    agentType: "composite",
    category: "builder",
    inputs: [{ key: "market", label: "Your market / project", placeholder: "e.g. Base AI agent tooling, DeFi automation", required: true }],
    isComposite: true,
    compositeSkills: [
      { agentType: "aeon", skillId: "deep-research",           label: "Deep Research" },
      { agentType: "aeon", skillId: "competitor-launch-radar", label: "Competitor Radar" },
      { agentType: "aeon", skillId: "github-trending",         label: "GitHub Trending" },
    ],
    featured: true,
    price: "$1.00",
    priceUSDC: 1000000,
    x402Url: `${X402_BASE}/builder-deep-dd`,
    x402Body: (v) => ({ target: v.market ?? "", type: "project", context: "Base ecosystem builder intelligence" }),
  },
  {
    id: "composite-defi-full-scan",
    name: "DeFi Full Scan",
    description: "DeFi monitor + overview + token movers — complete DeFi opportunity scan.",
    agentHandle: "composite",
    agentName: "Blue + Aeon",
    agentType: "composite",
    category: "defi",
    inputs: [{ key: "focus", label: "Protocol focus (optional)", placeholder: "e.g. Base DeFi, lending, DEX" }],
    isComposite: true,
    compositeSkills: [
      { agentType: "aeon", skillId: "defi-monitor",  label: "DeFi Monitor" },
      { agentType: "aeon", skillId: "defi-overview", label: "DeFi Overview" },
      { agentType: "aeon", skillId: "token-movers",  label: "Token Movers" },
    ],
    price: "$0.35",
    priceUSDC: 350000,
    x402Url: `${X402_BASE}/defi-opportunity`,
    x402Body: (v) => ({ strategy: v.focus ?? "yield farming", risk_tolerance: "medium" }),
  },
  {
    id: "composite-morning-alpha",
    name: "Morning Alpha Pack",
    description: "Morning brief + token pick + narratives — everything to start your day.",
    agentHandle: "composite",
    agentName: "Blue + Aeon",
    agentType: "composite",
    category: "market",
    inputs: [{ key: "focus", label: "Focus (optional)", placeholder: "e.g. Base ecosystem, macro" }],
    isComposite: true,
    compositeSkills: [
      { agentType: "aeon", skillId: "morning-brief",     label: "Morning Brief" },
      { agentType: "aeon", skillId: "token-pick",        label: "Token Pick" },
      { agentType: "aeon", skillId: "narrative-tracker", label: "Narrative Tracker" },
    ],
    featured: true,
    price: "$0.35",
    priceUSDC: 350000,
    x402Url: `${X402_BASE}/narrative-position`,
    x402Body: (v) => ({ topic: v.focus ?? "Base ecosystem morning alpha" }),
  },
  {
    id: "composite-security-defi",
    name: "DeFi Security Pack",
    description: "Security brief + DeFi monitor — risk-first scan before deploying capital.",
    agentHandle: "composite",
    agentName: "Blue + Aeon",
    agentType: "composite",
    category: "security",
    inputs: [{ key: "focus", label: "Protocol / chain focus", placeholder: "e.g. Base lending protocols, bridges" }],
    isComposite: true,
    compositeSkills: [
      { agentType: "aeon", skillId: "security",     label: "Security Brief" },
      { agentType: "aeon", skillId: "defi-monitor", label: "DeFi Monitor" },
    ],
    price: "$0.35",
    priceUSDC: 350000,
    x402Url: `${X402_BASE}/protocol-risk-monitor`,
    x402Body: (v) => ({ protocol: v.focus ?? "Base DeFi", position: "security + DeFi scan" }),
  },
];
