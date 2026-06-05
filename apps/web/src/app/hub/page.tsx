"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { AGENT_TOOLS } from "@/lib/agent-tools";
import { useAccount, useSignTypedData, useReadContract } from "wagmi";
import { ConnectButton } from "@/components/ConnectModal";

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const ERC20_BAL_ABI = [{
  name: "balanceOf", type: "function", stateMutability: "view",
  inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }],
}] as const;

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

// ─── Example inputs per tool ──────────────────────────────────────────────────
// Keys must exactly match input.key fields in agent-tools.ts
const TOOL_EXAMPLES: Record<string, Record<string, string>> = {
  // ── Intelligence ─────────────────────────────────────────────────────────────
  "token-pick-signal":         { context: "low-cap AI agent tokens on Base" },
  "narrative-position":        { focus: "AI agents, Base DeFi" },
  "ecosystem-digest":          { focus: "DeFi protocols and AI agents" },
  "market-fit":                { description: "Pay-per-use AI research tool for Base builders — $0.50/report via x402 USDC micropayments", stage: "MVP" },
  "token-launch-readiness":    { name: "BLUEAI", description: "AI agent tooling on Base — 40 live tools, 200 weekly users, $2k MRR, community of 500 builders" },
  // ── Builder ───────────────────────────────────────────────────────────────────
  "roadmap-validator":         { project: "x402 AI tool marketplace on Base", roadmap: "Q1: 10 tools, Q2: open marketplace, Q3: agent registry, Q4: Tool NFTs" },
  "competitor-scan":           { project: "AI agent tool marketplace with x402 pay-per-call", category: "AI agent infrastructure" },
  "pitch-intelligence":        { project: "Blue Agent", description: "40 pay-per-use AI tools for Base builders via x402 micropayments. $2k MRR, 200 weekly users, raising $750k pre-seed." },
  "fundraise-timing":          { project: "x402 pay-per-call AI tool marketplace", stage: "pre-seed · 40 tools live · 200 weekly users · $2k MRR" },
  "gtm-brief":                 { project: "Blue Agent Hub", description: "40 AI tools for Base builders, pay per call in USDC, no signup", target: "Base builders, DeFi devs, AI agent teams" },
  "stack-recommender":         { project_type: "Multi-agent x402 tool marketplace on Base mainnet with USDC micropayments", constraints: "TypeScript, Next.js, solo dev" },
  "investor-memo":             { project: "Blue Agent", description: "40 pay-per-use AI tools for Base builders via x402 micropayments", ask: "$750k pre-seed" },
  "token-distribution-plan":   { token: "BLUEAGENT", total_supply: "1000000000", description: "reward builders and agents on Base, community-first, 40% public" },
  "agent-performance":         { handle: "@blocky_agent" },
  "agent-collab-match":        { agent_a: "Blue Agent — AI research + x402 tool execution on Base", agent_b: "any", collab_goal: "joint tool bundle or revenue share" },
  "repo-health":               { repo: "madebyshun/blue-agent" },
  "community-sentiment":       { project: "Base", channels: "@base Twitter, Base Discord, base.mirror.xyz" },
  "defi-opportunity":          { focus: "stablecoin yield above 8% APR on Base", risk_tolerance: "medium" },
  "builder-deep-dd":           { target: "@madebyshun" },
  // ── Launch Simulator ──────────────────────────────────────────────────────────
  "launch-simulator":          { token_name: "BLUEAI", launch_price: "0.001", total_supply: "1000000000", liquidity: "50000", tier: "deep" },
  // ── Trading ───────────────────────────────────────────────────────────────────
  "whale-copy-signal":         { wallet: "", token: "WETH" },
  "token-momentum-scanner":    { timeframe: "24h", filter: "min $50k volume, AI agent narrative" },
  "portfolio-rebalancer":      { holdings: "40% ETH, 30% USDC, 20% CBBTC, 10% AERO", goal: "reduce volatility, increase stablecoin exposure" },
  // ── Content ───────────────────────────────────────────────────────────────────
  "thread-intelligence":       { topic: "x402 pay-per-call changes how agents monetize on Base", angle: "alpha drop — explain the pattern, why it matters for agent builders" },
  "builder-brand-score":       { handle: "@madebyshun", focus: "AI agent tooling and x402 infrastructure on Base" },
  "community-growth-playbook": { project: "Blue Agent", current_size: "500 Telegram members, 2k Twitter followers" },
  // ── Agent Economy ─────────────────────────────────────────────────────────────
  "agent-revenue-optimizer":   { agent: "Blue Agent", description: "40 AI tools at $0.05–$0.50 per call via x402", current_revenue: "$2000" },
  "agent-token-strategy":      { agent: "Blue Agent", description: "governance + access gating + revenue share for $BLUEAGENT holders" },
  "multi-agent-workflow":      { goal: "Research top 5 AI agent tokens on Base and generate a buy/sell signal", agents: "Blue Agent, Aeon, MiroShark" },
  // ── Base Ecosystem ────────────────────────────────────────────────────────────
  "base-grant-finder":         { project: "AI tool marketplace with x402 pay-per-call micropayments on Base", stage: "MVP — live product with 200 weekly users" },
  "base-protocol-comparison":  { protocol_a: "Aerodrome", protocol_b: "Uniswap v4", use_case: "liquidity pool for BLUEAGENT/ETH pair" },
  "base-builder-network-match":{ skills: "TypeScript, Next.js, AI agents, product", looking_for: "Solidity co-founder or technical advisor" },
  // ── On-chain ─────────────────────────────────────────────────────────────────
  "wallet-strategy-analyzer":  { address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", focus: "DeFi activity and token accumulation patterns" },
  "protocol-risk-monitor":     { protocol: "Aerodrome Finance", position: "ETH/USDC LP — $5k deployed" },
  "contract-trust":            { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", context: "USDC token on Base" },
  // ── Console commands ──────────────────────────────────────────────────────────
  "blue-idea":  { prompt: "gasless USDC tipping app for Base builders — reward good code reviews" },
  "blue-build": { prompt: "x402 pay-per-call AI tool marketplace on Base with USDC micropayments" },
  "blue-audit": { prompt: "ERC20 token with staking and revenue share — check for reentrancy and access control issues" },
  "blue-ship":  { prompt: "Base mainnet launch of BLUEAGENT token with Uniswap v4 pool" },
  "blue-raise": { prompt: "AI agent tool marketplace on Base — 40 tools, $2k MRR, raising $750k pre-seed" },
  // ── Security ──────────────────────────────────────────────────────────────────
  "honeypot-check":  { token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
  "risk-gate":       { action: "buy token on Uniswap", contractAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", amount: "$50" },
  "deep-analysis":   { token: "0xf895783b2931c919955e18b5e3343e7c7c456ba3" },
  "builder-score":   { handle: "@madebyshun" },
  "agent-score":     { handle: "@blueagent_" },
  // ── Quantum ───────────────────────────────────────────────────────────────────
  "quantum-premium": { address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },
  "quantum-batch":   { addresses: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045,0xab5801a7d398351b8be11c439e05c5b3259aec9b" },
  "quantum-migrate": { address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },
  "quantum-timeline":{ context: "DeFi wallet with $50k in assets on Base" },
  "key-exposure":    { address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },
  // ── On-chain Data ─────────────────────────────────────────────────────────────
  "wallet-pnl":      { address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },
  "aml-screen":      { address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },
  "airdrop-check":   { address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },
  "whale-tracker":   { token: "0xf895783b2931c919955e18b5e3343e7c7c456ba3" },
  "dex-flow":        { token: "0xf895783b2931c919955e18b5e3343e7c7c456ba3" },
  // ── Earn ──────────────────────────────────────────────────────────────────────
  "yield-optimizer": { risk_tolerance: "medium", amount: "10000" },
  "lp-analyzer":     { pool: "WETH/USDC 0.05%", position: "$5000 deployed" },
  "tax-report":      { address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", year: "2024" },
  // ── Alerts ────────────────────────────────────────────────────────────────────
  "alert-subscribe": { address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", webhook: "https://your-server.com/webhook", events: "large_transfer,whale_buy" },
  "alert-check":     { address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },
  // ── Launch (extended) ─────────────────────────────────────────────────────────
  "launch-simulator-2": { token_name: "BLUEAI", launch_price: "0.001", total_supply: "1000000000", liquidity: "50000" },
  "launch-simulator-3": { token_name: "BLUEAI", launch_price: "0.001", total_supply: "1000000000", liquidity: "50000" },
  "launch-advisor":     { token_name: "BLUEAI", description: "AI agent tooling on Base — 64 live tools, 500 weekly users, $5k MRR", raise: "$750k" },
  "grant-evaluator":    { project: "Blue Agent", description: "64 pay-per-use AI tools for Base builders via x402 micropayments. 500 weekly users, $5k MRR.", ask: "$50k" },
};

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
const SKIP_KEYS      = ["tool", "timestamp", "chain", "_settle", "period", "data_source", "tokens_analyzed", "headline"];
const TITLE_KEYS     = ["token", "symbol", "ticker", "name", "protocol", "title", "handle", "project"];

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

  // Object array — render as cards with a prominent title field
  if (Array.isArray(v)) {
    return (
      <div className="space-y-2 mt-1">
        {(v as Record<string,unknown>[]).map((obj, i) => {
          const titleKey = TITLE_KEYS.find(tk => obj?.[tk]);
          const title = titleKey ? String(obj[titleKey]) : null;
          const rest = titleKey
            ? Object.fromEntries(Object.entries(obj).filter(([kk]) => kk !== titleKey))
            : obj;
          return (
            <div key={i} className="border border-[#1A1A2E] rounded-lg p-2.5 bg-[#0A0A12]">
              {title && (
                <div className="font-mono text-sm font-bold text-[#4FC3F7] mb-1.5">{title}</div>
              )}
              <ResultObj obj={rest} nested />
            </div>
          );
        })}
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
  const headline = !nested && typeof obj.headline === "string" ? (obj.headline as string) : null;
  return (
    <>
      {headline && (
        <p className="text-lg font-semibold text-white leading-snug mb-5 pb-4 border-b border-[#1A1A2E]">
          {headline}
        </p>
      )}
      <dl className={nested ? "space-y-1.5" : "space-y-4"}>
        {Object.entries(obj).filter(([k]) => !SKIP.includes(k)).map(([k, v]) => (
          <div key={k}>
            <dt className="font-mono text-[10px] text-slate-500 uppercase tracking-wider mb-1">{k.replace(/_/g," ")}</dt>
            <dd><SmartValue k={k} v={v} /></dd>
          </div>
        ))}
      </dl>
    </>
  );
}


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
          <span className="font-mono text-[10px] text-slate-600 ml-3">blue-agent · multi-agent</span>
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
  const [mobileTab, setMobileTab] = useState<"input" | "output">(cached ? "output" : "input");
  const [mockReason, setMockReason] = useState<"dev" | "service-down">(cached?.mockReason ?? "dev");
  const [copied, setCopied]   = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  const toolExamples = TOOL_EXAMPLES[tool.id] ?? {};
  const hasExamples  = Object.keys(toolExamples).length > 0;

  function fillExample() {
    setVals(toolExamples);
    setErr(null);
  }

  async function copyJson() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    } catch {}
  }

  const { address, isConnected } = useAccount();
  const { signTypedDataAsync }   = useSignTypedData();

  const { data: usdcBalRaw } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_BAL_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: 8453,
    query: { enabled: !!address },
  });
  const usdcBalance = usdcBalRaw != null ? Number(usdcBalRaw) / 1e6 : null;

  const loading = step === "calling" || step === "signing" || step === "paying";

  async function shareResult() {
    if (!result) return;
    try {
      // Server-side short id so URLs are ~30 chars instead of 3 KB of base64
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolId: tool.id, result, isMock, mockReason }),
      });
      const data = await res.json() as { id?: string };
      const url = data.id
        ? `${window.location.origin}/hub#s=${data.id}`
        : `${window.location.origin}/hub/${tool.id}`; // fallback to tool detail
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: copy plain tool detail link
      await navigator.clipboard.writeText(`${window.location.origin}/hub/${tool.id}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
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
        // Known constants — no discovery call needed
        const USDC        = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
        // Self-hosted x402: pay our Club wallet (CDP facilitator settles to it)
        const BANKR_WALLET = "0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f" as const;
        const priceRaw    = tool.price.replace("$", "");
        const priceVal    = parseFloat(priceRaw) || 0;
        const priceUnits  = String(Math.round(priceVal * 1_000_000)); // USDC 6 decimals
        const validBefore = BigInt(Math.floor(Date.now() / 1000) + 300);

        // Pre-check balance so we don't make the user sign a doomed payment
        if (usdcBalance != null && usdcBalance < priceVal) {
          setErr(`Insufficient USDC — you have $${usdcBalance.toFixed(2)}, need ${tool.price}. Top up your wallet on Base.`);
          return;
        }

        setStep("signing");

        // Sign EIP-3009 TransferWithAuthorization
        const nonce = randomNonce();
        const signature = await signTypedDataAsync({
          domain: {
            name:              "USD Coin",
            version:           "2",
            chainId:           8453,
            verifyingContract: USDC,
          },
          types: {
            TransferWithAuthorization: [
              { name: "from",        type: "address" },
              { name: "to",         type: "address" },
              { name: "value",      type: "uint256" },
              { name: "validAfter", type: "uint256" },
              { name: "validBefore",type: "uint256" },
              { name: "nonce",      type: "bytes32" },
            ],
          },
          primaryType: "TransferWithAuthorization",
          message: {
            from:        address,
            to:          BANKR_WALLET,
            value:       BigInt(priceUnits),
            validAfter:  BigInt(0),
            validBefore: validBefore,
            nonce,
          },
        });

        setStep("paying");

        // Single call with X-PAYMENT — proxy forwards to Bankr
        const xPayment = btoa(JSON.stringify({
          x402Version: 2,
          scheme:      "exact",
          network:     "eip155:8453",
          payload: {
            signature,
            authorization: {
              from:        address,
              to:          BANKR_WALLET,
              value:       priceUnits,
              validAfter:  "0",
              validBefore: validBefore.toString(),
              nonce,
            },
          },
        }));

        const r2 = await fetch(`/api/x402/${tool.id}`, {
          method:  "POST",
          headers: { "Content-Type": "application/json", "X-PAYMENT": xPayment },
          body:    JSON.stringify(tool.x402Body(body)),
        });
        const d2 = await r2.json() as Record<string,unknown>;
        if (!r2.ok) throw new Error([d2.error, d2.message, d2.reason].filter(Boolean).join(": ") || `Payment failed ${r2.status}`);
        const res2 = (d2.result ?? d2) as Record<string,unknown>;
        // Show result immediately — don't block behind animation
        setResult(res2);
        setStep("done");
        setMobileTab("output");
        onResult({ result: res2, isMock: false, mockReason: "dev" });

      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setErr(msg.includes("rejected") || msg.includes("denied") ? "Signature cancelled" : msg);
        setStep("error");
      }
      return;
    }

    // ── Paid tool but wallet not connected → require connection, no free output ──
    if (tool.x402Body) {
      setErr("Connect your wallet to run this paid tool.");
      setStep("error");
      return;
    }

    // ── Free flow: only for genuinely free tools (no x402Body) ────────────────
    setStep("calling");

    try {
      const res = await fetch(`/api/x402/${tool.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({})) as Record<string,unknown>;
      if (!res.ok) {
        setErr((data.message as string) ?? (data.error as string) ?? "Service temporarily unavailable");
        setStep("error");
        return;
      }
      setResult(data);
      setStep("done");
      setMobileTab("output");
      onResult({ result: data, isMock: false, mockReason: "dev" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Request failed");
      setStep("error");
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

      {/* Mobile tab bar — Input / Output */}
      <div className="lg:hidden flex border-b border-[#1A1A2E] shrink-0">
        {(["input", "output"] as const).map(tab => (
          <button key={tab} onClick={() => setMobileTab(tab)}
            className={`flex-1 py-2.5 font-mono text-xs font-semibold transition-colors ${
              mobileTab === tab
                ? "text-[#4FC3F7] border-b-2 border-[#4FC3F7]"
                : "text-slate-600"
            }`}
          >
            {tab === "input" ? "⌨ Input" : step === "done" ? "✓ Output" : "◎ Output"}
          </button>
        ))}
      </div>

      {/* 2-column body — tab-controlled on mobile, side-by-side on desktop */}
      <div className="flex flex-col lg:flex-row flex-1 overflow-y-auto lg:overflow-hidden">

        {/* ── Left panel: tool info + form ── */}
        <div className={`w-full lg:w-[400px] xl:w-[440px] shrink-0 border-b lg:border-b-0 lg:border-r border-[#1A1A2E] lg:overflow-y-auto flex flex-col ${mobileTab === "output" ? "hidden lg:flex" : ""}`}>

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
              {hasExamples && (
                <button
                  onClick={fillExample}
                  className="font-mono text-[10px] text-[#A78BFA] hover:text-white border border-[#A78BFA]/30 hover:border-[#A78BFA]/60 px-2 py-0.5 rounded transition-all"
                >
                  Try example →
                </button>
              )}
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
              <div className="mb-3 px-4 py-3 rounded-xl bg-[#0D0D1A] border border-[#1A1A2E] flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-white font-semibold">{tool.price} · pay via x402</p>
                  <p className="font-mono text-[10px] text-slate-600 mt-0.5">USDC on Base · EIP-3009 · no signup</p>
                </div>
                <ConnectButton
                  label="Connect Wallet"
                  className="font-mono text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all shrink-0"
                  style={{ borderColor: "#4FC3F7", color: "#4FC3F7", background: "#4FC3F710" }}
                />
              </div>
            )}
            {tool.x402Body && isConnected && usdcBalance != null && (
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="font-mono text-[10px] text-slate-600">USDC balance</span>
                <span className={`font-mono text-[10px] font-semibold ${
                  usdcBalance < (parseFloat(tool.price.replace("$", "")) || 0) ? "text-red-400" : "text-[#34D399]"
                }`}>
                  ${usdcBalance.toFixed(2)}
                </span>
              </div>
            )}
            <button
              onClick={run}
              disabled={loading}
              className="w-full font-mono text-sm font-bold px-6 py-3.5 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: loading ? "#29ABE2" : "linear-gradient(135deg, #4FC3F7 0%, #29ABE2 100%)",
                color: "#050508",
                boxShadow: loading ? "none" : "0 0 20px rgba(79,195,247,0.25), 0 4px 12px rgba(79,195,247,0.15)",
              }}
            >
              {step === "signing" ? "✍ Sign in wallet…" :
               step === "paying"  ? "💸 Paying USDC…"  :
               loading            ? "⚡ Calling agents…" :
               (tool.x402Body && isConnected) ? `⚡ Run · ${tool.price}` : "⚡ Run →"}
            </button>
          </div>
        </div>

        {/* ── Right panel: output ── */}
        <div className={`flex-1 lg:overflow-y-auto lg:min-h-0 ${mobileTab === "input" ? "hidden lg:block" : "min-h-[60vh] lg:min-h-0"}`}>
          {loading && <AgentScanLog tool={tool} />}

          {step === "idle" && !result && (
            <div className="flex flex-col items-center justify-center h-full gap-4 px-8 py-10">
              {/* Agent pills */}
              <div className="flex items-center gap-3">
                {tool.agents.map(a => (
                  <div key={a} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border" style={{ borderColor: AGENT_COLORS[a] + "30", background: AGENT_COLORS[a] + "08" }}>
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: AGENT_COLORS[a] }} />
                    <span className="font-mono text-xs font-bold" style={{ color: AGENT_COLORS[a] }}>{AGENT_LABELS[a]}</span>
                  </div>
                ))}
              </div>
              <p className="font-mono text-xs text-slate-600 text-center max-w-xs leading-relaxed">
                Fill in the inputs, then hit <span className="text-[#4FC3F7]">Run</span> to get multi-agent AI output.
              </p>
              {/* Example prompt preview */}
              {hasExamples && (
                <div className="w-full max-w-sm rounded-xl border border-[#A78BFA]/15 bg-[#0D0D1A] overflow-hidden">
                  <div className="px-3 py-2 border-b border-[#1A1A2E] flex items-center justify-between">
                    <span className="font-mono text-[9px] text-[#A78BFA] tracking-widest">EXAMPLE INPUT</span>
                    <button onClick={fillExample} className="font-mono text-[10px] text-[#A78BFA] hover:text-white transition-colors">
                      Use this →
                    </button>
                  </div>
                  <div className="px-3 py-2.5 space-y-1.5">
                    {Object.entries(toolExamples).slice(0, 3).map(([k, v]) => (
                      <div key={k}>
                        <span className="font-mono text-[9px] text-slate-700 uppercase tracking-wider">{k.replace(/_/g, " ")}</span>
                        <p className="font-mono text-[10px] text-slate-400 leading-relaxed truncate">{v}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p className="font-mono text-[10px] text-slate-700">Output from {tool.price} · USDC · Base · EIP-3009</p>
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
                {!isMock && (result._settle as { ok?: boolean; tx?: string } | undefined)?.ok && (() => {
                  const settle = result._settle as { ok?: boolean; tx?: string };
                  const cls = "font-mono text-[10px] px-1.5 py-0.5 rounded border border-[#34D399]/30 text-[#34D399] ml-1";
                  return settle.tx
                    ? <a href={`https://basescan.org/tx/${settle.tx}`} target="_blank" rel="noopener noreferrer"
                         className={`${cls} hover:bg-[#34D399]/10 transition-colors`}>✓ Paid {tool.price} ↗</a>
                    : <span className={cls}>✓ Paid {tool.price}</span>;
                })()}
                <div className="ml-auto flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-700 mr-1">Blue · Aeon · MiroShark</span>
                  <button
                    onClick={copyJson}
                    className={`font-mono text-[10px] px-2 py-1 rounded border transition-all ${
                      copiedJson
                        ? "text-[#A78BFA] border-[#A78BFA]/40 bg-[#A78BFA]/5"
                        : "text-slate-500 border-[#1A1A2E] hover:text-[#A78BFA] hover:border-[#A78BFA]/30"
                    }`}
                  >
                    {copiedJson ? "✓ JSON!" : "{ } JSON"}
                  </button>
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
              {isMock ? (
                <p className="font-mono text-[10px] text-slate-700 mt-6 pt-4 border-t border-[#1A1A2E]">
                  preview data — live results powered by 3-agent consensus
                </p>
              ) : (
                <p className="font-mono text-[10px] text-slate-700 mt-6 pt-4 border-t border-[#1A1A2E]">
                  {[
                    result.data_source ? `source: ${result.data_source}` : "3-agent consensus · Blue · Aeon · MiroShark",
                    result.timestamp ? new Date(result.timestamp as string).toLocaleString() : null,
                  ].filter(Boolean).join("  ·  ")}
                </p>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── Tool groups (Option A — labeled sections) ────────────────────────────────

const TOOL_GROUPS: { id: string; label: string; desc: string; color: string; ids: string[] }[] = [
  {
    id: "traders",
    label: "For Traders",
    desc: "Signals, market intel, portfolio tools",
    color: "#4FC3F7",
    ids: ["token-pick-signal", "narrative-position", "whale-copy-signal", "defi-opportunity", "token-momentum-scanner", "portfolio-rebalancer", "ecosystem-digest", "protocol-risk-monitor"],
  },
  {
    id: "founders",
    label: "For Founders",
    desc: "Launch, market fit, growth, fundraising",
    color: "#A78BFA",
    ids: ["market-fit", "token-launch-readiness", "competitor-scan", "gtm-brief", "launch-simulator", "launch-simulator-2", "launch-simulator-3", "launch-advisor", "base-grant-finder", "grant-evaluator", "roadmap-validator", "token-distribution-plan", "stack-recommender"],
  },
  {
    id: "investors",
    label: "For Investors",
    desc: "Due diligence, memos, pitch intel",
    color: "#34D399",
    ids: ["builder-deep-dd", "investor-memo", "pitch-intelligence", "fundraise-timing", "builder-brand-score", "base-protocol-comparison", "builder-score", "agent-score"],
  },
  {
    id: "blue",
    label: "Blue Commands",
    desc: "Idea → build → audit → ship → raise",
    color: "#60A5FA",
    ids: ["blue-idea", "blue-build", "blue-audit", "blue-ship", "blue-raise"],
  },
  {
    id: "security",
    label: "Security & Safety",
    desc: "Honeypot, risk gate, deep analysis, quantum protection",
    color: "#F87171",
    ids: ["honeypot-check", "risk-gate", "deep-analysis", "contract-trust", "quantum-premium", "quantum-batch", "quantum-migrate", "quantum-timeline", "key-exposure"],
  },
  {
    id: "onchain",
    label: "On-chain Data",
    desc: "Wallet PnL, AML, airdrops, whale tracking, DEX flow",
    color: "#FACC15",
    ids: ["wallet-pnl", "aml-screen", "airdrop-check", "whale-tracker", "dex-flow", "wallet-strategy-analyzer"],
  },
  {
    id: "earn",
    label: "Earn & DeFi",
    desc: "Yield optimization, LP analysis, tax reporting",
    color: "#34D399",
    ids: ["yield-optimizer", "lp-analyzer", "tax-report"],
  },
  {
    id: "alerts",
    label: "Alerts",
    desc: "Real-time webhook alerts for on-chain events",
    color: "#FB923C",
    ids: ["alert-subscribe", "alert-check"],
  },
  {
    id: "automation",
    label: "Analytics & Automation",
    desc: "Repo health, builder network, protocol monitoring",
    color: "#FB923C",
    ids: ["repo-health", "base-builder-network-match"],
  },
  {
    id: "agents",
    label: "Agent Economy",
    desc: "Multi-agent workflows, revenue, collab",
    color: "#94A3B8",
    ids: ["agent-performance", "agent-collab-match", "agent-revenue-optimizer", "agent-token-strategy", "multi-agent-workflow", "community-sentiment", "community-growth-playbook", "thread-intelligence"],
  },
];

// ─── Empty / browse state ─────────────────────────────────────────────────────

type SortMode = "default" | "price-asc" | "price-desc" | "popular";

function EmptyState({ onSelect, featuredIds, usage, recentIds }: { onSelect: (t: Tool) => void; featuredIds: Set<string>; usage: Record<string, number>; recentIds: string[] }) {
  const recentTools = recentIds.map(id => TOOLS.find(t => t.id === id)).filter((t): t is Tool => !!t).reverse();
  const totalRuns = Object.values(usage).reduce((a, b) => a + b, 0);
  const usdcPaid  = TOOLS.reduce((s, t) => s + (usage[t.id] ?? 0) * (parseFloat(t.price.replace("$", "")) || 0), 0);
  const runsOf = (id: string) => usage[id] ?? 0;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<SortMode>("default");
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const toggleExpand = (groupId: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(groupId) ? n.delete(groupId) : n.add(groupId); return n; });

  // Load onboarding state from localStorage
  useEffect(() => {
    try {
      const dismissed = localStorage.getItem("bluehub_onboarding_dismissed");
      if (!dismissed) setOnboardingOpen(true);
    } catch {}
  }, []);

  function dismissOnboarding() {
    setOnboardingOpen(false);
    try { localStorage.setItem("bluehub_onboarding_dismissed", "1"); } catch {}
  }

  function sortGroupTools(tools: Tool[]): Tool[] {
    if (sortMode === "price-asc") return [...tools].sort((a, b) => (parseFloat(a.price.replace("$",""))||0) - (parseFloat(b.price.replace("$",""))||0));
    if (sortMode === "price-desc") return [...tools].sort((a, b) => (parseFloat(b.price.replace("$",""))||0) - (parseFloat(a.price.replace("$",""))||0));
    if (sortMode === "popular") return [...tools].sort((a, b) => (runsOf(b.id)) - (runsOf(a.id)));
    return tools;
  }

  // suppress unused warning — featuredIds kept in props for future use
  void featuredIds;

  return (
    <div className="flex flex-col h-full overflow-y-auto">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-[#1A1A2E] shrink-0 gap-3">
        {/* Left: brand + badge */}
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <h1 className="font-mono text-xl sm:text-2xl font-bold text-white tracking-tight shrink-0">
            BLUE<span className="text-[#A78BFA]">HUB</span>
          </h1>
          <div className="flex items-center gap-1 px-2 sm:px-2.5 py-1 border border-[#A78BFA]/20 bg-[#A78BFA]/5 rounded-full shrink-0">
            <span className="w-1 h-1 rounded-full bg-[#A78BFA] animate-pulse" />
            <span className="font-mono text-[9px] text-[#A78BFA] tracking-widest ml-1 hidden xs:inline">MULTI-AGENT · </span>
            <span className="font-mono text-[9px] text-[#A78BFA] tracking-widest">{TOOLS.length} TOOLS</span>
          </div>
        </div>
        {/* Right: agent dots (desktop) + links */}
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <div className="hidden sm:flex items-center gap-3">
            {(["blue","aeon","miroshark"] as Agent[]).map(a => (
              <div key={a} className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: AGENT_COLORS[a] }} />
                <span className="font-mono text-xs font-bold" style={{ color: AGENT_COLORS[a] }}>{AGENT_LABELS[a]}</span>
              </div>
            ))}
          </div>
          {/* Mobile: just 3 colored dots */}
          <div className="flex sm:hidden items-center gap-1">
            {(["blue","aeon","miroshark"] as Agent[]).map(a => (
              <span key={a} className="w-2 h-2 rounded-full" style={{ background: AGENT_COLORS[a] }} />
            ))}
          </div>
          <Link href="/hub/registry"
            className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 border border-[#1A1A2E] hover:border-[#34D399]/20 rounded-lg font-mono text-[10px] text-slate-500 hover:text-[#34D399] transition-all">
            <span className="w-1 h-1 rounded-full bg-[#34D399] animate-pulse" />
            <span className="hidden sm:inline">Registry</span>
            <span className="sm:hidden">v2</span>
          </Link>
        </div>
      </div>

      {/* ── Hero — medium ── */}
      <div className="relative overflow-hidden px-4 sm:px-6 py-4 sm:py-5 border-b border-[#1A1A2E] shrink-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[#4FC3F7]/[0.05] via-transparent to-[#A78BFA]/[0.06] pointer-events-none" />
        <div className="relative flex items-start justify-between gap-3">
          {/* Text block */}
          <div className="flex-1 min-w-0">
            <p className="font-mono text-sm sm:text-base font-bold text-white leading-tight mb-1.5">
              <span className="text-[#4FC3F7]">{TOOLS.length} AI tools</span>
              <span className="text-slate-500 font-normal text-xs sm:text-sm ml-2">· pay per call · no subscription</span>
            </p>
            <p className="font-mono text-[11px] sm:text-xs text-slate-400 leading-relaxed max-w-md">
              Research, trade, build and ship on Base — built by multi-agent AI. Pay in USDC, no API key, no signup.
            </p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="font-mono text-[10px] text-slate-600">x402 · EIP-3009 · Base</span>
              <span className="font-mono text-[9px] px-1.5 py-0.5 rounded border border-[#A78BFA]/20 text-[#A78BFA]">Blue Hub v2</span>
            </div>
          </div>
          {/* Stats — hidden on mobile, shown on sm+ */}
          <div className="hidden sm:flex flex-col items-end gap-2 shrink-0">
            <div className="flex items-center gap-2">
              {[
                { label: "tools",  value: String(TOOLS.length) },
                { label: "runs",   value: totalRuns > 0 ? totalRuns.toLocaleString() : "—" },
                { label: "USDC",   value: usdcPaid > 0 ? `$${usdcPaid.toFixed(2)}` : "—" },
              ].map(s => (
                <div key={s.label} className="flex items-baseline gap-1 px-2.5 py-1.5 rounded-lg border border-[#1A1A2E] bg-[#0D0D1A]">
                  <span className="font-mono text-sm font-bold text-white">{s.value}</span>
                  <span className="font-mono text-[9px] text-slate-600 uppercase tracking-wider">{s.label}</span>
                </div>
              ))}
            </div>
            <p className="font-mono text-[9px] text-slate-700">from $0.05 per call</p>
          </div>
        </div>
      </div>

      {/* ── Onboarding strip ── */}
      {onboardingOpen && (
        <div className="px-6 py-3.5 border-b border-[#1A1A2E] bg-[#0D0D1A] shrink-0">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-[#4FC3F7] tracking-widest">// HOW TO USE</span>
              <span className="font-mono text-[9px] text-slate-700">3 steps to run any tool</span>
            </div>
            <button onClick={dismissOnboarding} className="font-mono text-[10px] text-slate-600 hover:text-slate-300 transition-colors">
              dismiss ×
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {[
              { step: "01", label: "Pick a tool", desc: "Browse by audience or search", color: "#4FC3F7" },
              { step: "02", label: "Fill inputs", desc: "\"Try example →\" for instant prefill", color: "#A78BFA" },
              { step: "03", label: "Pay & run", desc: "Connect wallet · EIP-3009 · get result", color: "#34D399" },
            ].map(s => (
              <div key={s.step} className="flex items-center sm:items-start gap-3 sm:gap-2.5">
                <span className="font-mono text-2xl sm:text-lg font-bold shrink-0 leading-none w-8 text-center" style={{ color: s.color + "40" }}>{s.step}</span>
                <div>
                  <p className="font-mono text-xs font-semibold text-white leading-tight">{s.label}</p>
                  <p className="font-mono text-[10px] text-slate-600 leading-relaxed mt-0.5">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Content grid ── */}
      <div className="flex-1 px-6 py-5 overflow-y-auto">

        {/* Sort controls */}
        <div className="flex items-center gap-2 mb-4">
          <span className="font-mono text-[10px] text-slate-700">Sort:</span>
          {([
            { mode: "default",    label: "Default" },
            { mode: "popular",    label: "Popular" },
            { mode: "price-asc",  label: "Price ↑" },
            { mode: "price-desc", label: "Price ↓" },
          ] as { mode: SortMode; label: string }[]).map(s => (
            <button key={s.mode} onClick={() => setSortMode(s.mode)}
              className={`font-mono text-[10px] px-2 py-0.5 rounded border transition-colors ${
                sortMode === s.mode
                  ? "text-[#4FC3F7] border-[#4FC3F7]/30 bg-[#4FC3F7]/5"
                  : "text-slate-600 border-transparent hover:text-slate-300"
              }`}>
              {s.label}
            </button>
          ))}
          {!onboardingOpen && (
            <button onClick={() => setOnboardingOpen(true)}
              className="ml-auto font-mono text-[10px] text-slate-700 hover:text-slate-400 transition-colors border border-transparent hover:border-[#1A1A2E] px-2 py-0.5 rounded">
              ? How to use
            </button>
          )}
        </div>

        {/* Your recent results (cached, free to re-open) */}
        {recentTools.length > 0 && (
          <>
            <div className="flex items-center gap-3 mb-3">
              <p className="font-mono text-[10px] text-[#34D399] tracking-widest">// YOUR RECENT RESULTS</p>
              <div className="flex-1 h-px bg-[#34D399]/10" />
              <span className="font-mono text-[9px] text-slate-700">free to re-open</span>
            </div>
            <div className="flex flex-wrap gap-2 mb-5">
              {recentTools.map(tool => (
                <button key={tool.id} onClick={() => onSelect(tool)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#34D399]/20 bg-[#34D399]/5 hover:bg-[#34D399]/10 hover:border-[#34D399]/40 transition-all">
                  <span className="w-1 h-1 rounded-full bg-[#34D399]" />
                  <span className="font-mono text-[11px] text-slate-200">{tool.name}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Grouped sections ── */}
        {TOOL_GROUPS.map(group => {
          const rawGroupTools = group.ids.map(id => TOOLS.find(t => t.id === id)).filter((t): t is Tool => !!t);
          const groupTools = sortGroupTools(rawGroupTools);
          if (!groupTools.length) return null;
          const isExpanded = expanded.has(group.id);
          const visible = isExpanded ? groupTools : groupTools.slice(0, 4);
          const hiddenCount = groupTools.length - 4;

          return (
            <div key={group.id} className="mb-7">
              {/* Section header */}
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: group.color }} />
                  <p className="font-mono text-[10px] tracking-widest font-semibold" style={{ color: group.color }}>
                    {group.label.toUpperCase()}
                  </p>
                </div>
                <span className="font-mono text-[10px] text-slate-700">{group.desc}</span>
                <div className="flex-1 h-px" style={{ background: group.color + "15" }} />
                <span className="font-mono text-[9px] text-slate-700">{groupTools.length} tools</span>
              </div>

              {/* Tool cards */}
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
                {visible.map(tool => {
                  const hasExample = !!TOOL_EXAMPLES[tool.id];
                  return (
                  <button key={tool.id} onClick={() => onSelect(tool)}
                    className="text-left rounded-xl p-3.5 transition-all group border hover:bg-white/[0.02] flex flex-col"
                    style={{ borderColor: group.color + "20", background: group.color + "05" }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = group.color + "40")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = group.color + "20")}
                  >
                    <div className="flex items-center gap-1 mb-2">
                      {tool.agents.map(a => (
                        <span key={a} className="w-1 h-1 rounded-full" style={{ background: AGENT_COLORS[a] }} />
                      ))}
                      <span className="font-mono text-[9px] text-slate-700 ml-auto">{tool.price}</span>
                    </div>
                    <p className="font-mono text-xs font-semibold text-white mb-0.5 leading-snug transition-colors"
                      style={{ color: undefined }}
                      onMouseEnter={e => ((e.target as HTMLElement).style.color = group.color)}
                      onMouseLeave={e => ((e.target as HTMLElement).style.color = "white")}
                    >
                      {tool.name}
                    </p>
                    <p className="font-mono text-[10px] text-slate-600 leading-relaxed line-clamp-2 flex-1">{tool.desc}</p>
                    <div className="flex items-center justify-between mt-2.5 pt-2 border-t" style={{ borderColor: group.color + "15" }}>
                      {runsOf(tool.id) > 0
                        ? <span className="font-mono text-[9px] text-slate-700">{runsOf(tool.id)} runs</span>
                        : <span className="font-mono text-[9px]" style={{ color: hasExample ? group.color + "60" : "transparent" }}>example ready</span>
                      }
                      <span className="font-mono text-[10px] font-semibold transition-colors group-hover:opacity-100 opacity-60"
                        style={{ color: group.color }}>
                        Try Now →
                      </span>
                    </div>
                  </button>
                  );
                })}
              </div>

              {/* See all / Collapse */}
              {hiddenCount > 0 && (
                <button
                  onClick={() => toggleExpand(group.id)}
                  className="mt-2.5 font-mono text-[10px] transition-colors"
                  style={{ color: group.color + "80" }}
                  onMouseEnter={e => ((e.target as HTMLElement).style.color = group.color)}
                  onMouseLeave={e => ((e.target as HTMLElement).style.color = group.color + "80")}
                >
                  {isExpanded ? "↑ Show less" : `→ See all ${groupTools.length} ${group.label.toLowerCase()} tools`}
                </button>
              )}
            </div>
          );
        })}
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
  const [usage, setUsage]     = useState<Record<string, number>>({});
  const searchRef             = useRef<HTMLInputElement>(null);

  const RESULTS_KEY = "bluehub_results";

  function saveResult(toolId: string, r: ToolResult) {
    setCache(prev => {
      const next = new Map(prev).set(toolId, r);
      try { localStorage.setItem(RESULTS_KEY, JSON.stringify(Object.fromEntries(next))); } catch {}
      return next;
    });
  }

  // ── Load persisted results so paid runs survive refresh ───────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RESULTS_KEY);
      if (raw) setCache(new Map(Object.entries(JSON.parse(raw) as Record<string, ToolResult>)));
    } catch {}
  }, []);

  // ── Fetch real usage counts → dynamic Featured (top by paid runs) ─────────
  useEffect(() => {
    fetch("/api/usage").then(r => r.json()).then(setUsage).catch(() => {});
  }, []);

  const featuredIds = useMemo<Set<string>>(() => {
    // Most-run tools first, then pad with static FEATURED_IDS so we always show 4
    const ranked = Object.entries(usage)
      .filter(([, c]) => c > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);
    const combined = [...ranked, ...FEATURED_IDS].filter((id, i, arr) => arr.indexOf(id) === i);
    return new Set(combined.slice(0, 4));
  }, [usage]);

  // ── Keyboard shortcut: "/" focuses search, Esc closes tool ──────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && !selected && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape" && selected) setSelected(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected]);

  // ── On mount: deep-link ?tool=<id> (from /hub/[tool] pages) ───────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const qTool = new URLSearchParams(window.location.search).get("tool");
    if (qTool) {
      const t = TOOLS.find(x => x.id === qTool);
      if (t) {
        setSelected(t);
        window.history.replaceState(null, "", "/hub");
      }
    }
  }, []);

  // ── On mount: load shared result from URL hash ────────────────────────────
  // Two formats supported:
  //   #s=<10-hex-id>      → short id, fetched from /api/share/[id]   (new)
  //   #s=<base64 payload> → legacy inline payload (kept for old links)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.slice(1);
    if (!hash.startsWith("s=")) return;
    const value = hash.slice(2);

    const apply = (toolId: string, result: Record<string, unknown>, isMock: boolean, mockReason: "dev" | "service-down") => {
      const tool = TOOLS.find(t => t.id === toolId);
      if (!tool) return;
      setCache(prev => new Map(prev).set(toolId, { result, isMock, mockReason }));
      setSelected(tool);
      window.history.replaceState(null, "", window.location.pathname);
    };

    if (/^[a-f0-9]{6,32}$/.test(value)) {
      // Short id — fetch from server
      fetch(`/api/share/${value}`)
        .then(r => r.ok ? r.json() : null)
        .then((p: { toolId?: string; result?: Record<string, unknown>; isMock?: boolean; mockReason?: "dev" | "service-down" } | null) => {
          if (p?.toolId && p?.result) apply(p.toolId, p.result, !!p.isMock, p.mockReason ?? "dev");
        })
        .catch(() => {});
    } else {
      // Legacy inline base64 payload
      const shared = decodeShare(value);
      if (shared) apply(shared.toolId, shared.result, shared.isMock, shared.mockReason);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = TOOLS.filter(t => {
    const matchesSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.desc.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (cat === "all") return true;
    // Check if cat matches a group id
    const group = TOOL_GROUPS.find(g => g.id === cat);
    if (group) return group.ids.includes(t.id);
    // Fallback to old category field
    return t.cat === cat;
  });

  return (
    <>
      <Navbar />
      <div className="flex bg-[#050508] font-mono pt-14">

        {/* ── Sidebar ──────────────────────────────────── */}
        <aside className="hidden lg:flex flex-col w-72 shrink-0 sticky top-14 h-[calc(100vh-3.5rem)] border-r border-[#1A1A2E]">

          {/* Header */}
          <div className="px-5 pt-6 pb-4 border-b border-[#1A1A2E]">
            <p className="font-mono text-xs text-[#4FC3F7] tracking-widest">// TOOLS</p>
            <p className="font-mono text-[10px] text-slate-700 mt-1">{filtered.length} of {TOOLS.length} tools</p>
          </div>

          {/* Search */}
          <div className="px-4 pt-3 pb-2">
            <input
              ref={searchRef}
              className="w-full bg-[#0D0D1A] border border-[#1A1A2E] rounded-lg px-3 py-2 font-mono text-xs text-white placeholder-slate-700 focus:outline-none focus:border-[#4FC3F7]/30 transition-colors"
              placeholder="Search tools… ( / )"
              value={search}
              onChange={e => { setSearch(e.target.value); setCat("all"); }}
            />
          </div>

          {/* Group filter */}
          <div className="px-4 pb-4 flex flex-wrap gap-1">
            <button onClick={() => { setCat("all"); setSearch(""); }}
              className={`font-mono text-[10px] px-2 py-1 rounded transition-colors ${cat === "all" ? "bg-[#4FC3F7]/15 text-[#4FC3F7]" : "text-slate-600 hover:text-slate-300"}`}>
              All
            </button>
            {TOOL_GROUPS.map(g => (
              <button key={g.id} onClick={() => { setSearch(""); setCat(g.id as Category); }}
                className="font-mono text-[10px] px-2 py-1 rounded transition-colors"
                style={cat === g.id
                  ? { background: g.color + "20", color: g.color }
                  : { color: "#475569" }}
                onMouseEnter={e => { if (cat !== g.id) (e.currentTarget as HTMLElement).style.color = g.color; }}
                onMouseLeave={e => { if (cat !== g.id) (e.currentTarget as HTMLElement).style.color = "#475569"; }}
              >
                {g.label}
              </button>
            ))}
          </div>

          {/* Tool list */}
          <div className="flex-1 overflow-y-auto border-t border-[#1A1A2E]">
            {filtered.length === 0 && (
              <p className="font-mono text-[10px] text-slate-700 px-6 py-4">No tools found</p>
            )}
            {filtered.map(tool => {
              const isFeatured = featuredIds.has(tool.id);
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
            <p className="font-mono text-[10px] text-slate-700">multi-agent · Blue Hub v2 · Base</p>
          </div>
        </aside>

        {/* ── Main content ─────────────────────────────── */}
        <main className="flex-1 h-[calc(100vh-3.5rem)] overflow-hidden flex flex-col">

          {/* Mobile search + filter chips (browse state only) */}
          {!selected && (
            <div className="lg:hidden px-4 pt-3 pb-2 border-b border-[#1A1A2E] shrink-0 space-y-2">
              <input
                className="w-full bg-[#0D0D1A] border border-[#1A1A2E] rounded-lg px-3 py-2.5 font-mono text-sm text-white placeholder-slate-700 focus:outline-none focus:border-[#4FC3F7]/30 transition-colors"
                placeholder="Search tools…"
                value={search}
                onChange={e => { setSearch(e.target.value); setCat("all"); }}
              />
              <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                <button onClick={() => { setSearch(""); setCat("all"); }}
                  className={`font-mono text-[10px] px-3 py-1.5 rounded-full whitespace-nowrap border transition-colors shrink-0 ${cat === "all" && !search ? "bg-[#4FC3F7]/15 text-[#4FC3F7] border-[#4FC3F7]/30" : "text-slate-600 border-[#1A1A2E]"}`}>
                  All
                </button>
                {TOOL_GROUPS.map(g => (
                  <button key={g.id}
                    onClick={() => { setSearch(""); setCat(g.id as Category); }}
                    className={`font-mono text-[10px] px-3 py-1.5 rounded-full whitespace-nowrap border shrink-0 transition-colors`}
                    style={cat === g.id
                      ? { background: g.color + "15", color: g.color, borderColor: g.color + "40" }
                      : { color: g.color + "80", borderColor: "#1A1A2E" }}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {selected
            ? <ToolRunner
                tool={selected}
                onBack={() => setSelected(null)}
                cached={cache.get(selected.id) ?? null}
                onResult={(r) => saveResult(selected.id, r)}
              />
            : <div className="overflow-y-auto flex-1"><EmptyState onSelect={setSelected} featuredIds={featuredIds} usage={usage} recentIds={[...cache.keys()]} /></div>
          }
        </main>

      </div>
    </>
  );
}
