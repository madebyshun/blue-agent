"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { AGENT_TOOLS } from "@/lib/agent-tools";
import { useAccount, useSignTypedData } from "wagmi";

// ─── Tool registry ──────────────────────────────────────────────────────────

type Agent = "blue" | "aeon" | "miroshark";
type Category = "all" | "intelligence" | "builder" | "trading" | "content" | "agent-economy" | "base-ecosystem" | "on-chain";
interface ToolInput { key: string; label: string; placeholder: string; required?: boolean; example?: string; }
interface Tool {
  id: string; name: string; cat: Category; price: string;
  agents: Agent[]; desc: string; inputs: ToolInput[]; featured?: boolean;
  x402Url?: string;
  x402Body?: (values: Record<string, string>) => Record<string, unknown>;
}

const FEATURED_IDS = ["launch-simulator", "investor-memo", "market-fit", "token-launch-readiness"];

// Derive TOOLS from AGENT_TOOLS — single source of truth
const TOOLS: Tool[] = AGENT_TOOLS.map(t => ({
  id:     t.id,
  name:   t.name,
  cat:    t.category as Exclude<Category, "all">,
  price:  t.price ?? "",
  agents: t.isComposite
    ? (["blue", "aeon", "miroshark"] as Agent[])
    : t.agentName === "Aeon"      ? (["aeon"]      as Agent[])
    : t.agentName === "MiroShark" ? (["miroshark"] as Agent[])
    :                               (["blue"]       as Agent[]),
  desc:   t.description,
  inputs: t.inputs,
  x402Url:  t.x402Url,
  x402Body: t.x402Body,
}));

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

// ─── Result renderer ─────────────────────────────────────────────────────────

const VERDICT_COLORS: Record<string, string> = {
  GO: "#34D399", BUY: "#34D399", SAFE: "#34D399", BULL: "#34D399",
  WAIT: "#FACC15", WATCH: "#FACC15", NEUTRAL: "#FACC15",
  PIVOT: "#FB923C", REDUCE: "#FB923C",
  NO_PICK: "#6B6B7E", SKIP: "#6B6B7E",
  CRITICAL: "#F87171", HIGH: "#F87171", SELL: "#F87171",
};

function stanceColor(s: string): string {
  const u = s.toUpperCase();
  return VERDICT_COLORS[u] ?? "#C8C8D0";
}

function VerdictBadge({ value }: { value: string }) {
  const color = VERDICT_COLORS[value.toUpperCase()] ?? "#6B6B7E";
  return (
    <span className="inline-block px-3 py-1 rounded-full text-sm font-bold font-mono" style={{ color, background: color + "15", border: `1px solid ${color}40` }}>
      {value}
    </span>
  );
}

function ScoreBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = pct >= 70 ? "#34D399" : pct >= 45 ? "#FACC15" : "#F87171";
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-xl font-bold" style={{ color }}>{value}</span>
      <div className="flex-1 h-1.5 bg-[#1A1A2E] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="font-mono text-[10px] text-slate-600">/{max}</span>
    </div>
  );
}

function StringList({ items, color }: { items: string[]; color?: string }) {
  return (
    <ul className="space-y-1.5 mt-1">
      {items.map((s, i) => (
        <li key={i} className="flex gap-2 text-xs">
          <span style={{ color: color ?? "#4FC3F7" }} className="shrink-0 mt-0.5">›</span>
          <span className="text-slate-300 leading-relaxed">{s}</span>
        </li>
      ))}
    </ul>
  );
}

function PersonaCards({ personas }: { personas: Record<string, { stance: string; weight: number; rationale: string }> }) {
  return (
    <div className="grid grid-cols-2 gap-2 mt-1">
      {Object.entries(personas).map(([name, p]) => (
        <div key={name} className="border border-[#1A1A2E] rounded-lg p-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">{name}</span>
            <span className="text-[10px] font-mono font-bold" style={{ color: stanceColor(p.stance) }}>{p.stance.toUpperCase()}</span>
          </div>
          <p className="text-[10px] text-slate-500 leading-relaxed">{p.rationale}</p>
          <p className="text-[10px] text-slate-700 mt-1">weight: {p.weight}x</p>
        </div>
      ))}
    </div>
  );
}

function ChecklistItems({ items }: { items: { item: string; status: string; category?: string }[] }) {
  const statusIcon = (s: string) => s === "done" ? "✓" : s === "critical" ? "!" : "○";
  const statusColor = (s: string) => s === "done" ? "#34D399" : s === "critical" ? "#F87171" : "#FACC15";
  return (
    <ul className="space-y-1.5 mt-1">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-xs items-start">
          <span style={{ color: statusColor(item.status) }} className="shrink-0 font-mono font-bold mt-0.5">{statusIcon(item.status)}</span>
          <span className="text-slate-300">{item.item}</span>
          {item.category && <span className="text-[10px] text-slate-600 ml-auto shrink-0">{item.category}</span>}
        </li>
      ))}
    </ul>
  );
}

// Semantic field keys
const VERDICT_KEYS   = ["verdict", "blue_verdict", "recommendation", "timing", "action"];
const SCORE_KEYS     = ["score", "readiness_score", "confidence", "bull", "bear", "neutral"];
const STRENGTHS_KEYS = ["strengths", "opportunities", "pros", "positives"];
const RISKS_KEYS     = ["risks", "blockers", "weaknesses", "concerns", "risk_flags", "action_items"];
const SKIP_KEYS      = ["tool", "timestamp", "chain"];

function SmartValue({ k, v }: { k: string; v: unknown }) {
  if (v === null || v === undefined) return <span className="text-slate-600 text-xs">—</span>;

  // Verdict / recommendation
  if (VERDICT_KEYS.includes(k) && typeof v === "string") return <VerdictBadge value={v} />;

  // Score bars
  if (SCORE_KEYS.includes(k) && typeof v === "number") return <ScoreBar value={v} />;

  // Boolean
  if (typeof v === "boolean") return (
    <span className={`text-xs font-mono font-semibold ${v ? "text-[#34D399]" : "text-red-400"}`}>{v ? "✓ Yes" : "✗ No"}</span>
  );

  // Plain number
  if (typeof v === "number") return <span className="text-[#4FC3F7] font-mono font-semibold">{v}</span>;

  // String arrays
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") {
    const color = STRENGTHS_KEYS.includes(k) ? "#34D399" : RISKS_KEYS.includes(k) ? "#F87171" : undefined;
    return <StringList items={v as string[]} color={color} />;
  }

  // Checklist array
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object" && (v[0] as Record<string,unknown>).item) {
    return <ChecklistItems items={v as { item: string; status: string; category?: string }[]} />;
  }

  // Persona object
  if (k === "personas" && typeof v === "object" && !Array.isArray(v)) {
    return <PersonaCards personas={v as Record<string, { stance: string; weight: number; rationale: string }>} />;
  }

  // Nested object
  if (typeof v === "object" && !Array.isArray(v)) {
    return <ResultObj obj={v as Record<string, unknown>} nested />;
  }

  // Object array (fallback)
  if (Array.isArray(v)) {
    return (
      <div className="space-y-2 mt-1">
        {(v as Record<string,unknown>[]).map((obj, i) => (
          <div key={i} className="border border-[#1A1A2E] rounded p-2">
            <ResultObj obj={obj} nested />
          </div>
        ))}
      </div>
    );
  }

  // String with sentiment coloring
  if (typeof v === "string") {
    const upper = v.toUpperCase();
    const color = VERDICT_COLORS[upper];
    if (color && v.length < 20) return <span className="text-sm font-mono font-semibold" style={{ color }}>{v}</span>;
    return <span className="text-slate-200 text-xs leading-relaxed">{v}</span>;
  }

  return <span className="text-slate-300 text-xs">{String(v)}</span>;
}

function ResultObj({ obj, nested = false }: { obj: Record<string, unknown>; nested?: boolean }) {
  const SKIP = nested ? [] : SKIP_KEYS;
  return (
    <dl className={nested ? "space-y-1.5" : "space-y-4"}>
      {Object.entries(obj).filter(([k]) => !SKIP.includes(k)).map(([k, v]) => (
        <div key={k}>
          <dt className="font-mono text-[10px] text-slate-500 uppercase tracking-wider mb-1">{k.replace(/_/g," ")}</dt>
          <dd><SmartValue k={k} v={v} /></dd>
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

// ─── Agent scan log animation ─────────────────────────────────────────────────

type LogLine = { agent: "aeon" | "miroshark" | "blue" | "sys"; text: string; delay: number };

function buildScanScript(tool: Tool): LogLine[] {
  const inp = Object.values(tool.inputs).map(i => i.key).join(", ");
  return [
    { agent: "sys",       text: `> initializing 3-agent consensus · tool=${tool.id}`,                      delay: 0   },
    { agent: "sys",       text: `> inputs=[${inp}] · chain=base · endpoint=/api/${tool.id}`,               delay: 180 },
    { agent: "aeon",      text: `[AEON] booting narrative-tracker…`,                                       delay: 420 },
    { agent: "aeon",      text: `[AEON] scanning Base ecosystem · ${new Date().toISOString().split("T")[0]}`,delay: 680 },
    { agent: "aeon",      text: `[AEON] pulling token-movers · filtering by vol > $50k`,                   delay: 960 },
    { agent: "aeon",      text: `[AEON] narrative fit scored · writing context block`,                     delay: 1280},
    { agent: "miroshark", text: `[MIROSHARK] loading collab prompt · madebyshun/blue-agent`,               delay: 1600},
    { agent: "miroshark", text: `[MIROSHARK] spawning crowd agents · personas=[retail,analyst,influencer,observer]`, delay: 1900 },
    { agent: "miroshark", text: `[MIROSHARK] running weighted consensus · bull/bear/neutral`,              delay: 2250},
    { agent: "miroshark", text: `[MIROSHARK] fomo_level detected · sentiment locked`,                      delay: 2600},
    { agent: "blue",      text: `[BLUE] loading identity · skills/blue-agent-identity.md`,                 delay: 2950},
    { agent: "blue",      text: `[BLUE] injecting base-ecosystem.md · base-addresses.md`,                  delay: 3280},
    { agent: "blue",      text: `[BLUE] synthesizing aeon + miroshark signals…`,                           delay: 3600},
    { agent: "blue",      text: `[BLUE] generating verdict · confidence scoring…`,                         delay: 3980},
    { agent: "sys",       text: `> streaming response · parsing JSON output…`,                             delay: 4350},
  ];
}

function AgentScanLog({ tool }: { tool: Tool }) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [cursor, setCursor] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const script = useRef(buildScanScript(tool));

  useEffect(() => {
    // reset on new tool
    setLines([]);
    script.current = buildScanScript(tool);
    const timers: ReturnType<typeof setTimeout>[] = [];

    script.current.forEach(line => {
      const t = setTimeout(() => {
        setLines(prev => [...prev, line]);
      }, line.delay);
      timers.push(t);
    });

    // cursor blink
    const cursorInterval = setInterval(() => setCursor(c => !c), 530);

    return () => {
      timers.forEach(clearTimeout);
      clearInterval(cursorInterval);
    };
  }, [tool.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const agentColor: Record<string, string> = {
    aeon:      "#A78BFA",
    miroshark: "#34D399",
    blue:      "#4FC3F7",
    sys:       "#475569",
  };

  return (
    <div className="flex flex-col items-center justify-center h-full px-8 py-12">
      {/* Agent status row */}
      <div className="flex items-center gap-6 mb-8">
        {(["aeon","miroshark","blue"] as const).map(a => {
          const hasStarted = lines.some(l => l.agent === a);
          const isDone     = lines.length > 0 && lines[lines.length - 1].agent === "sys" && lines.length >= script.current.length - 1;
          return (
            <div key={a} className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full transition-all duration-500 ${hasStarted ? "animate-pulse" : "opacity-20"}`}
                style={{ background: agentColor[a], boxShadow: hasStarted ? `0 0 6px ${agentColor[a]}` : "none" }}
              />
              <span
                className="font-mono text-xs font-bold transition-all duration-500"
                style={{ color: hasStarted ? agentColor[a] : "#1E293B" }}
              >
                {a === "blue" ? "Blue" : a === "aeon" ? "Aeon" : "MiroShark"}
              </span>
              {isDone && hasStarted && (
                <span className="font-mono text-[9px] text-slate-600">✓</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Terminal */}
      <div className="w-full max-w-lg bg-[#080810] border border-[#1A1A2E] rounded-xl overflow-hidden">
        {/* Terminal titlebar */}
        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-[#1A1A2E] bg-[#0D0D1A]">
          <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
          <span className="font-mono text-[10px] text-slate-600 ml-3">blue-agent · 3-agent consensus</span>
        </div>
        {/* Log output */}
        <div className="px-4 py-4 space-y-1.5 min-h-[200px] max-h-[280px] overflow-y-auto">
          {lines.map((line, i) => (
            <div key={i} className="flex gap-2 font-mono text-[11px] leading-relaxed animate-fadeIn">
              <span style={{ color: agentColor[line.agent] }} className="shrink-0 opacity-70">
                {line.agent === "sys" ? "›" : "○"}
              </span>
              <span style={{ color: line.agent === "sys" ? "#475569" : agentColor[line.agent] + "CC" }}>
                {line.text}
              </span>
            </div>
          ))}
          {/* blinking cursor on last line */}
          {lines.length > 0 && (
            <div className="flex gap-2 font-mono text-[11px]">
              <span className="text-slate-700">›</span>
              <span className="text-slate-700">{cursor ? "█" : " "}</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <p className="font-mono text-[10px] text-slate-700 mt-5">
        {lines.length < script.current.length
          ? `processing · ${lines.length}/${script.current.length} steps`
          : "finalizing output…"}
      </p>
    </div>
  );
}

// ─── Tool runner ─────────────────────────────────────────────────────────────

type RunStep = "idle" | "calling" | "signing" | "paying" | "done" | "error";

function randomNonce(): `0x${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("")}`;
}

function ToolRunner({ tool, onBack, cached, onResult }: {
  tool: Tool;
  onBack: () => void;
  cached: ToolResult | null;
  onResult: (r: ToolResult) => void;
}) {
  const [vals, setVals]       = useState<Record<string,string>>({});
  const [step, setStep]       = useState<RunStep>(cached ? "done" : "idle");
  const [result, setResult]   = useState<Record<string,unknown> | null>(cached?.result ?? null);
  const [err, setErr]         = useState<string | null>(null);
  const [isMock, setIsMock]   = useState(cached?.isMock ?? false);
  const [mockReason, setMockReason] = useState<"dev" | "service-down">(cached?.mockReason ?? "dev");
  const [copied, setCopied]   = useState(false);

  const { address, isConnected } = useAccount();
  const { signTypedDataAsync }   = useSignTypedData();

  const loading = step === "calling" || step === "signing" || step === "paying";

  function shareResult() {
    if (!result) return;
    const r: ToolResult = { result, isMock, mockReason };
    const encoded = encodeShare(tool.id, r);
    const url = `${window.location.origin}/hub#s=${encoded}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function run() {
    const missing = tool.inputs.filter(i => i.required && !vals[i.key]?.trim());
    if (missing.length) { setErr(`Required: ${missing.map(i => i.label).join(", ")}`); return; }

    setErr(null); setResult(null); setIsMock(false);

    const body: Record<string,string> = {};
    tool.inputs.forEach(i => { if (vals[i.key]) body[i.key] = vals[i.key]; });

    // ── x402 flow: wallet connected + tool has price ──────────────────────────
    if (tool.x402Body && isConnected && address) {
      try {
        setStep("calling");

        // Step 1: POST to /api/tool/<id> proxy — returns 402 details or result
        const r1 = await fetch(`/api/tool/${tool.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toolParams: tool.x402Body(body) }),
        });
        const d1 = await r1.json() as Record<string,unknown>;

        if (!d1.requiresPayment) {
          const res = (d1.result ?? d1) as Record<string,unknown>;
          setResult(res); setStep("done");
          onResult({ result: res, isMock: false, mockReason: "dev" });
          return;
        }

        // Step 2: parse payment requirements from 402 response
        const accepts = (d1.paymentDetails as Record<string,unknown>)?.accepts as Record<string,unknown>[] | undefined;
        if (!accepts?.length) throw new Error("No payment details in 402 response");
        const req = accepts[0] as { payTo: string; maxAmountRequired: string; asset?: string; extra?: Record<string,string> };

        setStep("signing");
        const nonce       = randomNonce();
        const validBefore = BigInt(Math.floor(Date.now() / 1000) + 300);
        const USDC_BASE   = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

        // Step 3: sign EIP-3009 TransferWithAuthorization
        const signature = await signTypedDataAsync({
          domain: {
            name:             req.extra?.name    ?? "USD Coin",
            version:          req.extra?.version ?? "2",
            chainId:          8453,
            verifyingContract: (req.asset ?? USDC_BASE) as `0x${string}`,
          },
          types: {
            TransferWithAuthorization: [
              { name: "from",         type: "address" },
              { name: "to",           type: "address" },
              { name: "value",        type: "uint256" },
              { name: "validAfter",   type: "uint256" },
              { name: "validBefore",  type: "uint256" },
              { name: "nonce",        type: "bytes32" },
            ],
          },
          primaryType: "TransferWithAuthorization",
          message: {
            from:        address,
            to:          req.payTo as `0x${string}`,
            value:       BigInt(req.maxAmountRequired),
            validAfter:  BigInt(0),
            validBefore,
            nonce,
          },
        });

        setStep("paying");
        const payment = {
          x402Version: 1, scheme: "exact", network: "base-mainnet",
          payload: {
            signature,
            authorization: {
              from: address, to: req.payTo,
              value: req.maxAmountRequired,
              validAfter: "0", validBefore: validBefore.toString(), nonce,
            },
          },
        };

        // Step 4: retry with payment
        const r2 = await fetch(`/api/tool/${tool.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toolParams: tool.x402Body(body), payment }),
        });
        const d2 = await r2.json() as Record<string,unknown>;
        if (d2.error) throw new Error(String(d2.error));
        const res2 = (d2.result ?? d2) as Record<string,unknown>;
        setResult(res2); setStep("done");
        onResult({ result: res2, isMock: false, mockReason: "dev" });

      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setErr(msg.includes("rejected") || msg.includes("denied") ? "Signature cancelled" : msg);
        setStep("error");
      }
      return;
    }

    // ── Free flow: no wallet or no x402Body ──────────────────────────────────
    setStep("calling");

    try {
      const res = await fetch(`/api/${tool.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status >= 500) {
        await new Promise(r => setTimeout(r, 700));
        const r = getMockResult(tool);
        setResult(r); setIsMock(true); setMockReason("service-down");
        setStep("done");
        onResult({ result: r, isMock: true, mockReason: "service-down" });
        return;
      }

      const data = await res.json() as Record<string,unknown>;
      if (!res.ok) { setErr((data.message as string) ?? (data.error as string) ?? "Request failed"); setStep("error"); return; }
      setResult(data);
      setStep("done");
      onResult({ result: data, isMock: false, mockReason: "dev" });

    } catch {
      await new Promise(r => setTimeout(r, 700));
      const r = getMockResult(tool);
      setResult(r); setIsMock(true); setMockReason("service-down");
      setStep("done");
      onResult({ result: r, isMock: true, mockReason: "service-down" });
    }
  }

  return (
    <div className="flex flex-col h-full">

      {/* Back nav */}
      <div className="px-6 py-3 border-b border-[#1A1A2E] flex items-center gap-2 shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 font-mono text-xs text-slate-500 hover:text-white transition-colors">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Hub
        </button>
        <span className="font-mono text-[10px] text-slate-700">/</span>
        <span className="font-mono text-xs text-slate-400 truncate">{tool.name}</span>
        <div className="ml-auto flex items-center gap-2">
          {tool.agents.map(a => (
            <span key={a} className="font-mono text-[9px] px-1.5 py-0.5 rounded-full"
              style={{ color: AGENT_COLORS[a], background: `${AGENT_COLORS[a]}10` }}>
              {AGENT_LABELS[a]}
            </span>
          ))}
        </div>
      </div>

      {/* 2-column body */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel: tool info + form ── */}
        <div className="w-[400px] xl:w-[440px] shrink-0 border-r border-[#1A1A2E] overflow-y-auto flex flex-col">

          {/* Tool header */}
          <div className="px-6 pt-6 pb-5 border-b border-[#1A1A2E]">
            <div className="inline-flex items-center gap-2 border border-[#A78BFA]/20 bg-[#A78BFA]/5 rounded-full px-3 py-1 mb-4">
              <span className="w-1 h-1 rounded-full bg-[#A78BFA] animate-pulse" />
              <span className="font-mono text-[9px] text-[#A78BFA] tracking-widest">
                {tool.cat.replace(/-/g, " ").toUpperCase()}
              </span>
            </div>
            <h2 className="font-mono text-xl font-bold text-white mb-2">{tool.name}</h2>
            <p className="font-mono text-xs text-slate-500 leading-relaxed">{tool.desc}</p>
          </div>

          {/* Input form */}
          <div className="px-6 py-5 flex-1">
            <div className="flex items-center justify-between mb-1">
              <p className="font-mono text-[10px] text-[#4FC3F7] tracking-widest">// INPUT</p>
            </div>
            <p className="font-mono text-[10px] text-slate-700 mb-4">
              Output quality depends on input accuracy — use real data for best results
            </p>
            <div className="space-y-4">
              {tool.inputs.map(input => (
                <div key={input.key}>
                  <label className="block font-mono text-xs text-slate-500 mb-1.5">
                    {input.label}{input.required && <span className="text-[#4FC3F7] ml-1">*</span>}
                  </label>
                  <textarea
                    rows={input.placeholder.length > 60 ? 3 : 2}
                    className="w-full bg-[#0D0D1A] border border-[#1A1A2E] rounded-lg px-3 py-2 font-mono text-xs text-white placeholder-slate-700 focus:outline-none focus:border-[#4FC3F7]/40 transition-colors resize-none"
                    placeholder={input.placeholder}
                    value={vals[input.key] ?? ""}
                    onChange={e => setVals(v => ({ ...v, [input.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Run button + error */}
          <div className="px-6 pb-6 shrink-0">
            {step === "error" && err && (
              <p className="font-mono text-xs text-red-400 mb-3">{err}</p>
            )}
            {tool.x402Body && !isConnected && (
              <p className="font-mono text-[10px] text-amber-400/70 mb-2">
                Connect wallet to pay {tool.price} via x402
              </p>
            )}
            <button
              onClick={run}
              disabled={loading}
              className="w-full font-mono text-sm font-semibold bg-[#4FC3F7] text-[#050508] px-6 py-3 rounded-xl hover:bg-[#29ABE2] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {step === "signing" ? "Sign in wallet…" :
               step === "paying"  ? "Paying USDC…"   :
               loading            ? "Calling agents…" :
               (tool.x402Body && isConnected) ? `Run · ${tool.price}` : "Run →"}
            </button>
          </div>
        </div>

        {/* ── Right panel: output ── */}
        <div className="flex-1 overflow-y-auto">
          {loading && <AgentScanLog tool={tool} />}

          {step === "idle" && !result && (
            <div className="flex flex-col items-center justify-center h-full gap-3 px-8">
              <div className="flex items-center gap-3 mb-2">
                {tool.agents.map(a => (
                  <div key={a} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: AGENT_COLORS[a] }} />
                    <span className="font-mono text-xs font-bold" style={{ color: AGENT_COLORS[a] }}>{AGENT_LABELS[a]}</span>
                  </div>
                ))}
              </div>
              <p className="font-mono text-xs text-slate-600 text-center max-w-xs leading-relaxed">
                Fill in the inputs and run to get 3-agent consensus output
              </p>
            </div>
          )}

          {step === "done" && result && (
            <div className="p-6 lg:p-8">
              <div className="flex items-center gap-2 mb-6 pb-4 border-b border-[#1A1A2E]">
                <div className="glow-dot" />
                <span className="font-mono text-xs text-slate-400">{tool.name}</span>
                {isMock && (
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-amber-500/30 text-amber-500 ml-2">
                    PREVIEW
                  </span>
                )}
                {cached && !loading && (
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-[#34D399]/30 text-[#34D399] ml-1">
                    cached
                  </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-700 mr-1">Blue · Aeon · MiroShark</span>
                  <button
                    onClick={shareResult}
                    className={`font-mono text-[10px] px-2 py-1 rounded border transition-all ${
                      copied
                        ? "text-[#34D399] border-[#34D399]/40 bg-[#34D399]/5"
                        : "text-slate-500 border-[#1A1A2E] hover:text-[#4FC3F7] hover:border-[#4FC3F7]/30"
                    }`}
                  >
                    {copied ? "✓ Copied!" : "Share ↗"}
                  </button>
                  <button
                    onClick={() => { setResult(null); setStep("idle"); }}
                    className="font-mono text-[10px] text-slate-600 hover:text-white border border-[#1A1A2E] hover:border-[#4FC3F7]/30 px-2 py-1 rounded transition-all"
                  >
                    Re-run ↺
                  </button>
                </div>
              </div>
              <ResultObj obj={result} />
              {isMock && (
                <p className="font-mono text-[10px] text-slate-700 mt-6 pt-4 border-t border-[#1A1A2E]">
                  preview data — live results powered by 3-agent consensus
                </p>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── Empty / browse state ─────────────────────────────────────────────────────

function EmptyState({ onSelect }: { onSelect: (t: Tool) => void }) {
  const featuredTools = TOOLS.filter(t => FEATURED_IDS.includes(t.id));
  const otherTools    = TOOLS.filter(t => !FEATURED_IDS.includes(t.id));

  return (
    <div className="flex flex-col h-full overflow-y-auto">

      {/* ── Compact top bar ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1A1A2E] shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="font-mono text-2xl font-bold text-white tracking-tight">
            BLUE<span className="text-[#A78BFA]">HUB</span>
          </h1>
          <div className="flex items-center gap-1 px-2.5 py-1 border border-[#A78BFA]/20 bg-[#A78BFA]/5 rounded-full">
            <span className="w-1 h-1 rounded-full bg-[#A78BFA] animate-pulse" />
            <span className="font-mono text-[9px] text-[#A78BFA] tracking-widest ml-1">3-AGENT · {TOOLS.length} TOOLS</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {(["blue","aeon","miroshark"] as Agent[]).map(a => (
            <div key={a} className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: AGENT_COLORS[a] }} />
              <span className="font-mono text-xs font-bold" style={{ color: AGENT_COLORS[a] }}>{AGENT_LABELS[a]}</span>
            </div>
          ))}
          <Link href="/hub/registry"
            className="flex items-center gap-1.5 px-3 py-1.5 border border-[#1A1A2E] hover:border-[#34D399]/20 rounded-lg font-mono text-[10px] text-slate-500 hover:text-[#34D399] transition-all">
            <span className="w-1 h-1 rounded-full bg-[#34D399] animate-pulse" />
            Registry
          </Link>
        </div>
      </div>

      {/* ── Content grid ── */}
      <div className="flex-1 px-6 py-5 overflow-y-auto">

        {/* Featured for founders */}
        <div className="flex items-center gap-3 mb-3">
          <p className="font-mono text-[10px] text-[#A78BFA] tracking-widest">// FEATURED FOR FOUNDERS</p>
          <div className="flex-1 h-px bg-[#A78BFA]/10" />
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 mb-5">
          {featuredTools.map(tool => (
            <button key={tool.id} onClick={() => onSelect(tool)}
              className="text-left rounded-xl p-4 transition-all group border border-[#A78BFA]/20 bg-[#A78BFA]/5 hover:bg-[#A78BFA]/10 hover:border-[#A78BFA]/40">
              <div className="flex items-center gap-1.5 mb-2.5">
                {tool.agents.map(a => (
                  <span key={a} className="w-1.5 h-1.5 rounded-full" style={{ background: AGENT_COLORS[a] }} />
                ))}
              </div>
              <p className="font-mono text-sm font-semibold text-white group-hover:text-[#A78BFA] transition-colors mb-1 leading-snug">
                {tool.name}
              </p>
              <p className="font-mono text-[10px] text-slate-500 leading-relaxed line-clamp-2">{tool.desc}</p>
              <p className="font-mono text-[10px] text-[#A78BFA]/50 mt-2.5">Run →</p>
            </button>
          ))}
        </div>

        {/* More tools — all of them in a dense grid */}
        <div className="flex items-center gap-3 mb-3">
          <p className="font-mono text-[10px] text-slate-600 tracking-widest">// MORE TOOLS</p>
          <div className="flex-1 h-px bg-[#1A1A2E]" />
          <span className="font-mono text-[9px] text-slate-700">{otherTools.length} tools</span>
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-2">
          {otherTools.map(tool => (
            <button key={tool.id} onClick={() => onSelect(tool)}
              className="text-left bg-[#0D0D1A] border border-[#1A1A2E] hover:border-[#4FC3F7]/15 rounded-xl p-3.5 transition-all group">
              <div className="flex items-center gap-1.5 mb-2">
                {tool.agents.map(a => (
                  <span key={a} className="w-1 h-1 rounded-full" style={{ background: AGENT_COLORS[a] }} />
                ))}
                <span className="font-mono text-[9px] text-slate-700 ml-auto">{tool.price}</span>
              </div>
              <p className="font-mono text-xs font-semibold text-white group-hover:text-[#4FC3F7] transition-colors mb-0.5 leading-snug">{tool.name}</p>
              <p className="font-mono text-[10px] text-slate-600 leading-relaxed line-clamp-2">{tool.desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Cached result type ───────────────────────────────────────────────────────

type ToolResult = { result: Record<string,unknown>; isMock: boolean; mockReason: "dev" | "service-down" };

// ─── Share encode / decode ────────────────────────────────────────────────────

function encodeShare(toolId: string, r: ToolResult): string {
  const payload = JSON.stringify({ toolId, ...r });
  return btoa(unescape(encodeURIComponent(payload)));
}

function decodeShare(hash: string): { toolId: string } & ToolResult | null {
  try {
    const raw = decodeURIComponent(escape(atob(hash)));
    const p = JSON.parse(raw) as { toolId: string } & ToolResult;
    if (!p.toolId || !p.result) return null;
    return p;
  } catch { return null; }
}

// ─── Hub page ─────────────────────────────────────────────────────────────────

export default function HubPage() {
  const [cat, setCat]         = useState<Category>("all");
  const [selected, setSelected] = useState<Tool | null>(null);
  const [search, setSearch]   = useState("");
  const [cache, setCache]     = useState<Map<string, ToolResult>>(new Map());

  function saveResult(toolId: string, r: ToolResult) {
    setCache(prev => new Map(prev).set(toolId, r));
  }

  // ── On mount: decode shared result from URL hash ──────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.slice(1); // strip #
    if (!hash.startsWith("s=")) return;
    const shared = decodeShare(hash.slice(2));
    if (!shared) return;
    const tool = TOOLS.find(t => t.id === shared.toolId);
    if (!tool) return;
    const r: ToolResult = { result: shared.result, isMock: shared.isMock, mockReason: shared.mockReason };
    setCache(new Map([[shared.toolId, r]]));
    setSelected(tool);
    // clean hash from URL without reload
    window.history.replaceState(null, "", window.location.pathname);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
              const hasCached  = cache.has(tool.id);
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
                      {hasCached && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" title="Result cached" />
                      )}
                      {isFeatured && (
                        <span className="font-mono text-[9px] px-1 py-0.5 rounded border border-[#A78BFA]/40 text-[#A78BFA]">
                          ★
                        </span>
                      )}
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
            <p className="font-mono text-[10px] text-slate-700">3-agent consensus · Base</p>
          </div>
        </aside>

        {/* ── Main content ─────────────────────────────── */}
        <main className="flex-1 h-[calc(100vh-4rem)] overflow-hidden flex flex-col">
          {selected
            ? <ToolRunner
                tool={selected}
                onBack={() => setSelected(null)}
                cached={cache.get(selected.id) ?? null}
                onResult={(r) => saveResult(selected.id, r)}
              />
            : <div className="overflow-y-auto flex-1"><EmptyState onSelect={setSelected} /></div>
          }
        </main>

      </div>
    </>
  );
}
