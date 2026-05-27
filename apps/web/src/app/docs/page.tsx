"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";

const COMMANDS_DOCS = [
  { group: "WORKFLOW", items: [
    { cmd: "blue idea [prompt]",             desc: "Fundable brief — problem, why now, MVP, risks, 24h plan",                  example: 'blue idea "NFT marketplace for Base agents"' },
    { cmd: "blue build [prompt]",            desc: "Architecture, stack, folder structure, integrations, test plan",            example: 'blue build "Base-native staking protocol"' },
    { cmd: "blue audit [prompt]",            desc: "Security review — reentrancy, oracle, MEV, go/no-go verdict",               example: 'blue audit "my Solidity contract"' },
    { cmd: "blue ship [prompt]",             desc: "Deployment checklist, verification, release notes, monitoring",             example: 'blue ship "launch on Base mainnet"' },
    { cmd: "blue raise [prompt]",            desc: "Pitch narrative — why this wins, traction, ask, Base investor map",         example: 'blue raise "Base DeFi protocol"' },
  ]},
  { group: "SETUP", items: [
    { cmd: "blue init",                      desc: "Install 34 skill files to ~/.blue-agent/skills/ for local grounding",        example: "blue init" },
    { cmd: "blue new <name>",                desc: "Scaffold a new Base project — base-agent | base-x402 | base-token",         example: "blue new my-token --template base-token" },
    { cmd: "blue doctor",                    desc: "Verify node, skills, API key, config — full environment health check",      example: "blue doctor" },
    { cmd: "blue validate [dir]",            desc: "Project health check — Node, package.json, tsconfig, env, src/, git",       example: "blue validate ./my-project" },
  ]},
  { group: "CHAT", items: [
    { cmd: "blue chat [prompt]",             desc: "Streaming multi-turn REPL — Haiku by default, --sonnet or --opus flags",    example: 'blue chat "how do I use x402 on Base?"' },
  ]},
  { group: "SCORE", items: [
    { cmd: "blue score [handle]",            desc: "Builder Score for an X handle — activity, social, thesis (0-100)",          example: "blue score @blockyagent" },
    { cmd: "blue agent-score [input]",       desc: "@handle / npm:@pkg / github.com/repo / https://url → Agent Score",          example: "blue agent-score npm:@blueagent/cli" },
    { cmd: "blue compare [a] [b]",           desc: "Compare two builders or agents side by side",                               example: "blue compare @vitalik @blueagent_" },
  ]},
  { group: "DISCOVERY", items: [
    { cmd: "blue search [query]",            desc: "Search builders, agents, projects, and tokens on Base",                     example: 'blue search "AI agent"' },
    { cmd: "blue trending [filter]",         desc: "Trending on Base — builders / agents / tokens (optional filter)",           example: "blue trending agents" },
    { cmd: "blue watch [target]",            desc: "Watch a wallet, handle, or token for activity",                             example: "blue watch 0x1234..." },
    { cmd: "blue alert add",                 desc: "Configure price or activity alerts",                                        example: "blue alert add" },
    { cmd: "blue history [input]",           desc: "Activity history for a builder or agent — @handle / npm / github",          example: "blue history @blueagent_" },
  ]},
  { group: "LAUNCH / MARKET", items: [
    { cmd: "blue launch [mode]",             desc: "Launch wizard — token on Base (token) or agent on Bankr (agent)",           example: "blue launch token" },
    { cmd: "blue market [subcommand]",       desc: "Browse or publish agents, skills, prompts on Bankr marketplace",            example: "blue market publish" },
  ]},
  { group: "TASKS", items: [
    { cmd: "blue tasks",                     desc: "Browse open tasks. Filter: audit|content|art|data|dev",                     example: "blue tasks --category audit" },
    { cmd: "blue post-task [handle]",        desc: "Post a task to the Work Hub (interactive)",                                 example: "blue post-task @myhandle" },
    { cmd: "blue accept <taskId>",           desc: "Accept an open task from the Work Hub",                                     example: "blue accept task_abc123" },
    { cmd: "blue submit <taskId> <h> <url>", desc: "Submit proof of work and earn XP + USDC",                                   example: "blue submit task_abc123 @me https://github.com/..." },
  ]},
  { group: "MICROTASKS", items: [
    { cmd: "blue micro post [desc]",         desc: "Post a $0.10–$20 microtask — reward, slots, platform, proof type",          example: 'blue micro post "retweet launch" --reward 0.5 --slots 10' },
    { cmd: "blue micro list [id]",           desc: "Browse open microtasks — filter by platform, proof, status, sort",          example: "blue micro list --platform x --sort reward" },
    { cmd: "blue micro accept <id>",         desc: "Claim a slot on an open microtask",                                         example: "blue micro accept task_abc123" },
    { cmd: "blue micro submit <id> <proof>", desc: "Submit proof URL for a claimed slot",                                       example: "blue micro submit task_abc123 https://x.com/..." },
    { cmd: "blue micro approve <id>",        desc: "Approve submission and release USDC to doer",                               example: "blue micro approve task_abc123" },
    { cmd: "blue micro profile [handle]",    desc: "View earnings, reputation, completed tasks for a doer",                     example: "blue micro profile @myhandle" },
  ]},
  { group: "TERMINAL UI", items: [
    { cmd: "blue tui",                       desc: "Launch the full @blueagent/cli TUI — arrow keys to navigate all tools",     example: "blue tui" },
  ]},
];

const SKILLS_DOCS = [
  { file: "base-security.md",                  desc: "500+ security checks across 13 categories. Loaded for blue audit.",        install: "auto via blue init" },
  { file: "base-addresses.md",                 desc: "Verified contract addresses on Base — USDC, WETH, Uniswap, Aave.",        install: "auto via blue init" },
  { file: "base-standards.md",                 desc: "ERC standards, Base patterns, x402 protocol spec.",                       install: "auto via blue init" },
  { file: "bankr-tools.md",                    desc: "Bankr LLM capabilities and all 31 x402 tools.",                           install: "auto via blue init" },
  { file: "blue-agent-identity.md",            desc: "Blue Agent mission, product voice, do/don't rules.",                      install: "auto via blue init" },
  { file: "design-system.md",                  desc: "Visual language, colors, card patterns, spacing.",                        install: "auto via blue init" },
  { file: "base-ecosystem.md",                 desc: "Base ecosystem overview — key protocols, teams, infrastructure.",         install: "auto via blue init" },
  { file: "x402-patterns.md",                  desc: "x402 payment patterns — pay-per-call APIs, pricing, flow.",              install: "auto via blue init" },
  { file: "agent-wallet-security.md",          desc: "Security patterns for agent-controlled wallets.",                         install: "auto via blue init" },
  { file: "aerodrome-dex-guide.md",            desc: "Aerodrome DEX — pools, voting, bribes, LP strategy on Base.",            install: "auto via blue init" },
  { file: "aave-lending-patterns.md",          desc: "Aave v3 lending and borrowing patterns on Base.",                         install: "auto via blue init" },
  { file: "uniswap-v4-hooks-guide.md",         desc: "Uniswap v4 hooks — lifecycle, pool manager, custom logic.",              install: "auto via blue init" },
  { file: "flashloan-patterns.md",             desc: "Flashloan fundamentals — callback structure, use cases.",                 install: "auto via blue init" },
  { file: "flashloan-patterns-advanced.md",    desc: "Advanced flashloan strategies and attack vectors.",                       install: "auto via blue init" },
  { file: "staking-yield-farming.md",          desc: "Staking and yield farming — vaults, rewards, compounding.",              install: "auto via blue init" },
  { file: "solidity-security-patterns.md",     desc: "Solidity security — access control, overflow, reentrancy.",              install: "auto via blue init" },
  { file: "oracle-design-guide.md",            desc: "Oracle design — Chainlink, TWAP, price feed validation.",                install: "auto via blue init" },
  { file: "mev-protection-guide.md",           desc: "MEV protection — frontrun defense, slippage, commit-reveal.",            install: "auto via blue init" },
  { file: "mev-protection-advanced.md",        desc: "Advanced MEV — Flashbots, Protect RPC, batch auction design.",           install: "auto via blue init" },
  { file: "cross-chain-bridge-security.md",    desc: "Bridge security — validation, finality, replay attacks.",                install: "auto via blue init" },
  { file: "base-account-integration.md",       desc: "Coinbase Smart Wallet — ERC-4337, passkeys, sponsored txs.",            install: "auto via blue init" },
  { file: "account-abstraction-deep-dive.md",  desc: "ERC-4337 deep dive — UserOps, bundlers, paymasters, EntryPoint.",       install: "auto via blue init" },
  { file: "multi-sig-wallet-security.md",      desc: "Multi-sig — Safe, threshold signing, timelock, key rotation.",          install: "auto via blue init" },
  { file: "veil-privacy-transactions.md",      desc: "Privacy transactions — stealth addresses, private transfers.",           install: "auto via blue init" },
  { file: "governance-dao-patterns.md",        desc: "DAO governance — Governor, timelock, voting, quorum.",                   install: "auto via blue init" },
  { file: "gas-optimization-guide.md",         desc: "Gas optimization — storage packing, calldata, assembly.",               install: "auto via blue init" },
  { file: "frames-miniapps.md",               desc: "Farcaster Frames and Base mini app development.",                       install: "auto via blue init" },
  { file: "telegram-bot-patterns.md",          desc: "Telegram bot patterns for onchain agents.",                              install: "auto via blue init" },
  { file: "gig-marketplace-guide.md",          desc: "Gig marketplace — escrow, reputation, task lifecycle, USDC.",           install: "auto via blue init" },
  { file: "postgres-for-agents.md",            desc: "Postgres for agents — schema design, indexing, pgvector.",              install: "auto via blue init" },
  { file: "x402-escrow-patterns.md",           desc: "x402 escrow — conditional release, dispute resolution, USDC.",          install: "auto via blue init" },
  { file: "reputation-engine.md",              desc: "Reputation engine — Builder Score, Agent Score, onchain signals.",       install: "auto via blue init" },
  { file: "wallet-guardrails.md",              desc: "Wallet guardrails — spend limits, allowlists, simulation.",              install: "auto via blue init" },
  { file: "agent-transaction-verification.md", desc: "TX verification — pre-flight checks, simulation, intent validation.",   install: "auto via blue init" },
];

const NAV_ITEMS = [
  { id: "ecosystem",  label: "Ecosystem",       num: "00" },
  { id: "quickstart", label: "Quick Start",     num: "01" },
  { id: "bluehub",    label: "BlueHub",         num: "02" },
  { id: "bluechat",   label: "BlueChat",        num: "03" },
  { id: "bluemarket", label: "BlueMarket",      num: "04" },
  { id: "bluescore",  label: "BlueScore",       num: "05" },
  { id: "commands",   label: "Commands",        num: "06" },
  { id: "microtasks", label: "Microtasks",      num: "07" },
  { id: "skills",     label: "Skills",          num: "08" },
  { id: "mcp",        label: "MCP Setup",       num: "09" },
  { id: "api",        label: "API Reference",   num: "10" },
  { id: "devs",       label: "For Developers",  num: "11" },
];

function SectionHeader({ num, title, subtitle }: { num: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-8">
      <span className="font-mono text-xs text-slate-700 tracking-widest">{num}</span>
      <h2 className="font-mono text-2xl sm:text-3xl font-bold text-white mt-1 mb-1">{title}</h2>
      {subtitle && <p className="font-mono text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
}

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("quickstart");

  function scrollTo(id: string) {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <Navbar />
      <div className="flex bg-[#050508] font-mono pt-16">

          {/* ── Sticky sidebar ───────────────────── */}
          <aside className="hidden lg:flex flex-col w-72 shrink-0 sticky top-16 h-[calc(100vh-4rem)] border-r border-[#1A1A2E]">
            {/* Header */}
            <div className="px-5 pt-6 pb-4 border-b border-[#1A1A2E]">
              <p className="font-mono text-xs text-[#4FC3F7] tracking-widest">// DOCUMENTATION</p>
            </div>
            {/* Nav */}
            <nav className="flex-1 overflow-y-auto py-2">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => scrollTo(item.id)}
                  className={`w-full flex items-center gap-3 text-left px-5 py-3 transition-all border-l-2 font-mono text-sm ${
                    activeSection === item.id
                      ? "border-[#4FC3F7] bg-[#4FC3F7]/5 text-white"
                      : "border-transparent text-slate-500 hover:text-white hover:bg-[#0D0D1A]"
                  }`}
                >
                  <span className="font-mono text-[10px] text-slate-700 w-5 shrink-0">{item.num}</span>
                  {item.label}
                </button>
              ))}
            </nav>
            {/* Footer */}
            <div className="px-5 py-4 border-t border-[#1A1A2E]">
              <a href="https://github.com/madebyshun/blue-agent" target="_blank" rel="noopener noreferrer"
                className="font-mono text-xs text-slate-700 hover:text-white transition-colors block mb-1">github →</a>
              <a href="https://x.com/blueagent_" target="_blank" rel="noopener noreferrer"
                className="font-mono text-xs text-slate-700 hover:text-white transition-colors block mb-1">@blueagent_ →</a>
              <a href="https://t.me/blueagent_hub" target="_blank" rel="noopener noreferrer"
                className="font-mono text-xs text-slate-700 hover:text-white transition-colors block">telegram →</a>
            </div>
          </aside>

          {/* ── Main content ─────────────────────── */}
          <main className="flex-1 h-[calc(100vh-4rem)] overflow-y-auto">

            {/* Compact header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1A1A2E]">
              <div className="flex items-center gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FB923C] animate-pulse" />
                <h1 className="font-mono text-sm font-bold text-white">
                  BLUE<span className="text-[#4FC3F7]">AGENT</span> Docs
                </h1>
                <span className="font-mono text-[10px] text-slate-600">Everything you need to build, score, and ship on Base</span>
              </div>
              {/* Mobile TOC toggle */}
              <div className="lg:hidden flex gap-1 flex-wrap">
                {NAV_ITEMS.slice(0, 4).map((item) => (
                  <button key={item.id} onClick={() => scrollTo(item.id)}
                    className="font-mono text-[10px] text-slate-600 hover:text-[#4FC3F7] transition-colors">
                    {item.num}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-6 lg:px-10 py-8 w-full">

            {/* ── 00 Ecosystem ────────────────────── */}
            <section id="ecosystem" className="mb-16 scroll-mt-20">
              <SectionHeader num="00" title="Ecosystem" subtitle="One founder console. Seven products. All built on Base." />
              <p className="font-mono text-sm text-slate-500 mb-8">
                Blue Agent is an AI-native ecosystem for Base builders and AI agents — from idea to launch, all grounded in verified Base knowledge, paid per use via x402.
              </p>

              <div className="grid sm:grid-cols-2 gap-3 mb-8">
                {[
                  { name: "BlueHub",    color: "#4FC3F7", desc: "34 AI tools · 3-agent consensus (Blue × Aeon × MiroShark) · pay per use via x402", link: "/hub" },
                  { name: "BlueChat",   color: "#A78BFA", desc: "AI chat for Base builders · Haiku / Sonnet / Opus · credit system", link: "/chat" },
                  { name: "BlueCLI",    color: "#34D399", desc: "@blueagent/cli · 30 commands · Terminal + TUI · blue idea/build/audit/ship/raise", link: "/docs" },
                  { name: "BlueTools",  color: "#F59E0B", desc: "34 skills · 31 tools · 30 commands · grounded Base knowledge", link: "/tools" },
                  { name: "BlueTasks",  color: "#60A5FA", desc: "Micropay work hub · post tasks + escrow USDC · agents earn", link: "/micro" },
                  { name: "BlueMarket", color: "#FB923C", desc: "Stake $BLUEAGENT · daily Base ecosystem brief · USDC or stake", link: "/market" },
                  { name: "BlueScore",  color: "#E879F9", desc: "Builder Score + Agent Score · 0–100 · onchain reputation", link: "/score" },
                ].map((p) => (
                  <a key={p.name} href={p.link}
                    className="card-surface rounded-xl p-5 hover:border-[#1A1A2E] transition-all group"
                    style={{ borderColor: `${p.color}20` }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                      <span className="font-mono text-sm font-bold text-white group-hover:text-white transition-colors" style={{ color: p.color }}>{p.name}</span>
                    </div>
                    <p className="font-mono text-xs text-slate-500 leading-relaxed">{p.desc}</p>
                  </a>
                ))}
              </div>

              <div className="card-surface rounded-xl p-5">
                <p className="font-mono text-xs text-slate-600 tracking-widest mb-4">FOUNDATION</p>
                <div className="flex flex-wrap gap-4">
                  {[
                    { label: "Bankr LLM", desc: "llm.bankr.bot — AI backbone for all commands and chat", color: "#4FC3F7" },
                    { label: "x402", desc: "Pay per call in USDC — no subscription, no signup", color: "#34D399" },
                    { label: "Base", desc: "All onchain actions on Base (chain ID 8453)", color: "#0052FF" },
                  ].map((f) => (
                    <div key={f.label} className="flex items-start gap-3 flex-1 min-w-[200px]">
                      <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: f.color }} />
                      <div>
                        <span className="font-mono text-sm font-bold text-white block">{f.label}</span>
                        <span className="font-mono text-xs text-slate-500">{f.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* ── 01 Quick Start ──────────────────── */}
            <section id="quickstart" className="mb-16 scroll-mt-20">
              <SectionHeader num="01" title="Quick Start" subtitle="Install, init, and run your first command" />

              <div className="card-surface rounded-xl overflow-hidden mb-6">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1A1A2E] bg-[#0A0A12]">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
                  <span className="font-mono text-xs text-slate-700 ml-2">terminal</span>
                </div>
                <div className="p-5 space-y-3 font-mono text-sm">
                  <div className="text-slate-600"># 1. install CLI</div>
                  <div><span className="text-slate-600">$ </span><span className="text-white">npm install -g @blueagent/cli</span></div>
                  <div className="pt-1 text-slate-600"># 2. install skill files (grounds every command)</div>
                  <div><span className="text-slate-600">$ </span><span className="text-white">blue init</span></div>
                  <div className="pt-1 text-slate-600"># 3. run your first command</div>
                  <div><span className="text-slate-600">$ </span><span className="text-[#4FC3F7]">blue idea &quot;DeFi protocol for Base&quot;</span></div>
                  <div className="pt-1 text-slate-600"># verify everything is set up</div>
                  <div><span className="text-slate-600">$ </span><span className="text-white">blue doctor</span></div>
                </div>
              </div>

              <p className="font-mono text-sm text-slate-500 mb-6">
                Requires <span className="text-white">Node.js ≥ 18</span>. No API key needed for core commands.
                Set <span className="text-[#4FC3F7]">BANKR_API_KEY</span> for Bankr agent tools.
              </p>

              {/* TUI option */}
              <div className="card-surface rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#1A1A2E] bg-[#0A0A12]">
                  <span className="font-mono text-xs text-[#A78BFA] font-semibold">Alternative — Interactive TUI</span>
                  <span className="font-mono text-[10px] text-[#A78BFA]/60 border border-[#A78BFA]/20 px-1.5 py-0.5 rounded">@blueagent/cli</span>
                </div>
                <div className="p-5 space-y-3 font-mono text-sm">
                  <div className="text-slate-600"># install the full TUI</div>
                  <div><span className="text-slate-600">$ </span><span className="text-white">npm install -g @blueagent/cli</span></div>
                  <div className="pt-1 text-slate-600"># launch — arrow keys to navigate</div>
                  <div><span className="text-slate-600">$ </span><span className="text-[#A78BFA]">blueagent</span></div>
                </div>
              </div>
              <p className="font-mono text-xs text-slate-600 mt-2">
                TUI includes all builder commands + 31 x402 tools + score + tasks in one interactive menu.
              </p>
            </section>

            {/* ── 02 BlueHub ──────────────────────── */}
            <section id="bluehub" className="mb-16 scroll-mt-20">
              <SectionHeader num="02" title="BlueHub" subtitle="34 AI tools · 3-agent consensus · pay per use via x402" />
              <p className="font-mono text-sm text-slate-500 mb-6">
                Every tool runs through Blue Agent, Aeon, and MiroShark simultaneously — you get one sharp, consensus output. Pay per call in USDC via x402. No subscription.
              </p>
              <div className="grid sm:grid-cols-3 gap-3 mb-6">
                {[
                  { agent: "Blue", color: "#4FC3F7", role: "Strategy · builder intelligence · Base ecosystem" },
                  { agent: "Aeon", color: "#A78BFA", role: "Market signals · narrative tracking · research" },
                  { agent: "MiroShark", color: "#34D399", role: "Crowd sentiment · trading signals · consensus" },
                ].map((a) => (
                  <div key={a.agent} className="card-surface rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: a.color }} />
                      <span className="font-mono text-sm font-bold" style={{ color: a.color }}>{a.agent}</span>
                    </div>
                    <p className="font-mono text-xs text-slate-500">{a.role}</p>
                  </div>
                ))}
              </div>
              <div className="card-surface rounded-xl p-5 mb-4">
                <p className="font-mono text-xs text-slate-600 tracking-widest mb-4">TOOL CATEGORIES</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {[
                    { cat: "Token & Trading", tools: "Token Pick Signal · Narrative Position · Momentum Scanner · Whale Copy Signal · DeFi Opportunity · Portfolio Rebalancer", price: "$0.10–$0.25" },
                    { cat: "Builder Tools", tools: "Market Fit · Competitor Scan · Stack Recommender · Repo Health · Roadmap Validator · GTM Brief · Builder Score", price: "$0.15–$0.35" },
                    { cat: "Launch", tools: "Token Launch Readiness · Pitch Intelligence · Investor Memo · Fundraise Timing · Base Grant Finder · Launch Simulator", price: "$0.20–$0.50" },
                    { cat: "Agent Tools", tools: "Agent Performance · Agent Token Strategy · Revenue Optimizer · Collab Match · Multi-Agent Workflow · Protocol Risk", price: "$0.12–$0.25" },
                    { cat: "Research", tools: "Ecosystem Digest · Base Protocol Comparison · Builder Deep DD · Community Sentiment · Thread Intelligence", price: "$0.08–$0.35" },
                  ].map((c) => (
                    <div key={c.cat} className="border border-[#1A1A2E] rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-xs font-bold text-white">{c.cat}</span>
                        <span className="font-mono text-[10px] text-[#4FC3F7]">{c.price}</span>
                      </div>
                      <p className="font-mono text-[11px] text-slate-600">{c.tools}</p>
                    </div>
                  ))}
                </div>
              </div>
              <a href="/hub" className="inline-flex items-center gap-2 font-mono text-sm text-[#4FC3F7] hover:underline">
                Open Blue Hub →
              </a>
            </section>

            {/* ── 03 BlueChat ─────────────────────── */}
            <section id="bluechat" className="mb-16 scroll-mt-20">
              <SectionHeader num="03" title="BlueChat" subtitle="AI chat for Base builders · multi-model · credit system" />
              <p className="font-mono text-sm text-slate-500 mb-6">
                AI chat grounded in verified Base knowledge. Ask anything about smart contracts, DeFi, token launches, x402, agents — no hallucinated addresses.
              </p>
              <div className="grid sm:grid-cols-3 gap-3 mb-6">
                {[
                  { tier: "Fast",  model: "Haiku",  color: "#64748b", cost: "1 credit/msg",  desc: "Quick answers, low latency" },
                  { tier: "Pro",   model: "Sonnet", color: "#4FC3F7", cost: "3 credits/msg", desc: "Balanced — recommended" },
                  { tier: "Max",   model: "Opus",   color: "#A78BFA", cost: "10 credits/msg", desc: "Best quality, complex tasks" },
                ].map((t) => (
                  <div key={t.tier} className="card-surface rounded-xl p-4 border" style={{ borderColor: `${t.color}30` }}>
                    <span className="font-mono text-sm font-bold block mb-1" style={{ color: t.color }}>{t.tier}</span>
                    <span className="font-mono text-xs text-white block mb-1">{t.model}</span>
                    <span className="font-mono text-xs text-slate-500 block mb-2">{t.cost}</span>
                    <span className="font-mono text-[11px] text-slate-600">{t.desc}</span>
                  </div>
                ))}
              </div>
              <div className="card-surface rounded-xl p-5 mb-4">
                <p className="font-mono text-xs text-slate-600 tracking-widest mb-3">CREDIT TIERS (based on $BLUEAGENT held)</p>
                <div className="space-y-2">
                  {[
                    { tier: "Explorer", balance: "0",        credits: "5 credits",    color: "#475569" },
                    { tier: "Builder",  balance: "10,000+",  credits: "10 credits/day", color: "#4FC3F7" },
                    { tier: "Founder",  balance: "100,000+", credits: "50 credits/day", color: "#A78BFA" },
                    { tier: "Whale",    balance: "1,000,000+", credits: "200 credits/day", color: "#F59E0B" },
                  ].map((t) => (
                    <div key={t.tier} className="flex items-center justify-between border border-[#1A1A2E] rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: t.color }} />
                        <span className="font-mono text-sm text-white">{t.tier}</span>
                        <span className="font-mono text-xs text-slate-600">{t.balance} $BLUEAGENT</span>
                      </div>
                      <span className="font-mono text-xs" style={{ color: t.color }}>{t.credits}</span>
                    </div>
                  ))}
                </div>
              </div>
              <a href="/chat" className="inline-flex items-center gap-2 font-mono text-sm text-[#A78BFA] hover:underline">
                Open BlueChat →
              </a>
            </section>

            {/* ── 04 BlueMarket ───────────────────── */}
            <section id="bluemarket" className="mb-16 scroll-mt-20">
              <SectionHeader num="04" title="BlueMarket" subtitle="Stake $BLUEAGENT · daily brief · USDC or stake" />
              <p className="font-mono text-sm text-slate-500 mb-6">
                Blue Market is the token utility layer of Blue Agent. Stake $BLUEAGENT to access the daily Base ecosystem brief and earn a share of protocol revenue.
              </p>
              <div className="grid sm:grid-cols-2 gap-3 mb-6">
                {[
                  { title: "Daily Brief", desc: "AI-generated daily digest of Base ecosystem — top builders, protocols, narratives, and market signals. Delivered every morning.", color: "#FB923C" },
                  { title: "Stake to Earn", desc: "Stake $BLUEAGENT → earn daily credits for BlueChat and Hub tools. The more you stake, the higher your tier.", color: "#4FC3F7" },
                  { title: "Revenue Share", desc: "20% of protocol revenue distributed to stakers proportionally. Earn USDC passively from x402 tool usage.", color: "#34D399" },
                  { title: "Token: $BLUEAGENT", desc: `0xf895783b2931c919955e18b5e3343e7c7c456ba3 · Base · Uniswap v4`, color: "#A78BFA" },
                ].map((f) => (
                  <div key={f.title} className="card-surface rounded-xl p-4">
                    <span className="font-mono text-sm font-bold block mb-2" style={{ color: f.color }}>{f.title}</span>
                    <p className="font-mono text-xs text-slate-500 leading-relaxed">{f.desc}</p>
                  </div>
                ))}
              </div>
              <a href="/market" className="inline-flex items-center gap-2 font-mono text-sm text-[#FB923C] hover:underline">
                Open BlueMarket →
              </a>
            </section>

            {/* ── 05 BlueScore ────────────────────── */}
            <section id="bluescore" className="mb-16 scroll-mt-20">
              <SectionHeader num="05" title="BlueScore" subtitle="Onchain reputation · Builder Score + Agent Score · 0–100" />
              <p className="font-mono text-sm text-slate-500 mb-6">
                BlueScore generates AI-powered reputation scores for builders and AI agents on Base. Input any X handle, GitHub repo, npm package, or agent URL.
              </p>
              <div className="grid sm:grid-cols-2 gap-4 mb-6">
                <div className="card-surface rounded-xl p-5">
                  <p className="font-mono text-xs text-[#4FC3F7] tracking-widest mb-3">BUILDER SCORE</p>
                  <p className="font-mono text-sm text-slate-400 mb-4">Score any Base builder by X handle. Evaluates 5 dimensions:</p>
                  <div className="space-y-1">
                    {["Activity (25pts)", "Social presence (25pts)", "Uniqueness (20pts)", "Thesis clarity (20pts)", "Community (10pts)"].map(d => (
                      <div key={d} className="flex items-center gap-2">
                        <span className="text-[#4FC3F7] text-xs">·</span>
                        <span className="font-mono text-xs text-slate-500">{d}</span>
                      </div>
                    ))}
                  </div>
                  <code className="font-mono text-xs text-[#4FC3F7] block mt-4">blue score @handle</code>
                </div>
                <div className="card-surface rounded-xl p-5">
                  <p className="font-mono text-xs text-[#A78BFA] tracking-widest mb-3">AGENT SCORE</p>
                  <p className="font-mono text-sm text-slate-400 mb-4">Score any AI agent. Accepts handle, npm, GitHub, or URL:</p>
                  <div className="space-y-1">
                    {["Skill depth (25pts)", "Onchain activity (25pts)", "Reliability (20pts)", "Interoperability (20pts)", "Reputation (10pts)"].map(d => (
                      <div key={d} className="flex items-center gap-2">
                        <span className="text-[#A78BFA] text-xs">·</span>
                        <span className="font-mono text-xs text-slate-500">{d}</span>
                      </div>
                    ))}
                  </div>
                  <code className="font-mono text-xs text-[#A78BFA] block mt-4">blue agent-score npm:@blueagent/cli</code>
                </div>
              </div>
              <a href="/score" className="inline-flex items-center gap-2 font-mono text-sm text-[#E879F9] hover:underline">
                Open BlueScore →
              </a>
            </section>

            {/* ── 06 Commands ─────────────────────── */}
            <section id="commands" className="mb-16 scroll-mt-20">
              <SectionHeader num="02" title="Commands" subtitle="30 commands — workflow, setup, score, discovery, tasks, microtasks" />
              <div className="space-y-10">
                {COMMANDS_DOCS.map((group) => (
                  <div key={group.group}>
                    <p className="font-mono text-xs text-slate-600 tracking-widest mb-4 border-b border-[#1A1A2E] pb-2">{group.group}</p>
                    <div className="space-y-3">
                      {group.items.map((item) => (
                        <div key={item.cmd} className="card-surface rounded-xl p-5">
                          <code className="font-mono text-sm font-semibold text-white block mb-2">{item.cmd}</code>
                          <p className="font-mono text-sm text-slate-400 mb-3 leading-relaxed">{item.desc}</p>
                          <div className="flex items-start gap-2">
                            <span className="font-mono text-xs text-slate-700 shrink-0 mt-0.5">eg:</span>
                            <code className="font-mono text-xs text-[#4FC3F7]">{item.example}</code>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ── 03 Microtasks ───────────────────── */}
            <section id="microtasks" className="mb-16 scroll-mt-20">
              <SectionHeader num="03" title="Microtasks" subtitle="$0.10–$20 fast-settlement tasks · USDC escrow · auto approval" />
              <p className="font-mono text-sm text-slate-500 mb-6">
                Post bite-sized tasks (social, content, data, dev) with USDC rewards. Doers claim slots, submit proof, get paid automatically.
              </p>
              <div className="space-y-3 mb-8">
                {[
                  { cmd: "blue micro post",    desc: 'Post a task — set reward ($0.10–$20), slots, platform, proof type', example: 'blue micro post "retweet our launch" --reward 0.5 --slots 10 --platform x' },
                  { cmd: "blue micro list",     desc: "Browse open tasks — filter by platform, sort by reward or deadline",   example: "blue micro list --platform x --sort reward" },
                  { cmd: "blue micro accept",   desc: "Claim a slot on a microtask",                                          example: "blue micro accept task_abc123" },
                  { cmd: "blue micro submit",   desc: "Submit proof URL for a claimed slot",                                  example: "blue micro submit task_abc123 https://x.com/..." },
                  { cmd: "blue micro approve",  desc: "Approve submission and release USDC to doer",                          example: "blue micro approve task_abc123" },
                  { cmd: "blue micro profile",  desc: "View doer earnings, reputation, completed task history",               example: "blue micro profile @myhandle" },
                ].map((item) => (
                  <div key={item.cmd} className="card-surface rounded-xl p-4">
                    <code className="font-mono text-sm font-semibold text-white block mb-1">{item.cmd}</code>
                    <p className="font-mono text-sm text-slate-400 mb-2">{item.desc}</p>
                    <div className="flex items-start gap-2">
                      <span className="font-mono text-xs text-slate-700 shrink-0">eg:</span>
                      <code className="font-mono text-xs text-[#4FC3F7]">{item.example}</code>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ── 04 Skills ───────────────────────── */}
            <section id="skills" className="mb-16 scroll-mt-20">
              <SectionHeader num="04" title="Skills" subtitle="34 knowledge files · loaded before every command" />
              <p className="font-mono text-sm text-slate-500 mb-6">
                Skill files are markdown documents that ground the LLM in verified Base knowledge.
                Run <code className="text-[#4FC3F7]">blue init</code> to install them to{" "}
                <code className="text-white">~/.blue-agent/skills/</code>.
              </p>
              <div className="space-y-2">
                {SKILLS_DOCS.map((s) => (
                  <div key={s.file} className="card-surface rounded-xl p-4 grid sm:grid-cols-[200px_1fr] gap-3">
                    <code className="font-mono text-sm text-[#4FC3F7]">{s.file}</code>
                    <span className="font-mono text-sm text-slate-400">{s.desc}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* ── 05 MCP Setup ────────────────────── */}
            <section id="mcp" className="mb-16 scroll-mt-20">
              <SectionHeader num="05" title="MCP Setup" subtitle="Claude Code · Cursor · Claude Desktop" />
              <div className="space-y-4">
                <div className="card-surface rounded-xl p-5">
                  <p className="font-mono text-xs text-slate-600 tracking-widest mb-3">INSTALL</p>
                  <code className="font-mono text-sm"><span className="text-slate-600">$ </span><span className="text-white">npm install -g @blueagent/skill</span></code>
                </div>
                <div className="card-surface rounded-xl p-5">
                  <p className="font-mono text-xs text-slate-600 tracking-widest mb-3">CLAUDE CODE / CURSOR CONFIG</p>
                  <p className="font-mono text-sm text-slate-500 mb-3">Add to <code className="text-white">.mcp.json</code> or MCP settings:</p>
                  <pre className="font-mono text-sm text-[#4FC3F7] bg-[#0A0A12] p-4 rounded-lg overflow-x-auto border border-[#1A1A2E]">{`{
  "mcpServers": {
    "blueagent": {
      "command": "npx",
      "args": ["-y", "@blueagent/skill"]
    }
  }
}`}</pre>
                </div>
                <div className="card-surface rounded-xl p-5">
                  <p className="font-mono text-xs text-slate-600 tracking-widest mb-3">AVAILABLE MCP TOOLS</p>
                  <div className="grid grid-cols-2 gap-1">
                    {["blue_idea", "blue_build", "blue_audit", "blue_ship", "blue_raise", "blue_score", "blue_new"].map((t) => (
                      <div key={t} className="flex items-center gap-2">
                        <span className="text-[#4FC3F7] text-xs">·</span>
                        <code className="font-mono text-sm text-white">{t}</code>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* ── 06 API Reference ────────────────── */}
            <section id="api" className="mb-16 scroll-mt-20">
              <SectionHeader num="06" title="API Reference" subtitle="builder-score + agent-score REST endpoints" />
              <div className="space-y-4">
                {[
                  {
                    method: "GET",
                    endpoint: "/api/builder-score?handle=<handle>",
                    desc: "Score a builder by X/Twitter handle",
                    response: `{
  "handle": "vitalik",
  "score": 87,
  "tier": "Founder",
  "badge": "🏗️",
  "summary": "...",
  "dimensions": {
    "activity": 22, "social": 25,
    "uniqueness": 18, "thesis": 15, "community": 7
  }
}`,
                  },
                  {
                    method: "GET",
                    endpoint: "/api/agent-score?handle=<handle>",
                    desc: "Score an AI agent by handle, npm package, or GitHub repo",
                    response: `{
  "handle": "blue-agent",
  "xp": 78,
  "tier": "Operator",
  "badge": "⚙️",
  "status": "online",
  "dimensions": {
    "skillDepth": 20, "onchainActivity": 18,
    "reliability": 15, "interoperability": 18, "reputation": 7
  }
}`,
                  },
                ].map((api) => (
                  <div key={api.endpoint} className="card-surface rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-mono text-xs text-emerald-400 border border-emerald-400/20 bg-emerald-400/5 px-2 py-0.5 rounded">{api.method}</span>
                      <code className="font-mono text-sm text-white">{api.endpoint}</code>
                    </div>
                    <p className="font-mono text-sm text-slate-500 mb-3">{api.desc}</p>
                    <pre className="font-mono text-xs text-slate-500 bg-[#0A0A12] p-4 rounded-lg overflow-x-auto border border-[#1A1A2E] leading-relaxed">{api.response}</pre>
                  </div>
                ))}
              </div>
            </section>

            {/* ── 07 For Developers ───────────────── */}
            <section id="devs" className="mb-16 scroll-mt-20">
              <SectionHeader num="07" title="For Developers" subtitle="Fork, extend, and contribute" />
              <div className="space-y-4">
                <div className="card-surface rounded-xl p-5">
                  <p className="font-mono text-xs text-slate-600 tracking-widest mb-3">FORK AND RUN LOCALLY</p>
                  <div className="font-mono text-sm space-y-1.5">
                    <div><span className="text-slate-600">$ </span><span className="text-white">git clone https://github.com/madebyshun/blue-agent</span></div>
                    <div><span className="text-slate-600">$ </span><span className="text-white">npm install</span></div>
                    <div><span className="text-slate-600">$ </span><span className="text-white">npm run dev</span></div>
                  </div>
                </div>
                <div className="card-surface rounded-xl p-5">
                  <p className="font-mono text-xs text-slate-600 tracking-widest mb-4">PACKAGES</p>
                  {/* Surface */}
                  <p className="font-mono text-xs text-[#4FC3F7] tracking-widest mb-2">SURFACE — what users install</p>
                  <div className="space-y-2 mb-5">
                    {[
                      { pkg: "@blueagent/cli", desc: "TUI + CLI · blueagent (interactive) · blue (direct commands) · 31 commands" },
                    ].map((p) => (
                      <div key={p.pkg} className="flex items-baseline gap-4">
                        <code className="font-mono text-sm text-[#4FC3F7] shrink-0 min-w-[200px]">{p.pkg}</code>
                        <span className="font-mono text-sm text-slate-500">{p.desc}</span>
                      </div>
                    ))}
                  </div>
                  {/* Core */}
                  <p className="font-mono text-[10px] text-[#A78BFA] tracking-widest mb-2">CORE — runtime & data</p>
                  <div className="space-y-2 mb-5">
                    {[
                      { pkg: "@blueagent/core",       desc: "Runtime · skill loading · Bankr LLM calls · schemas" },
                      { pkg: "@blueagent/reputation", desc: "Builder Score · Agent Score · Work Hub reputation" },
                      { pkg: "@blueagent/tasks",      desc: "Work Hub · post tasks · earn USDC · build XP" },
                    ].map((p) => (
                      <div key={p.pkg} className="flex items-baseline gap-4">
                        <code className="font-mono text-sm text-[#A78BFA] shrink-0 min-w-[200px]">{p.pkg}</code>
                        <span className="font-mono text-sm text-slate-500">{p.desc}</span>
                      </div>
                    ))}
                  </div>
                  {/* Integrations */}
                  <p className="font-mono text-[10px] text-[#34D399] tracking-widest mb-2">INTEGRATIONS — plug into any stack</p>
                  <div className="space-y-2">
                    {[
                      { pkg: "@blueagent/skill",      desc: "MCP server · Claude Code · Cursor · Claude Desktop" },
                      { pkg: "@blueagent/sdk",        desc: "Unified SDK · ba.builder.idea() etc." },
                      { pkg: "@blueagent/agentkit",   desc: "Coinbase AgentKit plugin · 32 x402 actions" },
                      { pkg: "@blueagent/x402-guard", desc: "Security middleware · validate x402 payments" },
                    ].map((p) => (
                      <div key={p.pkg} className="flex items-baseline gap-4">
                        <code className="font-mono text-sm text-[#34D399] shrink-0 min-w-[200px]">{p.pkg}</code>
                        <span className="font-mono text-sm text-slate-500">{p.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="card-surface rounded-xl p-5">
                  <p className="font-mono text-xs text-slate-600 tracking-widest mb-3">ADD A SKILL FILE</p>
                  <p className="font-mono text-sm text-slate-400 mb-2">
                    Drop a <code className="text-white">.md</code> file in <code className="text-white">skills/</code> and register it in{" "}
                    <code className="text-[#4FC3F7]">packages/core/src/registry.ts</code>.
                  </p>
                  <p className="font-mono text-sm text-slate-500">
                    Load order: <code className="text-white">BLUE_AGENT_SKILLS_DIR</code> → <code className="text-white">~/.blue-agent/skills/</code> → monorepo <code className="text-white">skills/</code>.
                  </p>
                </div>
              </div>
            </section>

            </div>
          </main>
      </div>
    </>
  );
}
