"use client";

import { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

// ─── Data ─────────────────────────────────────────────────────────────────────

const COMMANDS_DOCS = [
  { group: "WORKFLOW", items: [
    { cmd: "blue idea [prompt]",  desc: "Fundable brief — problem, why now, MVP, risks, 24h plan",               example: 'blue idea "NFT marketplace for Base agents"' },
    { cmd: "blue build [prompt]", desc: "Architecture, stack, folder structure, integrations, test plan",          example: 'blue build "Base-native staking protocol"' },
    { cmd: "blue audit [prompt]", desc: "Security review — reentrancy, oracle, MEV, go/no-go verdict",            example: 'blue audit "my Solidity contract"' },
    { cmd: "blue ship [prompt]",  desc: "Deployment checklist, verification, release notes, monitoring",           example: 'blue ship "launch on Base mainnet"' },
    { cmd: "blue raise [prompt]", desc: "Pitch narrative — why this wins, traction, ask, Base investor map",       example: 'blue raise "Base DeFi protocol"' },
  ]},
  { group: "SETUP", items: [
    { cmd: "blue init",           desc: "Install skill files to ~/.blue-agent/skills/ for local grounding",        example: "blue init" },
    { cmd: "blue new <name>",     desc: "Scaffold a new Base project — base-agent | base-x402 | base-token",       example: "blue new my-token --template base-token" },
    { cmd: "blue doctor",         desc: "Verify node, skills, API key, config — full environment health check",    example: "blue doctor" },
    { cmd: "blue validate [dir]", desc: "Project health check — Node, package.json, tsconfig, env, src/, git",    example: "blue validate ./my-project" },
  ]},
  { group: "TASKS", items: [
    { cmd: "blue tasks",                     desc: "Browse open tasks. Filter: audit|content|art|data|dev",         example: "blue tasks --category audit" },
    { cmd: "blue post-task [handle]",        desc: "Post a task to the Work Hub (interactive)",                     example: "blue post-task @myhandle" },
    { cmd: "blue accept <taskId>",           desc: "Accept an open task from the Work Hub",                         example: "blue accept task_abc123" },
    { cmd: "blue submit <taskId> <h> <url>", desc: "Submit proof of work and earn XP + USDC",                      example: "blue submit task_abc123 @me https://github.com/..." },
  ]},
];

const SKILLS_DOCS = [
  { file: "base-security.md",               desc: "500+ security checks across 13 categories. Loaded for blue audit." },
  { file: "base-addresses.md",              desc: "Verified contract addresses on Base — USDC, WETH, Uniswap, Aave." },
  { file: "base-standards.md",              desc: "ERC standards, Base patterns, x402 protocol spec." },
  { file: "bankr-tools.md",                 desc: "Bankr LLM capabilities and the full x402 tool suite (60+)." },
  { file: "blue-agent-identity.md",         desc: "Blue Agent mission, product voice, do/don't rules." },
  { file: "design-system.md",               desc: "Visual language, colors, card patterns, spacing." },
  { file: "base-ecosystem.md",              desc: "Base ecosystem overview — key protocols, teams, infrastructure." },
  { file: "x402-patterns.md",               desc: "x402 payment patterns — pay-per-call APIs, pricing, flow." },
  { file: "agent-wallet-security.md",       desc: "Security patterns for agent-controlled wallets." },
  { file: "aerodrome-dex-guide.md",         desc: "Aerodrome DEX — pools, voting, bribes, LP strategy on Base." },
  { file: "aave-lending-patterns.md",       desc: "Aave v3 lending and borrowing patterns on Base." },
  { file: "uniswap-v4-hooks-guide.md",      desc: "Uniswap v4 hooks — lifecycle, pool manager, custom logic." },
  { file: "flashloan-patterns.md",          desc: "Flashloan fundamentals — callback structure, use cases." },
  { file: "flashloan-patterns-advanced.md", desc: "Advanced flashloan strategies and attack vectors." },
  { file: "staking-yield-farming.md",       desc: "Staking and yield farming — vaults, rewards, compounding." },
  { file: "solidity-security-patterns.md",  desc: "Solidity security — access control, overflow, reentrancy." },
  { file: "oracle-design-guide.md",         desc: "Oracle design — Chainlink, TWAP, price feed validation." },
  { file: "mev-protection-guide.md",        desc: "MEV protection — frontrun defense, slippage, commit-reveal." },
  { file: "gas-optimization-guide.md",      desc: "Gas optimization — storage packing, calldata, assembly." },
  { file: "base-account-integration.md",    desc: "Coinbase Smart Wallet — ERC-4337, passkeys, sponsored txs." },
  { file: "account-abstraction-deep-dive.md", desc: "ERC-4337 deep dive — UserOps, bundlers, paymasters, EntryPoint." },
  { file: "governance-dao-patterns.md",     desc: "DAO governance — Governor, timelock, voting, quorum." },
  { file: "multi-sig-wallet-security.md",   desc: "Multi-sig — Safe, threshold signing, timelock, key rotation." },
  { file: "frames-miniapps.md",             desc: "Farcaster Frames and Base mini app development." },
  { file: "postgres-for-agents.md",         desc: "Postgres for agents — schema design, indexing, pgvector." },
  { file: "reputation-engine.md",           desc: "Reputation engine — Builder Score, Agent Score, onchain signals." },
];

const X402_SUITE = [
  { id: "blue-research", price: "$1.00", color: "#60a5fa", desc: "Deep DD memo — grounds in live market data" },
  { id: "blue-compose",  price: "$0.10", color: "#34D399", desc: "Plan a runnable chain of Blue Hub tools" },
  { id: "blue-monitor",  price: "$0.20", color: "#f87171", desc: "Health + risk snapshot for a token/contract" },
  { id: "blue-deploy",   price: "$0.10", color: "#34D399", desc: "Base deploy mechanics — scripts, verify" },
  { id: "blue-analytics",price: "$0.25", color: "#60a5fa", desc: "Live token metrics + interpretation" },
  { id: "blue-simulate", price: "$0.15", color: "#A78BFA", desc: "Bull/base/bear scenario modeling" },
  { id: "blue-stream",   price: "$0.05", color: "#34D399", desc: "Live Base onchain activity feed" },
  { id: "blue-registry", price: "$0.05", color: "#fbbf24", desc: "Discover the full tool catalog" },
];

const PRODUCTS = [
  { name: "Blue Chat",  color: "#A78BFA", desc: "AI chat for Base builders · Sonnet / Opus / Venice · credit system",     link: "/app/chat",  label: "Open Chat →" },
  { name: "Blue Hub",   color: "#4FC3F7", desc: "51 AI tools · 3-agent consensus · pay per use via x402",                 link: "/hub",       label: "Open Hub →" },
  { name: "Blue CLI",   color: "#34D399", desc: "@blueagent/cli · idea / build / audit / ship · Terminal + TUI",          link: "/docs",      label: "View Docs →" },
  { name: "Blue API",   color: "#fbbf24", desc: "60+ x402 endpoints · USDC on Base · no subscription",                    link: "https://api.blueagent.dev/docs",  label: "API Docs →" },
];

// ─── Components ───────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 mb-6">
      <div className="h-px w-8 bg-[#4FC3F740]" />
      <span className="font-mono text-[11px] text-[#4FC3F7] tracking-[0.2em] uppercase">{children}</span>
      <div className="h-px w-8 bg-[#4FC3F740]" />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DocsPage() {
  const [openGroup, setOpenGroup] = useState<string | null>("WORKFLOW");

  return (
    <div className="min-h-screen bg-[#050508] text-white">
      <Navbar />

      {/* Ambient glow */}
      <div className="fixed inset-x-0 top-0 h-[600px] pointer-events-none overflow-hidden">
        <div style={{ background: "radial-gradient(ellipse 70% 40% at 50% -5%, #4FC3F714 0%, transparent 70%)" }} className="absolute inset-0" />
      </div>

      <div className="relative">

        {/* ══ HERO ══════════════════════════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-6 pt-32 pb-20 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#4FC3F730] bg-[#4FC3F708] mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
            <span className="font-mono text-[11px] text-[#4FC3F7] tracking-widest">BLUE AGENT · DOCUMENTATION</span>
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6 leading-tight">
            Everything you need<br />
            <span className="text-[#4FC3F7]">to build on Base</span>
          </h1>

          <p className="text-slate-400 text-lg max-w-2xl mx-auto leading-relaxed mb-12">
            22 CLI commands. 40 skill files. 51 Hub tools. 56 MCP tools.
            All grounded in verified Base knowledge — no hallucinated addresses, no generic advice.
          </p>

          <div className="inline-grid grid-cols-4 gap-px bg-[#1A1A2E] rounded-2xl overflow-hidden border border-[#1A1A2E] mb-12">
            {[
              { value: "22",  label: "Commands",  color: "#4FC3F7" },
              { value: "40",  label: "Skills",    color: "#34D399" },
              { value: "51",  label: "Hub Tools", color: "#A78BFA" },
              { value: "56",  label: "MCP Tools", color: "#fbbf24" },
            ].map((s) => (
              <div key={s.label} className="bg-[#0d0d12] px-6 py-5 text-center">
                <div className="font-mono text-xl font-bold mb-1" style={{ color: s.color }}>{s.value}</div>
                <div className="font-mono text-[10px] text-slate-600 tracking-widest">{s.label.toUpperCase()}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/app/chat"
              className="px-6 py-3 rounded-xl font-mono text-sm font-bold transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #4FC3F7, #29ABE2)", color: "#050508", boxShadow: "0 0 24px #4FC3F730" }}>
              Launch App →
            </Link>
            <Link href="/hub"
              className="px-6 py-3 rounded-xl font-mono text-sm border border-[#2a2a3e] text-slate-400 hover:text-white hover:border-[#4FC3F740] transition-all">
              Explore Hub
            </Link>
            <a href="https://github.com/madebyshun/blue-agent" target="_blank" rel="noopener noreferrer"
              className="px-6 py-3 rounded-xl font-mono text-sm border border-[#2a2a3e] text-slate-400 hover:text-white hover:border-[#4FC3F740] transition-all">
              GitHub →
            </a>
          </div>
        </section>

        {/* ══ QUICK START ═══════════════════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-6 py-20 border-t border-[#1A1A2E]">
          <div className="text-center mb-14">
            <SectionLabel>Quick Start</SectionLabel>
            <h2 className="text-3xl font-bold">Install and run in 60 seconds</h2>
            <p className="text-slate-500 mt-3 text-sm">Requires Node.js ≥ 18. No API key needed for core commands.</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6 mb-8">
            {/* CLI terminal */}
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1A1A2E] bg-[#0a0a0f]">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
                  </div>
                  <span className="font-mono text-xs text-slate-600 ml-1">@blueagent/cli</span>
                </div>
                <span className="font-mono text-[9px] text-[#4FC3F7] border border-[#4FC3F7]/30 px-1.5 py-0.5 rounded">CLI</span>
              </div>
              <div className="p-5 space-y-2 font-mono text-sm">
                <div><span className="text-slate-600"># 1. install</span></div>
                <div><span className="text-slate-600">$ </span><span className="text-white">npm install -g @blueagent/cli</span></div>
                <div className="pt-2"><span className="text-slate-600"># 2. install skill files</span></div>
                <div><span className="text-slate-600">$ </span><span className="text-white">blue init</span></div>
                <div className="pt-2"><span className="text-slate-600"># 3. run your first command</span></div>
                <div><span className="text-slate-600">$ </span><span className="text-[#4FC3F7]">blue idea &quot;DeFi protocol for Base&quot;</span></div>
                <div className="pt-2"><span className="text-slate-600"># verify setup</span></div>
                <div><span className="text-slate-600">$ </span><span className="text-white">blue doctor</span></div>
              </div>
            </div>

            {/* TUI + Browser */}
            <div className="space-y-4">
              <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1A1A2E] bg-[#0a0a0f]">
                  <span className="font-mono text-xs text-[#A78BFA]">Interactive TUI</span>
                  <span className="font-mono text-[9px] text-[#A78BFA]/60 border border-[#A78BFA]/20 px-1.5 py-0.5 rounded">blueagent</span>
                </div>
                <div className="p-4 font-mono text-sm space-y-1.5">
                  <div><span className="text-slate-600">$ </span><span className="text-[#A78BFA]">blueagent</span><span className="text-slate-600"> # arrow keys to navigate</span></div>
                </div>
              </div>
              <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1A1A2E] bg-[#0a0a0f]">
                  <span className="font-mono text-xs text-[#34D399]">Blue Terminal (browser)</span>
                  <span className="font-mono text-[9px] text-[#34D399]/60 border border-[#34D399]/20 px-1.5 py-0.5 rounded">no install</span>
                </div>
                <div className="p-4 font-mono text-sm">
                  <a href="/terminal" className="text-[#34D399] hover:underline">blueagent.dev/terminal</a>
                  <span className="text-slate-600"> — Tab autocomplete, full command history</span>
                </div>
              </div>
              <div className="rounded-2xl border border-[#4FC3F720] bg-[#4FC3F705] p-4">
                <div className="font-mono text-[10px] text-slate-600 mb-1">MCP server for Claude Code / Cursor</div>
                <pre className="font-mono text-xs text-[#4FC3F7] overflow-x-auto">{`"blue-agent": { "url": "https://blueagent.dev/api/mcp" }`}</pre>
              </div>
            </div>
          </div>
        </section>

        {/* ══ ECOSYSTEM ═════════════════════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-6 py-20 border-t border-[#1A1A2E]">
          <div className="text-center mb-14">
            <SectionLabel>Ecosystem</SectionLabel>
            <h2 className="text-3xl font-bold">Four products. One agent.</h2>
            <p className="text-slate-500 mt-3 text-sm">All built on Base. All powered by Bankr LLM and x402 micropayments.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PRODUCTS.map((p) => (
              <Link key={p.name} href={p.link}
                className="group rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-6 flex flex-col hover:border-[#2a2a3e] transition-all"
                style={{ boxShadow: `0 0 30px ${p.color}06` }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                  <span className="font-bold text-sm" style={{ color: p.color }}>{p.name}</span>
                </div>
                <p className="font-mono text-[11px] text-slate-500 leading-relaxed flex-1 mb-4">{p.desc}</p>
                <span className="font-mono text-[10px]" style={{ color: p.color }}>{p.label}</span>
              </Link>
            ))}
          </div>

          {/* Foundation */}
          <div className="mt-6 rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-6">
            <div className="font-mono text-[10px] text-slate-600 tracking-widest mb-5">FOUNDATION</div>
            <div className="grid sm:grid-cols-3 gap-6">
              {[
                { label: "Bankr LLM", desc: "llm.bankr.bot — AI backbone for all commands and chat", color: "#4FC3F7" },
                { label: "x402",      desc: "Pay per call in USDC — no subscription, no signup",      color: "#34D399" },
                { label: "Base",      desc: "All onchain actions on Base (chain ID 8453)",             color: "#2563EB" },
              ].map((f) => (
                <div key={f.label} className="flex items-start gap-3">
                  <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: f.color }} />
                  <div>
                    <div className="font-bold text-white text-sm mb-0.5">{f.label}</div>
                    <div className="font-mono text-[11px] text-slate-500">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══ BLUE CHAT ═════════════════════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-6 py-20 border-t border-[#1A1A2E]">
          <div className="text-center mb-14">
            <SectionLabel>Blue Chat</SectionLabel>
            <h2 className="text-3xl font-bold">Chat with an agent that knows Base</h2>
            <p className="text-slate-500 mt-3 text-sm max-w-2xl mx-auto">
              The fastest way in — no install. Pick a model, run slash commands, and call live Hub tools
              right inside the conversation. <Link href="/app/chat" className="text-[#4FC3F7] hover:underline">Open Blue Chat →</Link>
            </p>
          </div>

          {/* Models — one preset per use-case */}
          <div className="mb-4 font-mono text-[10px] text-slate-600 tracking-widest">MODELS · ONE PRESET PER USE-CASE</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
            {[
              { icon: "💬", label: "Chat",       model: "Sonnet",          note: "Balanced default · 200K ctx",  cr: "50 cr",  color: "#4FC3F7" },
              { icon: "⚡", label: "Fast",        model: "DeepSeek V4",     note: "Cheapest · 1M ctx",            cr: "10 cr",  color: "#34D399" },
              { icon: "🔍", label: "Web Search",  model: "Grok 4",          note: "Live multi-source web",        cr: "60 cr",  color: "#E879F9" },
              { icon: "🔬", label: "Deep Think",  model: "Opus",            note: "Heavy reasoning + web",        cr: "200 cr", color: "#A78BFA" },
              { icon: "✍️", label: "Fable 5",     model: "Claude Fable",    note: "Creative · 1M ctx",            cr: "120 cr", color: "#F472B6" },
              { icon: "🔒", label: "Private",     model: "Gemma 27B",       note: "E2EE · no logs",               cr: "30 cr",  color: "#6EE7B7" },
            ].map((m) => (
              <div key={m.label} className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{m.icon}</span>
                    <span className="font-bold text-sm" style={{ color: m.color }}>{m.label}</span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-600">{m.cr}/msg</span>
                </div>
                <div className="font-mono text-[11px] text-slate-400">{m.model}</div>
                <div className="font-mono text-[10px] text-slate-600 mt-0.5">{m.note}</div>
              </div>
            ))}
          </div>

          {/* In-chat capabilities */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { t: "Slash commands", d: "/idea /build /audit /ship /raise · /pick /scan /wallet — same power as the CLI, inline." },
              { t: "Hub tools",      d: "Live token prices, whale flow, risk gate, wallet PnL — 51 tools the model calls for you." },
              { t: "Personas",       d: "Swap the agent's expert role (Trader · Cipher · Oracle · Custom) without changing the model." },
              { t: "Web search",     d: "Toggle on to let the model pull live web data and cite sources (auto-on for Web Search / Deep Think)." },
            ].map((c) => (
              <div key={c.t} className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5">
                <div className="font-bold text-white text-sm mb-1.5">{c.t}</div>
                <div className="font-mono text-[11px] text-slate-500 leading-relaxed">{c.d}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ══ CREDITS ═══════════════════════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-6 py-20 border-t border-[#1A1A2E]">
          <div className="text-center mb-14">
            <SectionLabel>Credits</SectionLabel>
            <h2 className="text-3xl font-bold">Credits &amp; tiers</h2>
            <p className="text-slate-500 mt-3 text-sm max-w-2xl mx-auto">
              Every message spends credits. No wallet needed to start — and your tier is set by your $BLUE,
              where <span className="text-slate-300">holding or staking both count</span>.
            </p>
          </div>

          <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden">
            {[
              { tier: "Guest",   need: "No wallet",  perk: "100 cr/day · ~10 messages", color: "#64748b" },
              { tier: "Starter", need: "500K BLUE",  perk: "500 cr/day",                color: "#4FC3F7" },
              { tier: "Pro",     need: "2M BLUE",    perk: "2,000 cr/day",              color: "#A78BFA" },
              { tier: "Max",     need: "10M BLUE",   perk: "∞ credits · 40% off",       color: "#F59E0B" },
            ].map((r, i) => (
              <div key={r.tier} className={`flex items-center justify-between px-5 py-3.5 ${i > 0 ? "border-t border-[#1A1A2E]" : ""}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} />
                  <span className="font-bold text-sm shrink-0" style={{ color: r.color }}>{r.tier}</span>
                  <span className="font-mono text-[11px] text-slate-600 truncate">{r.need}</span>
                </div>
                <span className="font-mono text-[11px] text-slate-300 shrink-0">{r.perk}</span>
              </div>
            ))}
          </div>

          <p className="text-center font-mono text-[11px] text-slate-500 mt-5 max-w-2xl mx-auto leading-relaxed">
            <span className="text-slate-300">Staking</span> is the better path — it counts toward your tier and accrues
            extra credits plus a share of x402 revenue (USDC) over time. Holding only sets your tier.{" "}
            <Link href="/app/dashboard?tab=stake" className="text-[#A78BFA] hover:underline">Stake $BLUE →</Link>
          </p>
        </section>

        {/* ══ x402 TOOLS ════════════════════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-6 py-20 border-t border-[#1A1A2E]">
          <div className="text-center mb-14">
            <SectionLabel>x402 Tools</SectionLabel>
            <h2 className="text-3xl font-bold">The Blue command suite</h2>
            <p className="text-slate-500 mt-3 text-sm max-w-xl mx-auto">
              Pay-per-call in USDC on Base — no keys, no subscription. Callable via the API,
              the Hub, or any MCP client. The 5 core commands plus an extended <code className="font-mono text-[#4FC3F7]">blue-*</code> suite.
            </p>
          </div>

          {/* 5 core */}
          <div className="grid sm:grid-cols-5 gap-3 mb-4">
            {[
              { cmd: "idea",  price: "$0.05", color: "#4FC3F7" },
              { cmd: "build", price: "$0.50", color: "#A78BFA" },
              { cmd: "audit", price: "$1.00", color: "#f87171" },
              { cmd: "ship",  price: "$0.10", color: "#34D399" },
              { cmd: "raise", price: "$0.20", color: "#fbbf24" },
            ].map((c) => (
              <div key={c.cmd} className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-4 text-center" style={{ boxShadow: `0 0 20px ${c.color}08` }}>
                <div className="font-mono text-sm font-bold mb-1" style={{ color: c.color }}>blue {c.cmd}</div>
                <div className="font-mono text-[10px] text-slate-500 border border-[#1A1A2E] rounded-lg px-2 py-1">{c.price}</div>
              </div>
            ))}
          </div>

          {/* extended blue-* suite */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {X402_SUITE.map((t) => (
              <div key={t.id} className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-4" style={{ boxShadow: `0 0 20px ${t.color}06` }}>
                <div className="flex items-center justify-between mb-2">
                  <code className="font-mono text-[12px] font-bold" style={{ color: t.color }}>{t.id}</code>
                  <span className="font-mono text-[9px] text-slate-500 border border-[#1A1A2E] rounded px-1.5 py-0.5">{t.price}</span>
                </div>
                <p className="font-mono text-[10px] text-slate-500 leading-relaxed">{t.desc}</p>
              </div>
            ))}
          </div>

          <p className="text-center font-mono text-[11px] text-slate-600 mt-6">
            51 tools total. Always-current catalog →{" "}
            <code className="text-[#4FC3F7]">blue-registry</code> or{" "}
            <a href="https://api.blueagent.dev/docs" className="text-[#fbbf24] hover:underline">api.blueagent.dev/docs</a>
          </p>
        </section>

        {/* ══ COMMANDS ══════════════════════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-6 py-20 border-t border-[#1A1A2E]">
          <div className="text-center mb-14">
            <SectionLabel>Commands</SectionLabel>
            <h2 className="text-3xl font-bold">22 CLI commands</h2>
            <p className="text-slate-500 mt-3 text-sm">Workflow · Setup · Tasks — all grounded in verified Base knowledge</p>
          </div>

          {/* 5 core commands hero */}
          <div className="grid sm:grid-cols-5 gap-3 mb-10">
            {[
              { cmd: "idea",  price: "$0.05", color: "#4FC3F7", desc: "Fundable brief" },
              { cmd: "build", price: "$0.50", color: "#A78BFA", desc: "Full architecture" },
              { cmd: "audit", price: "$1.00", color: "#f87171", desc: "Security review" },
              { cmd: "ship",  price: "$0.10", color: "#34D399", desc: "Deploy checklist" },
              { cmd: "raise", price: "$0.20", color: "#fbbf24", desc: "Pitch narrative" },
            ].map((c) => (
              <div key={c.cmd} className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-4 text-center"
                style={{ boxShadow: `0 0 20px ${c.color}08` }}>
                <div className="font-mono text-sm font-bold mb-1" style={{ color: c.color }}>blue {c.cmd}</div>
                <div className="font-mono text-[10px] text-slate-600 mb-2">{c.desc}</div>
                <div className="font-mono text-[10px] text-slate-500 border border-[#1A1A2E] rounded-lg px-2 py-1">{c.price}</div>
              </div>
            ))}
          </div>

          {/* Command groups as accordion */}
          <div className="space-y-3">
            {COMMANDS_DOCS.map((group) => (
              <div key={group.group} className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden">
                <button
                  onClick={() => setOpenGroup(openGroup === group.group ? null : group.group)}
                  className="w-full flex items-center justify-between px-6 py-4 hover:bg-[#0a0a0f] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-[#4FC3F7] tracking-widest">{group.group}</span>
                    <span className="font-mono text-[10px] text-slate-700">{group.items.length} commands</span>
                  </div>
                  <svg className={`w-3.5 h-3.5 text-slate-600 transition-transform ${openGroup === group.group ? "rotate-180" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openGroup === group.group && (
                  <div className="border-t border-[#1A1A2E] divide-y divide-[#1A1A2E]">
                    {group.items.map((item) => (
                      <div key={item.cmd} className="px-6 py-4">
                        <code className="font-mono text-sm font-semibold text-white block mb-1">{item.cmd}</code>
                        <p className="font-mono text-[11px] text-slate-500 mb-2 leading-relaxed">{item.desc}</p>
                        <div className="flex items-start gap-2">
                          <span className="font-mono text-[10px] text-slate-700 shrink-0">eg:</span>
                          <code className="font-mono text-[10px] text-[#4FC3F7]">{item.example}</code>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ══ SKILLS ════════════════════════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-6 py-20 border-t border-[#1A1A2E]">
          <div className="text-center mb-14">
            <SectionLabel>Skills</SectionLabel>
            <h2 className="text-3xl font-bold">40 knowledge files</h2>
            <p className="text-slate-500 mt-3 text-sm max-w-xl mx-auto">
              Markdown files that ground the LLM in verified Base knowledge.
              Run <code className="font-mono text-[#4FC3F7]">blue init</code> to install them to{" "}
              <code className="font-mono text-white">~/.blue-agent/skills/</code>.
            </p>
          </div>

          <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden mb-6">
            <div className="px-5 py-3.5 border-b border-[#1A1A2E] bg-[#0a0a0f] flex items-center justify-between">
              <span className="font-mono text-[10px] text-slate-600 tracking-widest">SKILL FILES</span>
              <span className="font-mono text-[10px] text-[#4FC3F7]">$ blue init</span>
            </div>
            <div className="divide-y divide-[#1A1A2E]">
              {SKILLS_DOCS.map((s) => (
                <div key={s.file} className="flex items-baseline gap-4 px-5 py-3 hover:bg-[#0a0a0f] transition-colors">
                  <code className="font-mono text-[11px] text-[#4FC3F7] shrink-0 w-64">{s.file}</code>
                  <span className="font-mono text-[11px] text-slate-500 leading-relaxed">{s.desc}</span>
                </div>
              ))}
            </div>
          </div>

          <Link href="/skills"
            className="inline-flex items-center gap-2 font-mono text-sm text-[#4FC3F7] hover:underline">
            View all skills + Aeon skills →
          </Link>
        </section>

        {/* ══ MCP SETUP ════════════════════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-6 py-20 border-t border-[#1A1A2E]">
          <div className="text-center mb-14">
            <SectionLabel>MCP Setup</SectionLabel>
            <h2 className="text-3xl font-bold">Claude Code · Cursor · Claude Desktop</h2>
            <p className="text-slate-500 mt-3 text-sm">Load Blue Agent tools directly into your IDE via MCP.</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[#1A1A2E] bg-[#0a0a0f]">
                  <span className="font-mono text-[10px] text-slate-600 tracking-widest">NO INSTALL — REMOTE URL</span>
                </div>
                <div className="p-5 font-mono text-sm">
                  <span className="text-white">https://blueagent.dev/api/mcp</span>
                  <p className="font-sans text-xs text-slate-500 mt-2 leading-relaxed">Add in 30s. Nothing to install — point your client at the URL. Optional: <code className="text-slate-400">npm i -g @blueagent/skill</code> for the local package.</p>
                </div>
              </div>
              <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5">
                <div className="font-mono text-[10px] text-slate-600 tracking-widest mb-3">AVAILABLE MCP TOOLS · 56</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {["blue_idea", "blue_build", "blue_audit", "blue_research", "blue_monitor", "blue_compose", "blue_registry", "blue_stream", "hub_ecosystem", "hub_token_pick", "hub_honeypot", "hub_market_fit"].map((t) => (
                    <div key={t} className="flex items-center gap-2">
                      <span className="text-[#4FC3F7] text-xs">·</span>
                      <code className="font-mono text-[11px] text-white">{t}</code>
                    </div>
                  ))}
                </div>
                <p className="font-sans text-[11px] text-slate-600 mt-3">Core commands + the blue-* suite + 50+ hub tools (security · market · onchain · agent clusters).</p>
              </div>
            </div>

            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#1A1A2E] bg-[#0a0a0f]">
                <span className="font-mono text-[10px] text-slate-600 tracking-widest">CLAUDE CODE / CURSOR / DESKTOP CONFIG</span>
              </div>
              <pre className="font-mono text-sm text-[#4FC3F7] p-5 overflow-x-auto leading-relaxed">{`{
  "mcpServers": {
    "blue-agent": {
      "url": "https://blueagent.dev/api/mcp"
    }
  }
}`}</pre>
            </div>
          </div>
        </section>

        {/* ══ FOR DEVELOPERS ═══════════════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-6 py-20 border-t border-[#1A1A2E]">
          <div className="text-center mb-14">
            <SectionLabel>For Developers</SectionLabel>
            <h2 className="text-3xl font-bold">Fork, extend, contribute</h2>
            <p className="text-slate-500 mt-3 text-sm">All packages are open source. MIT license.</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            {/* Run locally */}
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#1A1A2E] bg-[#0a0a0f]">
                <span className="font-mono text-[10px] text-slate-600 tracking-widest">RUN LOCALLY</span>
              </div>
              <div className="p-5 font-mono text-sm space-y-1.5">
                <div><span className="text-slate-600">$ </span><span className="text-white">git clone https://github.com/madebyshun/blue-agent</span></div>
                <div><span className="text-slate-600">$ </span><span className="text-white">npm install</span></div>
                <div><span className="text-slate-600">$ </span><span className="text-[#4FC3F7]">npm run dev</span></div>
              </div>
            </div>

            {/* Add skill file */}
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-6">
              <div className="font-mono text-[10px] text-slate-600 tracking-widest mb-3">ADD A SKILL FILE</div>
              <p className="font-mono text-[11px] text-slate-500 leading-relaxed mb-3">
                Drop a <code className="text-white">.md</code> file in <code className="text-white">skills/</code> and register it in{" "}
                <code className="text-[#4FC3F7]">packages/core/src/registry.ts</code>.
              </p>
              <p className="font-mono text-[11px] text-slate-600">
                Load order: <code className="text-white">BLUE_AGENT_SKILLS_DIR</code> → <code className="text-white">~/.blue-agent/skills/</code> → monorepo <code className="text-white">skills/</code>
              </p>
            </div>
          </div>

          {/* Packages */}
          <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-6">
            <div className="font-mono text-[10px] text-slate-600 tracking-widest mb-5">PACKAGES</div>
            <div className="space-y-5">
              {[
                {
                  label: "SURFACE — what users install",
                  color: "#4FC3F7",
                  items: [
                    { pkg: "@blueagent/cli",  desc: "TUI + CLI · blueagent (interactive) · blue (direct commands)" },
                    { pkg: "@blueagent/x402", desc: "x402 client SDK · auto payment · createX402Client()" },
                  ],
                },
                {
                  label: "CORE — runtime & data",
                  color: "#A78BFA",
                  items: [
                    { pkg: "@blueagent/core",       desc: "Runtime · skill loading · Bankr LLM · schemas" },
                    { pkg: "@blueagent/reputation",  desc: "Builder Score · Agent Score · Work Hub reputation" },
                  ],
                },
                {
                  label: "INTEGRATIONS",
                  color: "#34D399",
                  items: [
                    { pkg: "@blueagent/skill",      desc: "MCP server · Claude Code · Cursor · Claude Desktop" },
                    { pkg: "@blueagent/agentkit",   desc: "Coinbase AgentKit plugin · 32 x402 actions" },
                    { pkg: "@blueagent/sdk",         desc: "Unified SDK · ba.builder.idea() etc." },
                  ],
                },
              ].map((group) => (
                <div key={group.label}>
                  <div className="font-mono text-[10px] tracking-widest mb-2" style={{ color: group.color }}>{group.label}</div>
                  <div className="space-y-1.5">
                    {group.items.map((p) => (
                      <div key={p.pkg} className="flex items-baseline gap-4">
                        <code className="font-mono text-sm shrink-0 min-w-[200px]" style={{ color: group.color }}>{p.pkg}</code>
                        <span className="font-mono text-[11px] text-slate-500">{p.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══ CTA ══════════════════════════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-6 py-20 border-t border-[#1A1A2E]">
          <div className="rounded-2xl border border-[#4FC3F720] bg-[#4FC3F705] p-12 text-center"
            style={{ boxShadow: "0 0 60px #4FC3F708" }}>
            <h2 className="text-3xl font-bold mb-4">Start building on Base</h2>
            <p className="text-slate-500 mb-8 max-w-md mx-auto text-sm leading-relaxed">
              51 AI tools. 22 commands. 40 skill files. All grounded in verified Base knowledge.
            </p>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <Link href="/app/chat"
                className="px-8 py-3.5 rounded-xl font-mono text-sm font-bold transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #4FC3F7, #29ABE2)", color: "#050508", boxShadow: "0 0 24px #4FC3F730" }}>
                Launch App →
              </Link>
              <Link href="/hub"
                className="px-8 py-3.5 rounded-xl font-mono text-sm border border-[#2a2a3e] text-slate-400 hover:text-white hover:border-[#4FC3F740] transition-all">
                Explore Hub
              </Link>
              <a href="https://api.blueagent.dev/docs"
                className="px-8 py-3.5 rounded-xl font-mono text-sm border border-[#fbbf2430] text-[#fbbf24] hover:bg-[#fbbf2410] transition-all">
                API Reference →
              </a>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
