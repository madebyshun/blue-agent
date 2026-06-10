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
  { group: "SCORE", items: [
    { cmd: "blue score [handle]",       desc: "Builder Score for an X handle — activity, social, thesis (0-100)", example: "blue score @blockyagent" },
    { cmd: "blue agent-score [input]",  desc: "@handle / npm:@pkg / github.com/repo → Agent Score",               example: "blue agent-score npm:@blueagent/cli" },
    { cmd: "blue compare [a] [b]",      desc: "Compare two builders or agents side by side",                       example: "blue compare @vitalik @blueagent_" },
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
  { file: "bankr-tools.md",                 desc: "Bankr LLM capabilities and all 31 x402 tools." },
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
  { file: "telegram-bot-patterns.md",       desc: "Telegram bot patterns for onchain agents." },
  { file: "postgres-for-agents.md",         desc: "Postgres for agents — schema design, indexing, pgvector." },
  { file: "reputation-engine.md",           desc: "Reputation engine — Builder Score, Agent Score, onchain signals." },
];

const PRODUCTS = [
  { name: "Blue Hub",    color: "#4FC3F7", desc: "64 AI tools · 3-agent consensus · pay per use via x402",                link: "/hub",       label: "Open Hub →" },
  { name: "Blue Chat",  color: "#A78BFA", desc: "AI chat for Base builders · Haiku / Sonnet / Opus · credit system",      link: "/app/chat",  label: "Open Chat →" },
  { name: "Blue CLI",   color: "#34D399", desc: "@blueagent/cli · 30 commands · Terminal + TUI · idea/build/audit/ship", link: "/docs",      label: "View Docs →" },
  { name: "Blue Market",color: "#FB923C", desc: "Stake $BLUEAGENT · earn credits + USDC · daily Base brief",             link: "/market",    label: "Open Market →" },
  { name: "Blue Score", color: "#E879F9", desc: "Builder Score + Agent Score · 0–100 · onchain reputation",              link: "/score",     label: "Score a builder →" },
  { name: "Blue API",   color: "#fbbf24", desc: "18 x402 endpoints · USDC on Base · no subscription",                    link: "/api-docs",  label: "API Docs →" },
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
            30 CLI commands. 27 skill files. 18 API endpoints. 64 Hub tools.
            All grounded in verified Base knowledge — no hallucinated addresses, no generic advice.
          </p>

          <div className="inline-grid grid-cols-4 gap-px bg-[#1A1A2E] rounded-2xl overflow-hidden border border-[#1A1A2E] mb-12">
            {[
              { value: "30",  label: "Commands",  color: "#4FC3F7" },
              { value: "27",  label: "Skills",    color: "#34D399" },
              { value: "64",  label: "Hub Tools", color: "#A78BFA" },
              { value: "18",  label: "API Endpoints", color: "#fbbf24" },
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
            <h2 className="text-3xl font-bold">Six products. One agent.</h2>
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

        {/* ══ COMMANDS ══════════════════════════════════════════════════════════ */}
        <section className="max-w-5xl mx-auto px-6 py-20 border-t border-[#1A1A2E]">
          <div className="text-center mb-14">
            <SectionLabel>Commands</SectionLabel>
            <h2 className="text-3xl font-bold">30 CLI commands</h2>
            <p className="text-slate-500 mt-3 text-sm">Workflow · Setup · Score · Tasks — all grounded in verified Base knowledge</p>
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
            <h2 className="text-3xl font-bold">27 knowledge files</h2>
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
                <div className="font-mono text-[10px] text-slate-600 tracking-widest mb-3">AVAILABLE MCP TOOLS · 50+</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {["blue_idea", "blue_build", "blue_audit", "blue_ship", "blue_raise", "hub_market_fit", "hub_ecosystem", "hub_risk_gate", "hub_builder_score", "hub_investor_memo"].map((t) => (
                    <div key={t} className="flex items-center gap-2">
                      <span className="text-[#4FC3F7] text-xs">·</span>
                      <code className="font-mono text-[11px] text-white">{t}</code>
                    </div>
                  ))}
                </div>
                <p className="font-sans text-[11px] text-slate-600 mt-3">5 core commands + 45 hub tools (security · market · onchain clusters).</p>
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
              64 AI tools. 30 commands. 27 skill files. All grounded in verified Base knowledge.
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
              <Link href="/api-docs"
                className="px-8 py-3.5 rounded-xl font-mono text-sm border border-[#fbbf2430] text-[#fbbf24] hover:bg-[#fbbf2410] transition-all">
                API Reference →
              </Link>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
