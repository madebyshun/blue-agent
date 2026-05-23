"use client";

import { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { useAccount, useSignTypedData } from "wagmi";
import { ConnectButton } from "@/components/ConnectModal";

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
    { key: "channels", label: "Channels", placeholder: "e.g. Twitter, Telegram, Discord", example: "Twitter (@blueagent_), Telegram (t.me/blueagent_hub)" },
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
  const base = { timestamp: new Date().toISOString() };

  const MOCKS: Record<string, Record<string, unknown>> = {
    "token-pick-signal": {
      ...base,
      signal: "bullish",
      confidence: 84,
      conviction: "high",
      token: "$BLUEAGENT",
      narrative: "AI agent tokens on Base — early accumulation phase before narrative peak",
      entry_zone: "$0.0000020 – $0.0000028",
      catalysts: ["Blue Hub launch", "Bankr ecosystem growth", "Agent token meta accelerating on CT"],
      risk: "medium",
      timeframe: "2–4 weeks",
      recommendation: "Accumulate on dips. Target 3–5x from current levels.",
    },
    "narrative-position": {
      ...base,
      top_narratives: [
        { name: "AI Agents on Base", momentum: "building", position: "early" },
        { name: "x402 Micropayments", momentum: "emerging", position: "very early" },
        { name: "RWA on Base", momentum: "peaking", position: "late" },
        { name: "Base DeFi Season 2", momentum: "building", position: "mid" },
      ],
      best_position: "AI Agents on Base — still early, CT engagement accelerating",
      avoid: "RWA narrative peaking, rotation risk high",
      timeframe: "next 3–6 weeks",
    },
    "ecosystem-digest": {
      ...base,
      week: "May 2026",
      top_builders: ["@madebyshun (Blue Agent)", "@bankrbot (Bankr)", "@aerodrome_fi"],
      top_protocols: ["Aerodrome (+18% TVL)", "Uniswap v4 Base (new pools)", "Aave Base (record deposits)"],
      narrative_shifts: ["AI agent tooling gaining VC attention", "x402 emerging as payment standard", "Base gas fees near zero"],
      signal: "Base ecosystem in expansion phase — builder activity at ATH",
    },
    "market-fit": {
      ...base,
      overall_score: 81,
      verdict: "strong",
      blue_agent_score: 83,
      aeon_score: 79,
      miroshark_score: 80,
      strengths: ["Clear ICP (Base builders)", "x402 monetization validated", "Grounded AI — no hallucinations"],
      gaps: ["Discovery — builders don't know it exists yet", "Onboarding friction for non-crypto devs"],
      pmf_signal: "Early PMF signals present. Push distribution hard.",
      priority_action: "Ship 3 case studies from real builds using Blue Agent commands",
    },
    "token-launch-readiness": {
      ...base,
      verdict: "yes",
      readiness_score: 76,
      go_signal: true,
      community_score: 72,
      product_score: 85,
      traction_score: 71,
      risks: ["Token liquidity depth", "Market timing uncertainty"],
      launch_checklist: ["Audit contract", "Seed liquidity pool ($50k+)", "CT narrative campaign 2 weeks prior", "Bankr listing day-1"],
      recommended_timing: "Next 4–6 weeks if market holds",
    },
    "roadmap-validator": {
      ...base,
      verdict: "strong",
      score: 79,
      timing_risk: "low",
      execution_risk: "medium",
      narrative_fit: "high",
      strong_milestones: ["Hub 34 tools", "x402 payments", "CLI v2"],
      weak_milestones: ["Revenue sharing — too vague, needs mechanism design"],
      suggested_changes: ["Add specific revenue targets per quarter", "Move marketplace to Q3 (earlier)"],
      priority: "high",
    },
    "competitor-scan": {
      ...base,
      direct_competitors: [
        { name: "Cursor for Web3", threat: "medium", moat: "IDE integration, not Base-native" },
        { name: "Coinbase CDP", threat: "low", threat_reason: "infra layer, not AI workflow" },
      ],
      indirect_competitors: ["ChatGPT + Base docs", "Windsurf + web3 plugins"],
      your_edge: "Grounded skills + x402 micropayments + Base-native context — no generic LLM can replicate",
      defensibility: "high",
      recommendation: "Focus on skill depth and Base exclusivity",
    },
    "pitch-intelligence": {
      ...base,
      narrative_score: 82,
      investor_readiness: "ready",
      hook: "Base builders waste 60% of dev time on hallucinated AI output. Blue Agent fixes this with verified, grounded intelligence.",
      why_now: "x402 micropayments + Base's 10M users = monetizable AI agent layer for the first time",
      why_win: "34 grounded skill files = unfakeable moat. Takes months to build, impossible to copy overnight.",
      risks_to_address: ["Revenue scale timeline", "Dependency on Base ecosystem health"],
      suggested_ask: "$500k pre-seed at $5M cap",
    },
    "fundraise-timing": {
      ...base,
      verdict: "raise now",
      timing_score: 74,
      market_conditions: "favorable",
      stage_readiness: "yes",
      investor_appetite: "high — AI agent + Base narratives both hot",
      risks: ["Window may close in 6–8 weeks if market turns"],
      recommended_format: "SAFE $500k, $5M cap",
      target_investors: ["Coinbase Ventures", "Base Ecosystem Fund", "angel builders on Base"],
    },
    "gtm-brief": {
      ...base,
      primary_channel: "X/Twitter + Telegram (Base builder community)",
      launch_sequence: ["Week 1: Ship case study thread", "Week 2: Bankr collab post", "Week 3: Base ecosystem tag"],
      messaging: "Build on Base faster. Blue Agent — AI with verified Base knowledge.",
      early_adopters: "Indie hackers shipping on Base, DeFi founders, AI agent devs",
      growth_lever: "Every user who runs a command = shareable output = distribution",
      kpi_30d: "200 Hub tool runs, 50 console commands, 5 case studies published",
    },
    "stack-recommender": {
      ...base,
      recommended_stack: {
        chain: "Base (EVM, low fees, Coinbase ecosystem)",
        payments: "x402 + USDC (EIP-3009 TransferWithAuthorization)",
        frontend: "Next.js 15 + Wagmi v3 + Tailwind",
        backend: "Next.js API routes / Edge functions",
        ai: "Bankr LLM (grounded) + Anthropic fallback",
        infra: "Vercel (deploy) + Basescan (verify)",
      },
      avoid: "Ethereum mainnet (gas), OpenAI direct (no web3 context)",
      notes: "x402 requires Base for USDC EIP-3009 support",
    },
    "investor-memo": {
      ...base,
      memo_sections: {
        thesis: "AI-native development layer for Base — the only grounded, monetizable AI toolset for the fastest-growing EVM ecosystem",
        market: "$2B+ developer tools TAM on Base. 10M+ users. 200M+ transactions/month.",
        product: "5 AI commands + 34 Hub tools + x402 micropayments. Grounded in 34 verified Base skill files.",
        traction: "Token live on Uniswap v4. 800+ Telegram. ~$200 MRR from x402. Blue Hub shipped.",
        moat: "Skill file depth + x402 monetization rails + Base-native grounding = 6-month head start",
        ask: "$500k pre-seed · SAFE · $5M cap",
      },
      investor_fit: ["Coinbase Ventures", "Base Ecosystem Fund", "AI-native angels"],
    },
    "token-distribution-plan": {
      ...base,
      recommended_allocation: {
        community_rewards: "40%",
        team_and_advisors: "20%",
        ecosystem_treasury: "20%",
        liquidity: "12%",
        investors: "8%",
      },
      vesting: "Team: 2yr cliff + 2yr linear. Investors: 6mo cliff + 18mo linear",
      community_release: "Weekly builder rewards, Hub tool incentives, staking yield",
      notes: "Front-load community allocation to drive adoption before team unlock",
    },
    "agent-performance": {
      ...base,
      performance_score: 78,
      revenue_grade: "B+",
      engagement_grade: "A-",
      retention_grade: "B",
      monthly_revenue: "$200 (x402 micropayments)",
      active_users_30d: 143,
      tool_runs_30d: 412,
      top_tools: ["Token Pick Signal", "Market Fit Validator", "Investor Memo"],
      bottleneck: "Discovery — most users find via Telegram, not organic search",
      recommendation: "Add SEO landing pages per tool. Each tool = indexable page.",
    },
    "agent-collab-match": {
      ...base,
      top_matches: [
        { agent: "Aeon", synergy: "high", collab: "Market signals + Blue strategy = 3-agent consensus already live" },
        { agent: "MiroShark", synergy: "high", collab: "Crowd sentiment + builder intelligence = launch readiness tools" },
        { agent: "Cookie3", synergy: "medium", collab: "Onchain analytics + AI recommendations" },
      ],
      recommended_collab: "Joint tool with Aeon: Token Launch Intel — Aeon market data + Blue strategic framing",
      distribution_angle: "Cross-post to each agent's community = 3x reach per tool launch",
    },
    "repo-health": {
      ...base,
      health_score: 74,
      grade: "B+",
      code_quality: "good",
      documentation: "partial",
      ci_cd: "vercel deploy on push",
      test_coverage: "low — needs unit tests for core packages",
      issues: ["No tests for packages/core", "CLAUDE.md good but README outdated", "No contributing guide"],
      quick_wins: ["Add jest tests for schemas.ts", "Update README with setup guide", "Add GitHub Actions CI"],
    },
    "community-sentiment": {
      ...base,
      overall_sentiment: "positive",
      sentiment_score: 73,
      telegram_sentiment: "high — active community, engaged builders",
      twitter_sentiment: "neutral to positive — growing impressions",
      top_themes: ["Excited about Blue Hub launch", "Requesting more tools", "Questions about token utility"],
      alerts: [],
      trend: "improving",
      recommendation: "Amplify Hub launch content. Community ready for more tool announcements.",
    },
    "community-growth-playbook": {
      ...base,
      current_assessment: "800 Telegram, 1.2k Twitter — solid early traction",
      growth_target: "5,000 Telegram by Q3 2026",
      top_tactics: [
        "Weekly builder spotlights (tag builders using Blue Agent)",
        "Ship result threads — post real outputs from Hub tools",
        "Co-host Base ecosystem spaces with Bankr/Aeon",
        "Reward top community members with $BLUEAGENT",
      ],
      content_cadence: "3x Twitter/week · 1x Telegram digest/week · 1x case study/month",
      estimated_growth: "+300% in 90 days with consistent execution",
    },
    "thread-intelligence": {
      ...base,
      hook: "We just shipped 34 AI tools for Base builders. Each one costs $0.15–$0.50 to run. Here's what they can do →",
      thread_outline: [
        "1/ Blue Hub is live — 34 tools, 3-agent consensus (Blue + Aeon + MiroShark)",
        "2/ Token Pick Signal: AI consensus on highest-conviction Base setup right now",
        "3/ Market Fit Validator: Score your product with swarm intelligence",
        "4/ Investor Memo: Full memo in 30 seconds, $0.35",
        "5/ All pay-per-use via x402 USDC. No subscriptions. No API keys.",
        "6/ Try it: blueagent.dev/hub",
      ],
      estimated_engagement: "2,000–8,000 impressions, 80–200 engagements",
      best_time: "Tuesday–Thursday, 9am–11am EST",
    },
    "builder-brand-score": {
      ...base,
      brand_score: 68,
      grade: "B",
      visibility: "growing",
      credibility: "high — shipping consistently",
      community: "engaged",
      gaps: ["Limited SEO presence", "No long-form content yet", "Underutilizing video/demos"],
      strengths: ["Consistent builder narrative", "Active on X", "Strong product shipping velocity"],
      playbook: ["Post 1 demo video/week", "Write 1 deep-dive thread/month", "Get featured in Base newsletter"],
    },
    "defi-opportunity": {
      ...base,
      top_opportunities: [
        { protocol: "Aerodrome", type: "LP yield", apy: "12–28%", risk: "low", recommendation: "USDC/ETH stable LP" },
        { protocol: "Aave Base", type: "Supply yield", apy: "4.2%", risk: "low", recommendation: "USDC supply" },
        { protocol: "Uniswap v4 Base", type: "Concentrated LP", apy: "35–80%", risk: "medium", recommendation: "ETH/USDC 0.05% pool" },
      ],
      signal: "DeFi yields on Base above Ethereum mainnet by 2–4x — capital efficiency window open",
      avoid: "New unaudited forks. Stick to battle-tested protocols.",
    },
    "builder-deep-dd": {
      ...base,
      builder: "@madebyshun",
      credibility_score: 88,
      onchain_activity: "high — consistent deployments on Base",
      shipped_products: ["Blue Agent", "Blue Hub (34 tools)", "BlueMarket", "x402 API services"],
      token: "$BLUEAGENT on Uniswap v4 Base",
      community: "800+ Telegram, 1.2k Twitter",
      verdict: "high conviction builder — consistent shipper, Base-native, real revenue",
      risks: ["Solo founder execution risk", "Bankr dependency"],
    },
    "whale-copy-signal": {
      ...base,
      signal: "accumulate",
      whale_wallet: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      recent_moves: [
        { action: "bought", token: "WETH", amount: "$45,000", timing: "6h ago" },
        { action: "added LP", protocol: "Aerodrome", amount: "$120,000", timing: "1d ago" },
      ],
      copy_entry: "ETH at current — whale avg $2,280",
      confidence: "high",
      notes: "Whale has 94% win rate on Base over 90 days",
    },
    "token-momentum-scanner": {
      ...base,
      top_movers: [
        { token: "$BLUEAGENT", change_4h: "+18%", volume_spike: "+420%", signal: "breakout" },
        { token: "$VIRTUAL", change_4h: "+11%", volume_spike: "+180%", signal: "add" },
        { token: "$AERO", change_4h: "+7%", volume_spike: "+95%", signal: "watch" },
      ],
      market_condition: "risk-on",
      narrative_driving: "AI agent tokens + Base DeFi rotation",
      recommendation: "Scale into $BLUEAGENT and $VIRTUAL on any dip",
    },
    "portfolio-rebalancer": {
      ...base,
      current_assessment: "Overweight ETH, underweight AI agent exposure",
      recommended_allocation: { ETH: "35%", USDC: "25%", BLUEAGENT: "20%", cbBTC: "10%, other_base_defi: 10%" },
      actions: [
        { action: "reduce", asset: "ETH", from: "40%", to: "35%" },
        { action: "add", asset: "BLUEAGENT", from: "20%", to: "25%" },
        { action: "add", asset: "Aerodrome LP yield", amount: "10%" },
      ],
      rationale: "AI agent narrative building. ETH rangebound. USDC buffer for opportunities.",
    },
    "agent-revenue-optimizer": {
      ...base,
      current_revenue: "$200/month",
      revenue_potential: "$2,400–$6,000/month",
      top_levers: [
        { lever: "Bundle pricing", impact: "high", action: "Offer 5-tool bundle at $0.99 vs $1.25 individual" },
        { lever: "Bankr marketplace listing", impact: "high", action: "List all 34 tools with descriptions" },
        { lever: "Subscriber discount", impact: "medium", action: "10% off for $BLUEAGENT stakers" },
      ],
      optimal_price_per_call: "$0.25 average",
      monthly_target: "$1,000 MRR by end of Q2",
    },
    "agent-token-strategy": {
      ...base,
      token: "$BLUEAGENT",
      utility_score: 72,
      current_utility: ["Staking for Blue Market access", "Weekly rewards to builders"],
      recommended_additions: [
        { utility: "Hub tool discounts (10–20%)", priority: "high", effort: "low" },
        { utility: "Governance over skill file additions", priority: "medium", effort: "medium" },
        { utility: "Revenue share from x402 payments", priority: "high", effort: "medium" },
      ],
      tokenomics_health: "good",
      launch_readiness: "yes",
    },
    "multi-agent-workflow": {
      ...base,
      workflow_name: "Base Ecosystem Weekly Intel",
      agents: ["Aeon", "MiroShark", "Blue Agent"],
      steps: [
        { step: 1, agent: "Aeon", action: "Scan Base token movers + volume anomalies" },
        { step: 2, agent: "MiroShark", action: "Model crowd sentiment from CT + Telegram signals" },
        { step: 3, agent: "Blue Agent", action: "Synthesize into actionable brief with builder context" },
      ],
      output: "Weekly Base ecosystem report with signal, narrative, and 1 action",
      automation: "Trigger every Monday 8am UTC via Vercel cron",
      estimated_value: "$500–$2,000/week in builder intelligence",
    },
    "base-grant-finder": {
      ...base,
      active_programs: [
        { name: "Base Ecosystem Fund", amount: "$5k–$50k", deadline: "rolling", fit: "high" },
        { name: "Coinbase Ventures Scout Program", amount: "equity", deadline: "ongoing", fit: "medium" },
        { name: "Gitcoin Grants Round 22", amount: "community matching", deadline: "Q3 2026", fit: "high" },
        { name: "Optimism RetroPGF", amount: "variable", deadline: "Q4 2026", fit: "medium" },
      ],
      recommended_apply: ["Base Ecosystem Fund", "Gitcoin Round 22"],
      application_angle: "AI tooling infrastructure for Base builders — measurable impact on Base ecosystem growth",
    },
    "base-protocol-comparison": {
      ...base,
      category: "DEX",
      comparison: [
        { protocol: "Aerodrome", tvl: "$800M", fees: "0.01–0.3%", best_for: "Stablecoin LPs, USDC pairs" },
        { protocol: "Uniswap v4 Base", tvl: "$450M", fees: "0.01–1%", best_for: "Concentrated liquidity, high-volume pairs" },
        { protocol: "Curve Base", tvl: "$120M", fees: "0.04%", best_for: "Stable swaps, cbBTC" },
      ],
      recommendation: "Aerodrome for liquidity depth + USDC pairs. Uniswap v4 for agent token launch.",
    },
    "base-builder-network-match": {
      ...base,
      matches: [
        { builder: "@bankrbot", skills: "AI/LLM, agent infrastructure", synergy: "very high" },
        { builder: "@aerodrome_fi", skills: "DeFi, liquidity", synergy: "high" },
        { builder: "@coinbase_dev", skills: "Smart Wallet, CDP", synergy: "high" },
      ],
      best_match: "@bankrbot — already collabing, deepen technical integration",
      events: ["Base Builder Summit (June 2026)", "ETH NYC side event (August 2026)"],
    },
    "wallet-strategy-analyzer": {
      ...base,
      wallet_type: "DeFi yield optimizer",
      activity_score: 87,
      win_rate: "71%",
      avg_hold_time: "12 days",
      top_strategies: ["Aerodrome LP rotation", "USDC yield stacking", "Momentum trading Base tokens"],
      pnl_30d: "+18.4%",
      pnl_90d: "+41.2%",
      risk_profile: "medium",
      alpha_signal: "Wallet entered $BLUEAGENT 3 days before +40% move",
    },
    "protocol-risk-monitor": {
      ...base,
      protocol: "Aerodrome",
      risk_score: 28,
      risk_level: "low",
      tvl_7d: "+4.2%",
      smart_contract_risk: "low — audited, battle-tested",
      liquidity_risk: "low — deepest Base DEX",
      governance_risk: "low",
      exit_signal: "hold",
      alerts: [],
      recommendation: "Safe to maintain position. No risk signals detected.",
    },
  };

  return MOCKS[tool.id] ?? {
    ...base,
    analysis: `${tool.name} — preview result`,
    status: "complete",
    signal: "positive",
    summary: `Analysis for ${tool.name} complete. Core findings validated against current Base ecosystem conditions.`,
    recommendation: "Connect wallet and pay with USDC to get live AI-generated results.",
  };
}

const IS_DEV = process.env.NODE_ENV === "development";

// ─── Tool runner ─────────────────────────────────────────────────────────────

type RunStep = "idle" | "calling" | "signing" | "paying" | "done" | "error";

function ToolRunner({ tool, onBack }: { tool: Tool; onBack: () => void }) {
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const [vals, setVals]       = useState<Record<string,string>>({});
  const [step, setStep]       = useState<RunStep>("idle");
  const [result, setResult]   = useState<Record<string,unknown> | null>(null);
  const [err, setErr]         = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState<string | null>(null);
  const [isMock, setIsMock]   = useState(false);
  const [mockReason, setMockReason] = useState<"dev" | "service-down">("dev");

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

      // ── Dev mode: mock on any error ─────────────────────────────────────────
      if (IS_DEV && (res.status === 402 || !res.ok)) {
        await new Promise(r => setTimeout(r, 700));
        setResult(getMockResult(tool));
        setIsMock(true); setMockReason("dev");
        setStep("done");
        return;
      }

      // ── Service down (5xx) → fall back to mock ───────────────────────────────
      if (res.status >= 500) {
        await new Promise(r => setTimeout(r, 700));
        setResult(getMockResult(tool));
        setIsMock(true); setMockReason("service-down");
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
        // Network error → mock fallback
        await new Promise(r => setTimeout(r, 700));
        setResult(getMockResult(tool));
        setIsMock(true); setMockReason("service-down");
        setStep("done");
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
            <ConnectButton label="Connect →" />
          </div>
        )}

        {/* Error */}
        {step === "error" && err && (
          <p className="font-mono text-xs text-red-400 mb-4 px-1">{err}</p>
        )}

        {/* Run button */}
        <button
          onClick={run}
          disabled={loading}
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
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-amber-500/30 text-amber-500 ml-2">
                  {mockReason === "service-down" ? "PREVIEW" : "MOCK"}
                </span>
              )}
              <span className="font-mono text-xs text-slate-700 ml-auto">Blue · Aeon · MiroShark</span>
            </div>
            <ResultObj obj={result} />
            {isMock && (
              <p className="font-mono text-[10px] text-slate-700 mt-4 pt-3 border-t border-[#1A1A2E]">
                {mockReason === "service-down"
                  ? "preview data — live results require x402 USDC payment · bankr.bot service coming back online"
                  : "dev mode — mock data · x402 payment required in production"}
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
              <span className="font-mono text-base font-bold" style={{ color: AGENT_COLORS[a] }}>{AGENT_LABELS[a]}</span>
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
        <div className="mt-4 card-surface rounded-xl p-6 text-center">
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

          {/* Sentinel link */}
          <div className="px-4 pb-2 border-t border-[#1A1A2E] pt-3">
            <Link
              href="/sentinel"
              className="flex items-center gap-2 w-full px-2 py-2 rounded-lg hover:bg-red-500/5 transition-colors group"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span className="font-mono text-[11px] text-slate-500 group-hover:text-red-400 transition-colors">
                🛡️ Blue Sentinel
              </span>
              <span className="ml-auto font-mono text-[9px] text-slate-700 group-hover:text-red-500">
                24/7
              </span>
            </Link>
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
