/**
 * api.blueagent.dev — open API marketplace catalog.
 *
 * Featured row: showcase providers + reserved slots + 1 open invitation.
 * All APIs grid: the actual endpoints currently registered. Right now this is
 * Blue Agent's first-party catalog (the seed provider); community APIs join
 * here as they complete /submit.
 */

export interface MarketplaceAPI {
  id:          string;
  name:        string;             // public display name
  provider:    string;             // who owns it (agent or builder handle)
  desc:        string;             // 1-line pitch
  category:    string;
  price:       string;             // "$0.05" — display
  priceNum:    number;             // for sort
  endpoint:    string;             // call URL (or "—" if not yet exposed)
  calls:       number;             // lifetime calls
  verified:    boolean;            // Blue Agent reviewed
  aiReady:     boolean;            // structured JSON output
  featured:    boolean;
  status:      "live" | "pending" | "reserved";
  releasedAt:  string;             // ISO date
  icon?:       string;             // emoji or 1-letter
  toolsCount?: number;             // for providers exposing multiple tools
}

// Blue Agent's API base — every endpoint hangs off here.
const BLUE = "blueagent.dev/api/x402";

// ─── FEATURED ROW ─────────────────────────────────────────────────────────────
// 3 standout Blue Agent APIs + 2 reserved partner slots + 1 open invitation.

const FEATURED: MarketplaceAPI[] = [
  { id: "blue-search",      name: "Blue Search",         provider: "Blue Agent", desc: "Vertical search engine for the Base ecosystem — docs, projects, x402, MCP. Returns ranked snippets with citations.", category: "Intelligence", price: "$0.05", priceNum: 0.05, endpoint: "api.blueagent.dev/api/blue-search", calls: 0, verified: true, aiReady: true, featured: true, status: "live", releasedAt: "2026-06-08", icon: "🔵" },
  { id: "launch-simulator", name: "Launch Simulator",    provider: "Blue Agent", desc: "3-agent pre-launch intelligence with risk matrix.", category: "Multi-Agent",  price: "$0.50", priceNum: 0.50, endpoint: `${BLUE}/launch-simulator`, calls: 412, verified: true, aiReady: true, featured: true, status: "live", releasedAt: "2024-08-12", icon: "🚀" },
  { id: "deep-analysis",    name: "Deep Token Analysis", provider: "Blue Agent", desc: "Multi-agent fundamentals + sentiment + on-chain DD.",category: "Intelligence", price: "$1.00", priceNum: 1.00, endpoint: `${BLUE}/deep-analysis`,    calls: 318, verified: true, aiReady: true, featured: true, status: "live", releasedAt: "2024-07-22", icon: "🔬" },
  { id: "honeypot-check",   name: "Honeypot Check",      provider: "Blue Agent", desc: "Detect rug-pull / honeypot patterns before trade.",  category: "Security",     price: "$0.05", priceNum: 0.05, endpoint: `${BLUE}/honeypot-check`,   calls: 1023,verified: true, aiReady: true, featured: true, status: "live", releasedAt: "2024-06-15", icon: "🛡️" },

  // Reserved partner slots (onboarding)
  { id: "aeon-signals",      name: "Aeon Signals API",    provider: "Aeon",      desc: "Ecosystem signals, narrative tracking, token picks on Base.", category: "Intelligence", price: "—", priceNum: 0, endpoint: "—", calls: 0, verified: false, aiReady: true, featured: true, status: "reserved", releasedAt: "2026-06-10", icon: "🌊" },
  { id: "miroshark-consensus",name:"MiroShark Consensus", provider: "MiroShark", desc: "Multi-persona sentiment + crowd intelligence for trade decisions.",category: "Intelligence", price: "—", priceNum: 0, endpoint: "—", calls: 0, verified: false, aiReady: true, featured: true, status: "reserved", releasedAt: "2026-06-10", icon: "🦈" },

  // Open invitation
  { id: "your-api-here",    name: "Your API here",       provider: "—",         desc: "Register your API on Blue Agent MCP. Any AI agent can call it once you're listed.", category: "—", price: "—", priceNum: 0, endpoint: "—", calls: 0, verified: false, aiReady: false, featured: true, status: "pending", releasedAt: "2026-06-08", icon: "➕" },
];

// ─── ALL APIs ─────────────────────────────────────────────────────────────────
// Blue Agent's actual catalog. All live, verified, aiReady, provider = "Blue Agent".

const ALL: MarketplaceAPI[] = [
  // Console commands (5)
  { id: "blue-idea",   name: "Blue Idea Brief",        provider: "Blue Agent", desc: "Turn a concept into a fundable brief in 60 seconds.",        category: "Builder",      price: "$0.05", priceNum: 0.05, endpoint: `${BLUE}/blue-idea`,    calls: 743, verified: true, aiReady: true, featured: false, status: "live", releasedAt: "2024-06-01", icon: "💡" },
  { id: "blue-build",  name: "Blue Build",              provider: "Blue Agent", desc: "Architecture + stack + folder structure for any project.",   category: "Builder",      price: "$0.50", priceNum: 0.50, endpoint: `${BLUE}/blue-build`,   calls: 312, verified: true, aiReady: true, featured: false, status: "live", releasedAt: "2024-06-08", icon: "🏗️" },
  { id: "blue-audit",  name: "Blue Audit",              provider: "Blue Agent", desc: "500+ security checks · 13 categories · Base-native.",        category: "Security",     price: "$1.00", priceNum: 1.00, endpoint: `${BLUE}/blue-audit`,   calls: 198, verified: true, aiReady: true, featured: false, status: "live", releasedAt: "2024-07-18", icon: "🔍" },
  { id: "blue-ship",   name: "Blue Ship",               provider: "Blue Agent", desc: "Deployment checklist + monitoring plan + release notes.",    category: "Builder",      price: "$0.10", priceNum: 0.10, endpoint: `${BLUE}/blue-ship`,    calls: 274, verified: true, aiReady: true, featured: false, status: "live", releasedAt: "2024-06-08", icon: "🚢" },
  { id: "blue-raise",  name: "Blue Raise",              provider: "Blue Agent", desc: "Fundraising narrative + smart-money map for your raise.",    category: "Builder",      price: "$0.20", priceNum: 0.20, endpoint: `${BLUE}/blue-raise`,   calls: 187, verified: true, aiReady: true, featured: false, status: "live", releasedAt: "2024-06-08", icon: "💰" },

  // Intelligence
  { id: "token-pick-signal", name: "Token Pick Signal",  provider: "Blue Agent", desc: "Asymmetric token setups on Base — daily picks.",            category: "Intelligence", price: "$0.20", priceNum: 0.20, endpoint: `${BLUE}/token-pick-signal`, calls: 654, verified: true, aiReady: true, featured: false, status: "live", releasedAt: "2024-08-30", icon: "🎯" },
  { id: "narrative-position",name: "Narrative Position", provider: "Blue Agent", desc: "Where capital is rotating — narrative-by-narrative.",        category: "Intelligence", price: "$0.20", priceNum: 0.20, endpoint: `${BLUE}/narrative-position`,calls: 372, verified: true, aiReady: true, featured: false, status: "live", releasedAt: "2024-09-12", icon: "🌊" },
  { id: "ecosystem-digest",  name: "Ecosystem Digest",   provider: "Blue Agent", desc: "Daily Base ecosystem brief — protocols, agents, drops.",     category: "Intelligence", price: "$0.15", priceNum: 0.15, endpoint: `${BLUE}/ecosystem-digest`,  calls: 268, verified: true, aiReady: true, featured: false, status: "live", releasedAt: "2024-10-01", icon: "📰" },
  { id: "market-fit",        name: "Market Fit Validator",provider:"Blue Agent", desc: "Validate your product idea against Base market signals.",   category: "Builder",      price: "$0.30", priceNum: 0.30, endpoint: `${BLUE}/market-fit`,        calls: 156, verified: true, aiReady: true, featured: false, status: "live", releasedAt: "2024-09-25", icon: "🎯" },
  { id: "investor-memo",     name: "Investor Memo",      provider: "Blue Agent", desc: "Pitch narrative, comps, smart-money map for raise.",        category: "Builder",      price: "$0.50", priceNum: 0.50, endpoint: `${BLUE}/investor-memo`,     calls: 287, verified: true, aiReady: true, featured: false, status: "live", releasedAt: "2024-09-01", icon: "📑" },
  { id: "builder-deep-dd",   name: "Builder Deep DD",    provider: "Blue Agent", desc: "Comprehensive builder due-diligence by X handle.",          category: "Intelligence", price: "$0.40", priceNum: 0.40, endpoint: `${BLUE}/builder-deep-dd`,   calls: 84,  verified: true, aiReady: true, featured: false, status: "live", releasedAt: "2024-11-08", icon: "👤" },
  { id: "fundraise-timing",  name: "Fundraise Timing",   provider: "Blue Agent", desc: "Optimal fundraise timing windows for your sector.",         category: "Intelligence", price: "$0.30", priceNum: 0.30, endpoint: `${BLUE}/fundraise-timing`,  calls: 112, verified: true, aiReady: true, featured: false, status: "live", releasedAt: "2024-10-19", icon: "⏰" },

  // Trading
  { id: "token-momentum",     name: "Token Momentum Scanner", provider: "Blue Agent", desc: "Real-time momentum scan with filterable thresholds.", category: "Trading",  price: "$0.25", priceNum: 0.25, endpoint: `${BLUE}/token-momentum`,        calls: 298, verified: true, aiReady: true, featured: false, status: "live", releasedAt: "2024-08-25", icon: "📈" },
  { id: "whale-copy-signal",  name: "Whale Copy Signal",      provider: "Blue Agent", desc: "Mirror profitable whale moves with risk-adjusted sizing.",category: "Trading", price: "$0.30", priceNum: 0.30, endpoint: `${BLUE}/whale-copy-signal`,    calls: 217, verified: true, aiReady: true, featured: false, status: "live", releasedAt: "2024-08-17", icon: "🐋" },
  { id: "portfolio-rebalancer",name:"Portfolio Rebalancer",   provider: "Blue Agent", desc: "Suggest rebalance trades to hit your target allocation.",category:"Trading", price: "$0.30", priceNum: 0.30, endpoint: `${BLUE}/portfolio-rebalancer`, calls: 134, verified: true, aiReady: true, featured: false, status: "live", releasedAt: "2024-09-10", icon: "⚖️" },

  // Security
  { id: "risk-gate",            name: "Risk Gate",            provider: "Blue Agent", desc: "Pre-trade safety check across multiple signals.",     category: "Security", price: "$0.10", priceNum: 0.10, endpoint: `${BLUE}/risk-gate`,            calls: 612, verified: true, aiReady: true, featured: false, status: "live", releasedAt: "2024-07-01", icon: "🚦" },
  { id: "aml-screen",           name: "AML Screen",           provider: "Blue Agent", desc: "Anti-money-laundering screening on any wallet.",       category: "Security", price: "$0.30", priceNum: 0.30, endpoint: `${BLUE}/aml-screen`,           calls: 145, verified: true, aiReady: true, featured: false, status: "live", releasedAt: "2024-09-05", icon: "🔒" },
  { id: "contract-trust",       name: "Contract Trust",       provider: "Blue Agent", desc: "Trust score for any verified Base smart contract.",    category: "Security", price: "$0.20", priceNum: 0.20, endpoint: `${BLUE}/contract-trust`,       calls: 89,  verified: true, aiReady: true, featured: false, status: "live", releasedAt: "2024-10-12", icon: "📜" },
  { id: "protocol-risk-monitor",name:"Protocol Risk Monitor", provider: "Blue Agent", desc: "Live risk score for any Base DeFi protocol.",          category: "Security", price: "$0.20", priceNum: 0.20, endpoint: `${BLUE}/protocol-risk-monitor`,calls: 124, verified: true, aiReady: true, featured: false, status: "live", releasedAt: "2024-10-14", icon: "🛡️" },

  // On-chain Data
  { id: "wallet-pnl",     name: "Wallet PnL",         provider: "Blue Agent", desc: "On-chain PnL analysis with cost-basis tracking.",       category: "On-chain", price: "$0.25", priceNum: 0.25, endpoint: `${BLUE}/wallet-pnl`,     calls: 491, verified: true, aiReady: true, featured: false, status: "live", releasedAt: "2024-07-05", icon: "💹" },
  { id: "whale-tracker",  name: "Whale Tracker",      provider: "Blue Agent", desc: "Top holders + recent inflow/outflow for any token.",    category: "On-chain", price: "$0.20", priceNum: 0.20, endpoint: `${BLUE}/whale-tracker`,  calls: 532, verified: true, aiReady: true, featured: false, status: "live", releasedAt: "2024-08-04", icon: "🐋" },
  { id: "dex-flow",       name: "DEX Flow",           provider: "Blue Agent", desc: "Real-time DEX trade flow + buy/sell imbalance.",        category: "On-chain", price: "$0.20", priceNum: 0.20, endpoint: `${BLUE}/dex-flow`,       calls: 487, verified: true, aiReady: true, featured: false, status: "live", releasedAt: "2024-08-12", icon: "📊" },
  { id: "airdrop-check",  name: "Airdrop Check",      provider: "Blue Agent", desc: "Scan wallet for unclaimed airdrops on Base.",           category: "On-chain", price: "$0.05", priceNum: 0.05, endpoint: `${BLUE}/airdrop-check`,  calls: 891, verified: true, aiReady: true, featured: false, status: "live", releasedAt: "2024-06-22", icon: "🎁" },

  // Content
  { id: "thread-intelligence",  name: "Thread Intelligence",  provider: "Blue Agent", desc: "Viral thread analysis + draft generation for X.",   category: "Content", price: "$0.10", priceNum: 0.10, endpoint: `${BLUE}/thread-intelligence`,  calls: 226, verified: true, aiReady: true, featured: false, status: "live", releasedAt: "2024-09-18", icon: "🧵" },
  { id: "builder-brand-score",  name: "Builder Brand Score",  provider: "Blue Agent", desc: "Score a builder's brand strength on X / GitHub.",    category: "Content", price: "$0.15", priceNum: 0.15, endpoint: `${BLUE}/builder-brand-score`,  calls: 158, verified: true, aiReady: true, featured: false, status: "live", releasedAt: "2024-09-20", icon: "⭐" },
  { id: "community-sentiment",  name: "Community Sentiment",  provider: "Blue Agent", desc: "Multi-channel sentiment for any project or token.",  category: "Content", price: "$0.20", priceNum: 0.20, endpoint: `${BLUE}/community-sentiment`,  calls: 143, verified: true, aiReady: true, featured: false, status: "live", releasedAt: "2024-10-04", icon: "💬" },

  // Multi-Agent
  { id: "agent-collab-match",  name: "Agent Collab Match",     provider: "Blue Agent", desc: "Find best-fit agent partner for a goal or skill.",      category: "Multi-Agent", price: "$0.20", priceNum: 0.20, endpoint: `${BLUE}/agent-collab-match`,   calls: 67, verified: true, aiReady: true, featured: false, status: "live", releasedAt: "2024-10-22", icon: "🤝" },
  { id: "agent-revenue-opt",    name: "Agent Revenue Optimizer",provider: "Blue Agent", desc: "Optimize your AI agent's pricing + tool mix.",        category: "Multi-Agent", price: "$0.40", priceNum: 0.40, endpoint: `${BLUE}/agent-revenue-opt`,    calls: 51, verified: true, aiReady: true, featured: false, status: "live", releasedAt: "2024-10-30", icon: "💸" },
  { id: "multi-agent-workflow", name: "Multi-Agent Workflow",   provider: "Blue Agent", desc: "Compose N agents into a single callable workflow.",   category: "Multi-Agent", price: "$0.50", priceNum: 0.50, endpoint: `${BLUE}/multi-agent-workflow`, calls: 79, verified: true, aiReady: true, featured: false, status: "live", releasedAt: "2024-11-01", icon: "🔗" },

  // Other
  { id: "base-grant-finder",  name: "Base Grant Finder",    provider: "Blue Agent", desc: "Find Base ecosystem grants matched to your project.",    category: "Other", price: "$0.20", priceNum: 0.20, endpoint: `${BLUE}/base-grant-finder`,    calls: 167, verified: true, aiReady: true, featured: false, status: "live", releasedAt: "2024-09-28", icon: "🎓" },
  { id: "stack-recommender",  name: "Stack Recommender",    provider: "Blue Agent", desc: "Recommend best-fit stack + integrations for project type.",category:"Builder", price: "$0.15", priceNum: 0.15, endpoint: `${BLUE}/stack-recommender`,    calls: 91,  verified: true, aiReady: true, featured: false, status: "live", releasedAt: "2024-10-08", icon: "🧱" },
  { id: "repo-health",        name: "Repo Health",          provider: "Blue Agent", desc: "GitHub repo health score with actionable next steps.",  category: "Builder",   price: "$0.10", priceNum: 0.10, endpoint: `${BLUE}/repo-health`,           calls: 74,  verified: true, aiReady: true, featured: false, status: "live", releasedAt: "2024-11-04", icon: "🏥" },
];

export const APIS:       MarketplaceAPI[] = [...FEATURED, ...ALL];
export const CATEGORIES: string[]         = ["All", "Multi-Agent", "Intelligence", "Builder", "Trading", "Security", "On-chain", "Content", "Other"];
