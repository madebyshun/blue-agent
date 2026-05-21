"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";
import { useAccount, useConnect, useSignTypedData } from "wagmi";
import { injected } from "wagmi/connectors";
import { bestConnector } from "@/lib/wallet";

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

function randomNonce(): `0x${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}
function usdcAmt(raw: string) {
  const n = Number(raw);
  return isNaN(n) ? raw : `$${(n / 1_000_000).toFixed(4)}`;
}

// ─── Tool registry ──────────────────────────────────────────────────────────

type Agent = "blue" | "aeon" | "miroshark";
type Category = "all" | "intelligence" | "builder" | "trading" | "content" | "agent-economy" | "base-ecosystem" | "on-chain";
interface ToolInput { key: string; label: string; placeholder: string; required?: boolean; example?: string; }
interface Tool {
  id: string; name: string; cat: Category; price: string;
  agents: Agent[]; desc: string; inputs: ToolInput[]; featured?: boolean;
}

const FEATURED_IDS = ["launch-simulator", "investor-memo", "market-fit", "token-launch-readiness"];

const TOOLS: Tool[] = [
  // Intelligence
  { id: "token-pick-signal", name: "Token Pick Signal", cat: "intelligence", price: "$0.20", agents: ["blue","aeon","miroshark"], desc: "AI consensus on the highest-conviction asymmetric token setup on Base right now.", inputs: [
    { key: "context", label: "Market context (optional)", placeholder: "e.g. low-cap DeFi thesis", example: "low-cap AI agent tokens on Base, early accumulation" },
  ]},
  { id: "narrative-position", name: "Narrative Position", cat: "intelligence", price: "$0.15", agents: ["blue","aeon","miroshark"], desc: "Which narratives are building vs peaking on CT — and where to position.", inputs: [
    { key: "focus", label: "Narrative focus (optional)", placeholder: "e.g. AI agents, RWA, Base DeFi", example: "AI agents, onchain payments, Base DeFi" },
  ]},
  { id: "ecosystem-digest", name: "Ecosystem Digest", cat: "intelligence", price: "$0.20", agents: ["blue","aeon","miroshark"], desc: "Weekly Base ecosystem intelligence: top builders, protocols, and narratives.", inputs: [
    { key: "focus", label: "Focus area (optional)", placeholder: "e.g. DeFi protocols, NFT, gaming", example: "DeFi protocols and AI agent infrastructure" },
  ]},
  { id: "market-fit", name: "Market Fit Validator", cat: "intelligence", price: "$0.25", agents: ["blue","aeon","miroshark"], desc: "Score your product's market fit with swarm intelligence across three personas.", inputs: [
    { key: "product", label: "Product description", placeholder: "What you're building and for whom", required: true, example: "Blue Agent — AI founder console for Base builders. Idea, build, audit, ship, raise — all grounded in real Base knowledge." },
    { key: "stage", label: "Stage", placeholder: "e.g. idea, MVP, live", example: "MVP — live at blueagent.dev" },
  ]},
  { id: "token-launch-readiness", name: "Token Launch Readiness", cat: "intelligence", price: "$0.30", agents: ["blue","aeon","miroshark"], desc: "Go/no-go signal on whether your project is ready to launch a token.", inputs: [
    { key: "project", label: "Project description", placeholder: "What the project does", required: true, example: "Blue Agent — AI-native founder console for Base. 5 commands, 34 skills, 34 Hub tools. x402 micropayments." },
    { key: "traction", label: "Traction / metrics", placeholder: "e.g. 500 wallets, $10k revenue", example: "800+ Telegram members, $BLUEAGENT launched on Uniswap v4, 34 Hub tools live" },
  ]},
  // Builder
  { id: "roadmap-validator", name: "Roadmap Validator", cat: "builder", price: "$0.25", agents: ["blue","aeon","miroshark"], desc: "Validate your roadmap against market timing, execution risk, and narrative fit.", inputs: [
    { key: "project", label: "Project name", placeholder: "Project name", required: true, example: "Blue Agent" },
    { key: "roadmap", label: "Roadmap milestones", placeholder: "Q1: X, Q2: Y…", required: true, example: "Q2: Hub 34 tools live, x402 payments. Q3: CLI v2, AgentKit plugin, 100 tools. Q4: Blue Hub marketplace, revenue sharing." },
  ]},
  { id: "competitor-scan", name: "Competitor Scan", cat: "builder", price: "$0.20", agents: ["blue","aeon","miroshark"], desc: "Identify direct/indirect competitors and surface your defensible edge.", inputs: [
    { key: "project", label: "Your project", placeholder: "What you build", required: true, example: "Blue Agent — AI founder console for Base builders with 34 grounded skills" },
    { key: "category", label: "Category", placeholder: "e.g. DeFi lending, AI agent", example: "AI agent tooling and developer console" },
  ]},
  { id: "pitch-intelligence", name: "Pitch Intelligence", cat: "builder", price: "$0.30", agents: ["blue","aeon","miroshark"], desc: "Transform your deck into investor-grade pitch intelligence with narrative scoring.", inputs: [
    { key: "project", label: "Project", placeholder: "Project name", required: true, example: "Blue Agent" },
    { key: "pitch_summary", label: "Pitch summary", placeholder: "Problem, solution, traction, ask", required: true, example: "Problem: Base builders waste hours on hallucinated AI output. Solution: Blue Agent — 5 AI commands grounded in 34 verified skill files. Traction: $BLUEAGENT live, 34 Hub tools, 800+ community. Ask: $500k pre-seed to scale x402 revenue." },
  ]},
  { id: "fundraise-timing", name: "Fundraise Timing", cat: "builder", price: "$0.20", agents: ["blue","aeon","miroshark"], desc: "Is now the right time to raise? Market conditions, stage readiness, investor appetite.", inputs: [
    { key: "project", label: "Project", placeholder: "What you build", required: true, example: "Blue Agent — AI-native console for Base builders" },
    { key: "stage", label: "Stage & metrics", placeholder: "e.g. seed, 1k users, $5k MRR", example: "Pre-seed. 800 Telegram members, token launched, 34 tools live, ~$200 MRR from x402." },
  ]},
  { id: "gtm-brief", name: "GTM Brief", cat: "builder", price: "$0.25", agents: ["blue","aeon","miroshark"], desc: "Go-to-market playbook: channels, timing, messaging, and early adopter strategy.", inputs: [
    { key: "product", label: "Product", placeholder: "What you're launching", required: true, example: "Blue Hub — 34 AI tools powered by 3-agent consensus (Blue + Aeon + MiroShark), pay per use via x402" },
    { key: "target", label: "Target audience", placeholder: "e.g. Base DeFi degens, indie devs", example: "Base builders, indie hackers, DeFi founders, AI agent devs" },
  ]},
  { id: "stack-recommender", name: "Stack Recommender", cat: "builder", price: "$0.20", agents: ["blue","aeon","miroshark"], desc: "Optimal tech stack for Base builders — infra, tooling, protocols, integrations.", inputs: [
    { key: "project_type", label: "Project type", placeholder: "e.g. DeFi protocol, AI agent, NFT marketplace", required: true, example: "AI agent with x402 micropayments and onchain token rewards on Base" },
    { key: "constraints", label: "Constraints", placeholder: "e.g. solo dev, 2-week timeline", example: "Solo dev, 1-month timeline, TypeScript only" },
  ]},
  { id: "investor-memo", name: "Investor Memo", cat: "builder", price: "$0.35", agents: ["blue","aeon","miroshark"], desc: "Full investor memo: thesis, market, moat, risks, and ask — ready to send.", inputs: [
    { key: "project", label: "Project name", placeholder: "Project name", required: true, example: "Blue Agent" },
    { key: "description", label: "Description + traction", placeholder: "What you do + key metrics", required: true, example: "AI-native founder console for Base. 5 commands, 34 skills, 34 Hub tools, x402 micropayments. $BLUEAGENT token live on Uniswap v4. 800+ Telegram, ~$200/mo revenue." },
    { key: "ask", label: "Raise ask", placeholder: "e.g. $500k pre-seed", example: "$500k pre-seed" },
  ]},
  { id: "token-distribution-plan", name: "Token Distribution Plan", cat: "builder", price: "$0.30", agents: ["blue","aeon","miroshark"], desc: "Token allocation framework: team, community, investors, treasury, liquidity.", inputs: [
    { key: "project", label: "Project", placeholder: "Project name", required: true, example: "Blue Agent" },
    { key: "total_supply", label: "Total supply", placeholder: "e.g. 1,000,000,000", example: "1,000,000,000" },
    { key: "stage", label: "Stage", placeholder: "e.g. pre-launch, post-TGE", example: "Post-TGE, token live on Uniswap v4 Base" },
  ]},
  { id: "agent-performance", name: "Agent Performance", cat: "builder", price: "$0.25", agents: ["blue","aeon","miroshark"], desc: "Benchmark your AI agent's revenue, engagement, and retention metrics.", inputs: [
    { key: "agent_name", label: "Agent name", placeholder: "Your agent's name", required: true, example: "Blue Agent" },
    { key: "metrics", label: "Current metrics", placeholder: "e.g. 200 users, $50 revenue/week", example: "800 Telegram users, $200/mo x402 revenue, 34 tools, 5 commands" },
  ]},
  { id: "agent-collab-match", name: "Agent Collab Match", cat: "builder", price: "$0.20", agents: ["blue","aeon","miroshark"], desc: "Find agents that complement your tool and surface collab opportunities.", inputs: [
    { key: "agent_name", label: "Your agent", placeholder: "Agent name + what it does", required: true, example: "Blue Agent — AI founder console for Base builders, strategy + builder intelligence" },
    { key: "goal", label: "Collab goal", placeholder: "e.g. cross-promote, build joint tool", example: "Build joint tools combining market signals + builder intelligence" },
  ]},
  { id: "repo-health", name: "Repo Health", cat: "builder", price: "$0.20", agents: ["blue","aeon","miroshark"], desc: "Audit your GitHub repo health: code quality, docs, CI, contributor signals.", inputs: [
    { key: "repo_url", label: "GitHub repo URL", placeholder: "https://github.com/org/repo", required: true, example: "https://github.com/madebyshun/blue-agent" },
  ]},
  { id: "community-sentiment", name: "Community Sentiment", cat: "builder", price: "$0.20", agents: ["blue","aeon","miroshark"], desc: "Real-time sentiment analysis across your community channels.", inputs: [
    { key: "project", label: "Project / token", placeholder: "Project name or ticker", required: true, example: "$BLUEAGENT" },
    { key: "channels", label: "Channels", placeholder: "e.g. Twitter, Telegram, Discord", example: "Twitter (@blocky_agent), Telegram (t.me/blueagent_hub)" },
  ]},
  { id: "defi-opportunity", name: "DeFi Opportunity", cat: "builder", price: "$0.25", agents: ["blue","aeon","miroshark"], desc: "Scan Base DeFi for emerging yield, liquidity, and protocol opportunities.", inputs: [
    { key: "focus", label: "Focus (optional)", placeholder: "e.g. stablecoin yield, LP opportunities", example: "stablecoin yield and LP opportunities on Aerodrome" },
    { key: "risk_tolerance", label: "Risk tolerance", placeholder: "low / medium / high", example: "medium" },
  ]},
  { id: "builder-deep-dd", name: "Builder Deep DD", cat: "builder", price: "$0.35", agents: ["blue","aeon","miroshark"], desc: "Full due diligence on a Base builder: onchain activity, shipped products, credibility.", inputs: [
    { key: "builder", label: "Builder handle or address", placeholder: "@handle or 0x…", required: true, example: "@madebyshun" },
  ]},
  // Trading & Alpha
  { id: "whale-copy-signal", name: "Whale Copy Signal", cat: "trading", price: "$0.25", agents: ["blue","aeon","miroshark"], desc: "Track and copy high-alpha whale wallets on Base — entry, size, and timing.", inputs: [
    { key: "wallet", label: "Whale wallet (optional)", placeholder: "0x… or leave blank for top whales", example: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },
    { key: "token", label: "Token to watch (optional)", placeholder: "e.g. WETH, USDC, token ticker", example: "WETH" },
  ]},
  { id: "token-momentum-scanner", name: "Token Momentum Scanner", cat: "trading", price: "$0.20", agents: ["blue","aeon","miroshark"], desc: "Real-time momentum scan for Base tokens — breakouts, volume spikes, narrative alignment.", inputs: [
    { key: "timeframe", label: "Timeframe", placeholder: "e.g. 1h, 4h, 24h", example: "4h" },
    { key: "filter", label: "Filter", placeholder: "e.g. >$100k volume, Base only", example: ">$50k volume, Base only, AI narrative" },
  ]},
  { id: "portfolio-rebalancer", name: "Portfolio Rebalancer", cat: "trading", price: "$0.25", agents: ["blue","aeon","miroshark"], desc: "AI-driven portfolio rebalancing plan based on current Base market conditions.", inputs: [
    { key: "portfolio", label: "Current portfolio", placeholder: "e.g. 50% ETH, 30% USDC, 20% altcoins", required: true, example: "40% ETH, 30% USDC, 20% BLUEAGENT, 10% cbBTC" },
    { key: "goal", label: "Goal", placeholder: "e.g. reduce risk, maximize yield", example: "maximize yield while keeping 30% stable" },
  ]},
  // Content
  { id: "thread-intelligence", name: "Thread Intelligence", cat: "content", price: "$0.20", agents: ["blue","aeon","miroshark"], desc: "Turn your alpha or project update into a high-engagement X thread.", inputs: [
    { key: "topic", label: "Thread topic", placeholder: "What to write about", required: true, example: "Blue Hub launch — 34 AI tools powered by 3-agent consensus on Base" },
    { key: "angle", label: "Angle", placeholder: "e.g. alpha, announcement, educational", example: "announcement + alpha" },
  ]},
  { id: "builder-brand-score", name: "Builder Brand Score", cat: "content", price: "$0.25", agents: ["blue","aeon","miroshark"], desc: "Score your personal brand as a Base builder and get a growth playbook.", inputs: [
    { key: "handle", label: "X / Twitter handle", placeholder: "@handle", required: true, example: "@madebyshun" },
    { key: "focus", label: "What you build", placeholder: "e.g. DeFi tools, AI agents", example: "AI agents and developer tools on Base" },
  ]},
  { id: "community-growth-playbook", name: "Community Growth Playbook", cat: "content", price: "$0.25", agents: ["blue","aeon","miroshark"], desc: "Proven growth tactics for Base builder communities — from 0 to 1000 members.", inputs: [
    { key: "project", label: "Project name", placeholder: "Your project", required: true, example: "Blue Agent" },
    { key: "current_size", label: "Current community size", placeholder: "e.g. 50 Telegram, 200 Twitter", example: "800 Telegram, 1.2k Twitter followers" },
  ]},
  // Agent Economy
  { id: "agent-revenue-optimizer", name: "Agent Revenue Optimizer", cat: "agent-economy", price: "$0.30", agents: ["blue","aeon","miroshark"], desc: "Maximize your agent's x402 revenue: pricing, bundling, and distribution strategy.", inputs: [
    { key: "agent_name", label: "Agent name", placeholder: "Agent name", required: true, example: "Blue Agent" },
    { key: "tools", label: "Current tools / services", placeholder: "List your tools and prices", example: "34 Hub tools ($0.15–$2.00), 5 console commands ($0.05–$1.00), simulator ($0.50–$2.00)" },
    { key: "revenue", label: "Current revenue", placeholder: "e.g. $50/month", example: "$200/month from x402 micropayments" },
  ]},
  { id: "agent-token-strategy", name: "Agent Token Strategy", cat: "agent-economy", price: "$0.30", agents: ["blue","aeon","miroshark"], desc: "Design your agent token: utility, distribution, tokenomics, and launch strategy.", inputs: [
    { key: "agent_name", label: "Agent name", placeholder: "Agent name", required: true, example: "Blue Agent" },
    { key: "use_case", label: "Token use case", placeholder: "e.g. governance, access, rewards", example: "access gating for Hub tools, weekly rewards to builders, governance over skill file additions" },
  ]},
  { id: "multi-agent-workflow", name: "Multi-Agent Workflow", cat: "agent-economy", price: "$0.25", agents: ["blue","aeon","miroshark"], desc: "Design an automated workflow combining multiple agents for complex tasks.", inputs: [
    { key: "goal", label: "Workflow goal", placeholder: "What the workflow should accomplish", required: true, example: "Auto-generate weekly Base ecosystem report: Aeon scans market, MiroShark models crowd sentiment, Blue Agent synthesizes into thread" },
    { key: "agents", label: "Agents to use (optional)", placeholder: "e.g. Blue Agent, Aeon, custom", example: "Blue Agent, Aeon, MiroShark" },
  ]},
  // Base Ecosystem
  { id: "base-grant-finder", name: "Base Grant Finder", cat: "base-ecosystem", price: "$0.20", agents: ["blue","aeon","miroshark"], desc: "Find active grants, hackathons, and funding programs for Base builders.", inputs: [
    { key: "project_type", label: "Project type", placeholder: "e.g. DeFi, infrastructure, consumer app", required: true, example: "AI agent tooling and developer infrastructure" },
    { key: "stage", label: "Stage", placeholder: "e.g. idea, MVP, live", example: "MVP — live product with token" },
  ]},
  { id: "base-protocol-comparison", name: "Base Protocol Comparison", cat: "base-ecosystem", price: "$0.25", agents: ["blue","aeon","miroshark"], desc: "Side-by-side comparison of Base protocols for integrations and partnerships.", inputs: [
    { key: "category", label: "Protocol category", placeholder: "e.g. DEX, lending, bridges, oracles", required: true, example: "DEX" },
    { key: "use_case", label: "Your use case", placeholder: "What you need it for", example: "liquidity pool for agent token, low fee swaps" },
  ]},
  { id: "base-builder-network-match", name: "Builder Network Match", cat: "base-ecosystem", price: "$0.20", agents: ["blue","aeon","miroshark"], desc: "Connect with Base builders who complement your skill set and project.", inputs: [
    { key: "skills", label: "Your skills", placeholder: "e.g. Solidity, frontend, BD", required: true, example: "AI/LLM, Next.js, product, TypeScript" },
    { key: "looking_for", label: "Looking for", placeholder: "e.g. co-founder, advisor, collaborator", example: "Solidity co-founder, BD advisor, growth hacker" },
  ]},
  // On-chain Strategy
  { id: "wallet-strategy-analyzer", name: "Wallet Strategy Analyzer", cat: "on-chain", price: "$0.30", agents: ["blue","aeon","miroshark"], desc: "Deep analysis of any wallet's on-chain strategy, behavior patterns, and alpha signals.", inputs: [
    { key: "wallet", label: "Wallet address", placeholder: "0x…", required: true, example: "0xf31f59e7b8b58555f7871f71973a394c8f1bffe5" },
    { key: "focus", label: "Analysis focus (optional)", placeholder: "e.g. trading patterns, DeFi activity", example: "DeFi yield strategies and token accumulation patterns" },
  ]},
  { id: "protocol-risk-monitor", name: "Protocol Risk Monitor", cat: "on-chain", price: "$0.35", agents: ["blue","aeon","miroshark"], desc: "Real-time risk assessment for your DeFi positions — exit signals, risk scores.", inputs: [
    { key: "protocol", label: "Protocol", placeholder: "e.g. Aerodrome, Aave Base, Uniswap v4", required: true, example: "Aerodrome" },
    { key: "position", label: "Position details (optional)", placeholder: "e.g. ETH/USDC LP, $5k USDC lend", example: "ETH/USDC LP, $10k position" },
  ]},
  // Launch Simulator
  { id: "launch-simulator", name: "Launch Simulator", cat: "builder", price: "$0.50–$2.00", agents: ["blue","aeon","miroshark"], desc: "Simulate your token launch with 3-agent consensus: Blue strategy + Aeon market + MiroShark crowd.", inputs: [
    { key: "token_name", label: "Token name", placeholder: "e.g. $MYTOKEN", required: true, example: "$BLUEAGENT" },
    { key: "launch_price", label: "Launch price (USD)", placeholder: "e.g. 0.001", required: true, example: "0.001" },
    { key: "total_supply", label: "Total supply", placeholder: "e.g. 1000000000", example: "1000000000" },
    { key: "liquidity", label: "Initial liquidity (USD)", placeholder: "e.g. 50000", example: "50000" },
    { key: "tier", label: "Analysis tier", placeholder: "standard / deep / ultra", example: "standard" },
  ]},
];

const CATEGORIES: { key: Category; label: string }[] = [
  { key: "all",           label: "All" },
  { key: "intelligence",  label: "Intelligence" },
  { key: "builder",       label: "Builder" },
  { key: "trading",       label: "Trading" },
  { key: "content",       label: "Content" },
  { key: "agent-economy", label: "Agent Economy" },
  { key: "base-ecosystem",label: "Base Ecosystem" },
  { key: "on-chain",      label: "On-chain" },
];

const AGENT_COLORS: Record<Agent, string> = {
  blue:      "#4FC3F7",
  aeon:      "#A78BFA",
  miroshark: "#34D399",
};
const AGENT_LABELS: Record<Agent, string> = {
  blue:      "Blue",
  aeon:      "Aeon",
  miroshark: "MiroShark",
};

// ─── Generic result renderer ────────────────────────────────────────────────

function Value({ v }: { v: unknown }) {
  if (v === null || v === undefined) return <span className="text-slate-600">—</span>;
  if (typeof v === "boolean") return (
    <span className={v ? "text-[#34D399]" : "text-red-400"}>{v ? "✓ Yes" : "✗ No"}</span>
  );
  if (typeof v === "number") return <span className="text-[#4FC3F7] font-semibold">{v}</span>;
  if (typeof v === "string") {
    const lower = v.toLowerCase();
    if (["critical","exit_now","high"].includes(lower)) return <span className="text-red-400 font-semibold uppercase">{v}</span>;
    if (["medium","reduce"].includes(lower)) return <span className="text-amber-400 font-semibold uppercase">{v}</span>;
    if (["low","minimal","hold","add","yes","bullish","strong"].includes(lower)) return <span className="text-[#34D399] font-semibold uppercase">{v}</span>;
    return <span className="text-slate-200">{v}</span>;
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return <span className="text-slate-600">—</span>;
    if (typeof v[0] === "string") return (
      <ul className="mt-1 space-y-1">
        {v.map((s, i) => <li key={i} className="text-slate-300 text-xs before:content-['·'] before:text-[#4FC3F7] before:mr-2">{s}</li>)}
      </ul>
    );
    return (
      <div className="mt-1 space-y-2">
        {(v as Record<string,unknown>[]).map((obj, i) => (
          <div key={i} className="border border-[#1A1A2E] rounded p-2">
            <ResultObj obj={obj} />
          </div>
        ))}
      </div>
    );
  }
  if (typeof v === "object") return <ResultObj obj={v as Record<string, unknown>} />;
  return <span className="text-slate-300">{String(v)}</span>;
}

function ResultObj({ obj }: { obj: Record<string, unknown> }) {
  const SKIP = ["tool","timestamp"];
  return (
    <dl className="space-y-2">
      {Object.entries(obj).filter(([k]) => !SKIP.includes(k)).map(([k, v]) => (
        <div key={k}>
          <dt className="font-mono text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">{k.replace(/_/g," ")}</dt>
          <dd><Value v={v} /></dd>
        </div>
      ))}
    </dl>
  );
}

// ─── Mock data generator (dev mode) ──────────────────────────────────────────

function getMockResult(tool: Tool): Record<string, unknown> {
  const base = { tool: tool.id, timestamp: new Date().toISOString() };
  const cat = tool.cat;

  if (cat === "intelligence") return {
    ...base,
    signal: "bullish",
    confidence: 82,
    conviction: "high",
    narrative: "AI agents x Base DeFi — early accumulation phase",
    entry_zone: "$0.0012 – $0.0018",
    catalysts: ["Bankr v2 launch", "Base fee reduction", "Agent token meta heating up"],
    risk: "medium",
    timeframe: "2–4 weeks",
    recommendation: "Accumulate on dips, target 3–5x",
  };

  if (cat === "builder") return {
    ...base,
    score: 74,
    verdict: "strong",
    summary: `${tool.name} analysis complete. Core thesis validated against current Base ecosystem conditions.`,
    strengths: ["Clear value proposition", "Base-native architecture", "x402 monetization ready"],
    risks: ["Competition from established protocols", "Token launch timing uncertain"],
    next_steps: ["Ship MVP in 2 weeks", "Apply for Base grants", "Engage with Coinbase ecosystem team"],
    priority: "high",
  };

  if (cat === "trading") return {
    ...base,
    signal: "add",
    momentum_score: 78,
    volume_change: "+340%",
    price_action: "breakout",
    entry: "$0.00145",
    stop_loss: "$0.00118",
    target_1: "$0.00210",
    target_2: "$0.00380",
    risk_reward: "2.8x",
    confidence: "high",
  };

  if (cat === "content") return {
    ...base,
    brand_score: 71,
    engagement_tier: "growing",
    thread_hook: "Most builders miss this about shipping on Base →",
    key_angles: ["Builder credibility", "Onchain transparency", "Community-first narrative"],
    posting_cadence: "3x/week minimum",
    growth_tactics: ["Engage Base ecosystem accounts daily", "Post onchain milestones", "Thread your build journey"],
    estimated_growth: "+40% followers in 30 days",
  };

  if (cat === "agent-economy") return {
    ...base,
    revenue_potential: "$800–$2,400/month",
    optimal_price_per_call: "$0.25",
    bundle_recommendation: "3-tool bundle at $0.60",
    top_distribution_channels: ["Bankr marketplace", "x402 directory", "AgentKit integrations"],
    token_utility: ["Access gating", "Revenue sharing", "Governance weight"],
    launch_readiness: "yes",
  };

  if (cat === "base-ecosystem") return {
    ...base,
    matches_found: 8,
    top_protocols: ["Aerodrome", "Aave Base", "Uniswap v4", "Base Bridge"],
    grant_opportunities: ["Base Ecosystem Fund ($5k–$50k)", "Coinbase Ventures Scout", "Gitcoin Round 22"],
    recommended_integrations: ["Coinbase Smart Wallet", "x402 payments", "Chainlink CCIP"],
    ecosystem_fit_score: 86,
  };

  if (cat === "on-chain") return {
    ...base,
    risk_score: 34,
    risk_level: "low",
    tvl_change_7d: "-2.3%",
    protocol_health: "strong",
    exit_signal: "hold",
    alerts: [],
    wallet_score: 91,
    strategy_type: "DeFi yield optimizer",
    top_positions: ["ETH/USDC LP on Aerodrome", "USDC supply on Aave Base"],
    pnl_30d: "+18.4%",
  };

  return { ...base, result: "Analysis complete", status: "success" };
}

const IS_DEV = process.env.NODE_ENV === "development";

// ─── Tool runner ─────────────────────────────────────────────────────────────

type RunStep = "idle" | "calling" | "signing" | "paying" | "done" | "error";

function ToolRunner({ tool, onBack }: { tool: Tool; onBack: () => void }) {
  const { address, isConnected } = useAccount();
  const { connect, isPending: isConnecting } = useConnect();
  const { signTypedDataAsync } = useSignTypedData();

  const [vals, setVals]       = useState<Record<string,string>>({});
  const [step, setStep]       = useState<RunStep>("idle");
  const [result, setResult]   = useState<Record<string,unknown> | null>(null);
  const [err, setErr]         = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState<string | null>(null);
  const [isMock, setIsMock]   = useState(false);

  const loading = step === "calling" || step === "signing" || step === "paying";

  async function run() {
    const missing = tool.inputs.filter(i => i.required && !vals[i.key]?.trim());
    if (missing.length) { setErr(`Required: ${missing.map(i => i.label).join(", ")}`); return; }

    setErr(null); setResult(null); setPayAmount(null); setIsMock(false);
    setStep("calling");

    const body: Record<string,string> = {};
    tool.inputs.forEach(i => { if (vals[i.key]) body[i.key] = vals[i.key]; });

    try {
      const res = await fetch(`/api/${tool.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      // ── Dev mode: mock on 402 or network error ──────────────────────────────
      if (IS_DEV && (res.status === 402 || !res.ok)) {
        await new Promise(r => setTimeout(r, 700));
        setResult(getMockResult(tool));
        setIsMock(true);
        setStep("done");
        return;
      }

      // ── x402 Payment flow ───────────────────────────────────────────────────
      if (res.status === 402) {
        if (!address) {
          setErr("Connect your wallet to pay for this tool.");
          setStep("error");
          return;
        }

        const d402 = await res.json() as {
          accepts?: { payTo: string; maxAmountRequired: string; asset?: string; extra?: { name?: string; version?: string } }[];
          paymentDetails?: { accepts?: typeof d402.accepts };
        };
        const accepts = d402.accepts?.[0] ?? d402.paymentDetails?.accepts?.[0];
        if (!accepts) { setErr("Invalid payment response from server."); setStep("error"); return; }

        const { payTo, maxAmountRequired, asset, extra } = accepts;
        setPayAmount(usdcAmt(maxAmountRequired));
        setStep("signing");

        const nonce       = randomNonce();
        const validBefore = BigInt(Math.floor(Date.now() / 1000) + 300);

        const signature = await signTypedDataAsync({
          domain: {
            name:              extra?.name    ?? "USD Coin",
            version:           extra?.version ?? "2",
            chainId:           8453,
            verifyingContract: (asset ?? USDC_BASE) as `0x${string}`,
          },
          types: {
            TransferWithAuthorization: [
              { name: "from",        type: "address" },
              { name: "to",          type: "address" },
              { name: "value",       type: "uint256" },
              { name: "validAfter",  type: "uint256" },
              { name: "validBefore", type: "uint256" },
              { name: "nonce",       type: "bytes32" },
            ],
          },
          primaryType: "TransferWithAuthorization",
          message: {
            from:        address,
            to:          payTo as `0x${string}`,
            value:       BigInt(maxAmountRequired),
            validAfter:  BigInt(0),
            validBefore,
            nonce,
          },
        });

        setStep("paying");
        const payment = {
          x402Version: 1,
          scheme:      "exact",
          network:     "base-mainnet",
          payload: {
            signature,
            authorization: {
              from: address, to: payTo,
              value: maxAmountRequired,
              validAfter: "0",
              validBefore: validBefore.toString(),
              nonce,
            },
          },
        };

        const r2 = await fetch(`/api/${tool.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, payment }),
        });
        const d2 = await r2.json() as Record<string,unknown>;
        if (!r2.ok) { setErr((d2.error as string) ?? (d2.message as string) ?? "Payment failed."); setStep("error"); return; }
        setResult(d2);
        setStep("done");
        return;
      }

      // ── Success (no payment required) ───────────────────────────────────────
      const data = await res.json() as Record<string,unknown>;
      if (!res.ok) { setErr((data.message as string) ?? (data.error as string) ?? "Request failed"); setStep("error"); return; }
      setResult(data);
      setStep("done");

    } catch (e: unknown) {
      if (IS_DEV) {
        await new Promise(r => setTimeout(r, 700));
        setResult(getMockResult(tool));
        setIsMock(true);
        setStep("done");
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        setErr(msg.includes("rejected") || msg.includes("denied") ? "Payment rejected in wallet." : msg);
        setStep("error");
      }
    }
  }

  return (
    <div>
      {/* Back nav */}
      <div className="px-6 py-3 border-b border-[#1A1A2E] flex items-center gap-2">
        <button onClick={onBack} className="flex items-center gap-1.5 font-mono text-xs text-slate-500 hover:text-white transition-colors">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Hub
        </button>
        <span className="font-mono text-[10px] text-slate-700">/</span>
        <span className="font-mono text-xs text-slate-400 truncate">{tool.name}</span>
        <span className="font-mono text-[10px] text-slate-700 ml-auto">{tool.price}</span>
      </div>

      {/* Page hero */}
      <div className="text-center py-12 px-8 border-b border-[#1A1A2E]">
        {/* Category badge */}
        <div className="inline-flex items-center gap-2 border border-[#A78BFA]/20 bg-[#A78BFA]/5 rounded-full px-4 py-1.5 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA] animate-pulse" />
          <span className="font-mono text-[10px] text-[#A78BFA] tracking-widest">
            BLUE HUB · {tool.cat.replace(/-/g, " ").toUpperCase()}
          </span>
        </div>

        {/* Title */}
        <h1 className="font-mono text-4xl sm:text-5xl font-bold text-white tracking-tight mb-4">
          {tool.name}
        </h1>

        {/* Description */}
        <p className="font-mono text-sm text-slate-400 max-w-md mx-auto leading-relaxed mb-6">
          {tool.desc}
        </p>

        {/* Agent tags */}
        <div className="flex items-center justify-center gap-2">
          {tool.agents.map(a => (
            <span key={a} className="font-mono text-[10px] px-2.5 py-1 rounded-full border"
              style={{ color: AGENT_COLORS[a], borderColor: `${AGENT_COLORS[a]}30`, background: `${AGENT_COLORS[a]}08` }}>
              {AGENT_LABELS[a]}
            </span>
          ))}
        </div>
      </div>

      {/* Form + output */}
      <div className="px-6 lg:px-10 py-8 max-w-2xl mx-auto w-full">

        {/* Input form */}
        <div className="card-surface rounded-xl p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <p className="font-mono text-xs text-[#4FC3F7] tracking-widest">// INPUT</p>
            {tool.inputs.some(i => i.example) && (
              <button
                onClick={() => {
                  const filled: Record<string,string> = {};
                  tool.inputs.forEach(i => { if (i.example) filled[i.key] = i.example; });
                  setVals(filled);
                }}
                className="font-mono text-[10px] text-slate-500 hover:text-[#4FC3F7] border border-[#1A1A2E] hover:border-[#4FC3F7]/30 px-2 py-1 rounded transition-all"
              >
                Fill example ↙
              </button>
            )}
          </div>
          <div className="space-y-4">
            {tool.inputs.map(input => (
              <div key={input.key}>
                <label className="block font-mono text-xs text-slate-500 mb-1.5">
                  {input.label}{input.required && <span className="text-[#4FC3F7] ml-1">*</span>}
                </label>
                <textarea
                  rows={input.placeholder.length > 60 ? 3 : 1}
                  className="w-full bg-[#0D0D1A] border border-[#1A1A2E] rounded-lg px-3 py-2 font-mono text-sm text-white placeholder-slate-700 focus:outline-none focus:border-[#4FC3F7]/40 transition-colors resize-none"
                  placeholder={input.placeholder}
                  value={vals[input.key] ?? ""}
                  onChange={e => setVals(v => ({ ...v, [input.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Wallet connect prompt (not connected) */}
        {!isConnected && (
          <div className="mb-5 card-surface rounded-xl p-4 border border-[#4FC3F7]/15 flex items-center justify-between gap-4">
            <div>
              <p className="font-mono text-xs text-slate-300 font-semibold mb-0.5">Wallet required</p>
              <p className="font-mono text-[10px] text-slate-600">Connect to pay {tool.price} USDC via x402 on Base</p>
            </div>
            <button
              onClick={() => connect({ connector: bestConnector() })}
              disabled={isConnecting}
              className="shrink-0 font-mono text-xs font-semibold px-3 py-1.5 rounded border transition-all disabled:opacity-50"
              style={{ borderColor: "#4FC3F7", color: "#4FC3F7", background: "#4FC3F710" }}
            >
              {isConnecting ? "Connecting…" : "Connect →"}
            </button>
          </div>
        )}

        {/* Error */}
        {step === "error" && err && (
          <p className="font-mono text-xs text-red-400 mb-4 px-1">{err}</p>
        )}

        {/* Run button */}
        <button
          onClick={run}
          disabled={loading || isConnecting}
          className="w-full font-mono text-sm font-semibold bg-[#4FC3F7] text-[#050508] px-6 py-3 rounded-xl hover:bg-[#29ABE2] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {step === "calling" && "Calling agents…"}
          {step === "signing" && `Sign payment${payAmount ? ` — ${payAmount}` : ""}…`}
          {step === "paying"  && "Confirming payment…"}
          {(step === "idle" || step === "done" || step === "error") && `Run — ${tool.price}`}
        </button>

        {/* Step feedback */}
        {loading && (
          <div className="mt-5 card-surface rounded-xl p-5 flex items-center gap-3">
            <div className="glow-dot animate-pulse" />
            <div>
              <p className="font-mono text-xs text-slate-300">
                {step === "calling" && "Calling 3-agent consensus…"}
                {step === "signing" && `Sign ${payAmount ?? tool.price} USDC transfer in your wallet`}
                {step === "paying"  && "Submitting payment on Base…"}
              </p>
              {step === "signing" && (
                <p className="font-mono text-[10px] text-slate-600 mt-0.5">EIP-3009 · no gas required</p>
              )}
            </div>
          </div>
        )}

        {/* Result */}
        {step === "done" && result && (
          <div className="mt-5 card-surface rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#1A1A2E]">
              <div className="glow-dot" />
              <span className="font-mono text-xs text-slate-400">{tool.name}</span>
              {isMock && (
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-amber-500/30 text-amber-500 ml-2">MOCK</span>
              )}
              <span className="font-mono text-xs text-slate-700 ml-auto">Blue · Aeon · MiroShark</span>
            </div>
            <ResultObj obj={result} />
            {isMock && (
              <p className="font-mono text-[10px] text-slate-700 mt-4 pt-3 border-t border-[#1A1A2E]">
                dev mode — mock data · x402 payment required in production
              </p>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Empty / browse state ─────────────────────────────────────────────────────

function EmptyState({ onSelect }: { onSelect: (t: Tool) => void }) {
  const featuredTools = TOOLS.filter(t => FEATURED_IDS.includes(t.id));
  const otherTools    = TOOLS.filter(t => !FEATURED_IDS.includes(t.id)).slice(0, 6);

  return (
    <div>
      {/* Page hero */}
      <div className="text-center py-12 px-8 border-b border-[#1A1A2E]">
        <div className="inline-flex items-center gap-2 border border-[#A78BFA]/20 bg-[#A78BFA]/5 rounded-full px-4 py-1.5 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA] animate-pulse" />
          <span className="font-mono text-[10px] text-[#A78BFA] tracking-widest">3-AGENT COLLAB · 34 TOOLS</span>
        </div>
        <h1 className="font-mono text-4xl sm:text-5xl font-bold text-white tracking-tight mb-4">
          BLUE<span className="text-[#A78BFA]">HUB</span>
        </h1>
        <p className="font-mono text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
          34 tools. 3 agents. One call — Blue Agent strategy · Aeon signals · MiroShark consensus.
        </p>
        <div className="flex items-center justify-center gap-5 mt-6">
          {(["blue","aeon","miroshark"] as Agent[]).map(a => (
            <div key={a} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: AGENT_COLORS[a] }} />
              <span className="font-mono text-xs text-slate-500">{AGENT_LABELS[a]}</span>
            </div>
          ))}
        </div>
        <p className="font-mono text-[10px] text-slate-700 mt-2">pay per use · x402 · Base</p>
      </div>

      <div className="px-6 lg:px-10 py-8 max-w-4xl mx-auto w-full">

        {/* ── Featured for founders ── */}
        <div className="flex items-center gap-3 mb-4">
          <p className="font-mono text-xs text-[#A78BFA] tracking-widest">// FEATURED FOR FOUNDERS</p>
          <div className="flex-1 h-px bg-[#A78BFA]/10" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10">
          {featuredTools.map(tool => (
            <button key={tool.id} onClick={() => onSelect(tool)}
              className="text-left rounded-xl p-5 transition-all group border border-[#A78BFA]/20 bg-[#A78BFA]/5 hover:bg-[#A78BFA]/10 hover:border-[#A78BFA]/40">
              <div className="flex items-center gap-2 mb-3">
                {tool.agents.map(a => (
                  <span key={a} className="w-1.5 h-1.5 rounded-full" style={{ background: AGENT_COLORS[a] }} />
                ))}
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-[#A78BFA]/30 text-[#A78BFA] ml-auto">
                  {tool.price}
                </span>
              </div>
              <p className="font-mono text-sm font-semibold text-white group-hover:text-[#A78BFA] transition-colors mb-1.5">
                {tool.name}
              </p>
              <p className="font-mono text-xs text-slate-500 leading-relaxed line-clamp-2">{tool.desc}</p>
              <p className="font-mono text-[10px] text-[#A78BFA]/50 mt-3">Run →</p>
            </button>
          ))}
        </div>

        {/* ── More tools ── */}
        <div className="flex items-center gap-3 mb-4">
          <p className="font-mono text-xs text-[#4FC3F7] tracking-widest">// MORE TOOLS</p>
          <div className="flex-1 h-px bg-[#4FC3F7]/10" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {otherTools.map(tool => (
            <button key={tool.id} onClick={() => onSelect(tool)}
              className="text-left card-surface card-hover rounded-xl p-5 transition-all group">
              <div className="flex items-center gap-1.5 mb-3">
                {tool.agents.map(a => (
                  <span key={a} className="w-1.5 h-1.5 rounded-full" style={{ background: AGENT_COLORS[a] }} />
                ))}
                <span className="font-mono text-[10px] text-slate-600 ml-auto">{tool.price}</span>
              </div>
              <p className="font-mono text-sm font-semibold text-white group-hover:text-[#4FC3F7] transition-colors mb-1">{tool.name}</p>
              <p className="font-mono text-xs text-slate-500 leading-relaxed line-clamp-2">{tool.desc}</p>
            </button>
          ))}
        </div>

        {/* Waiting state */}
        <div className="mt-8 card-surface rounded-xl p-6 text-center">
          <p className="font-mono text-xs text-slate-700 mb-1">// or select any tool from the sidebar</p>
          <p className="font-mono text-[10px] text-slate-800">34 tools · 3 agents · x402 micropayments · Base</p>
        </div>

      </div>
    </div>
  );
}

// ─── Hub page ─────────────────────────────────────────────────────────────────

export default function HubPage() {
  const [cat, setCat]         = useState<Category>("all");
  const [selected, setSelected] = useState<Tool | null>(null);
  const [search, setSearch]   = useState("");

  const filtered = TOOLS.filter(t =>
    (cat === "all" || t.cat === cat) &&
    (!search || t.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <>
      <Navbar />
      <div className="flex bg-[#050508] font-mono pt-16">

        {/* ── Sidebar ──────────────────────────────────── */}
        <aside className="hidden lg:flex flex-col w-72 shrink-0 sticky top-16 h-[calc(100vh-4rem)] border-r border-[#1A1A2E]">

          {/* Header */}
          <div className="px-5 pt-6 pb-4 border-b border-[#1A1A2E]">
            <p className="font-mono text-xs text-[#4FC3F7] tracking-widest">// TOOLS</p>
            <p className="font-mono text-[10px] text-slate-700 mt-1">{filtered.length} of {TOOLS.length} tools</p>
          </div>

          {/* Search */}
          <div className="px-4 pt-3 pb-2">
            <input
              className="w-full bg-[#0D0D1A] border border-[#1A1A2E] rounded-lg px-3 py-2 font-mono text-xs text-white placeholder-slate-700 focus:outline-none focus:border-[#4FC3F7]/30 transition-colors"
              placeholder="Search tools…"
              value={search}
              onChange={e => { setSearch(e.target.value); setCat("all"); }}
            />
          </div>

          {/* Category filter */}
          <div className="px-4 pb-4 flex flex-wrap gap-1">
            {CATEGORIES.map(c => (
              <button key={c.key} onClick={() => { setCat(c.key); setSearch(""); }}
                className={`font-mono text-[10px] px-2 py-1 rounded transition-colors ${
                  cat === c.key
                    ? "bg-[#4FC3F7]/15 text-[#4FC3F7]"
                    : "text-slate-600 hover:text-slate-300"
                }`}>
                {c.label}
              </button>
            ))}
          </div>

          {/* Tool list */}
          <div className="flex-1 overflow-y-auto border-t border-[#1A1A2E]">
            {filtered.length === 0 && (
              <p className="font-mono text-[10px] text-slate-700 px-6 py-4">No tools found</p>
            )}
            {filtered.map(tool => {
              const isFeatured = FEATURED_IDS.includes(tool.id);
              return (
                <button key={tool.id} onClick={() => setSelected(tool)}
                  className={`w-full text-left px-4 py-2.5 transition-all border-l-2 ${
                    selected?.id === tool.id
                      ? "border-[#4FC3F7] bg-[#4FC3F7]/5 text-white"
                      : isFeatured
                      ? "border-[#A78BFA]/30 text-slate-400 hover:text-slate-300 hover:bg-[#A78BFA]/5"
                      : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-[#1A1A2E]/50"
                  }`}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {tool.agents.map(a => (
                      <span key={a} className="w-1 h-1 rounded-full" style={{ background: AGENT_COLORS[a] }} />
                    ))}
                    <div className="ml-auto flex items-center gap-1.5">
                      {isFeatured && (
                        <span className="font-mono text-[9px] px-1 py-0.5 rounded border border-[#A78BFA]/40 text-[#A78BFA]">
                          ★
                        </span>
                      )}
                      <span className="font-mono text-[10px] text-slate-700">{tool.price}</span>
                    </div>
                  </div>
                  <span className="font-mono text-sm">{tool.name}</span>
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-4 py-4 border-t border-[#1A1A2E]">
            <p className="font-mono text-[10px] text-slate-700">x402 micropayments · Base · 3-agent consensus</p>
          </div>
        </aside>

        {/* ── Main content ─────────────────────────────── */}
        <main className="flex-1 h-[calc(100vh-4rem)] overflow-y-auto">
          {selected
            ? <ToolRunner tool={selected} onBack={() => setSelected(null)} />
            : <EmptyState onSelect={setSelected} />
          }
        </main>

      </div>
    </>
  );
}
