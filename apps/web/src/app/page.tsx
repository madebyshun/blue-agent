"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

// ─── Data ────────────────────────────────────────────────────────────────────

const COMMANDS_DATA = [
  { tag: "Idea",  cmd: "blue idea",  price: "$0.05", desc: "Turn rough concept → fundable brief", detail: "Problem · Why Now · Why Base · MVP · Risks · 24h Plan", skills: ["base-standards","bankr-tools"] },
  { tag: "Build", cmd: "blue build", price: "$0.50", desc: "Architecture, stack, folder structure, integrations, test plan", detail: "No hallucinated addresses. Verified Base patterns only.", skills: ["base-addresses","base-standards","bankr-tools"] },
  { tag: "Audit", cmd: "blue audit", price: "$1.00", desc: "500+ security checks · 13 categories · Base-native", detail: "Reentrancy · Oracle · MEV · x402 · Coinbase Smart Wallet", skills: ["base-security","base-addresses"] },
  { tag: "Ship",  cmd: "blue ship",  price: "$0.10", desc: "Deployment checklist · Verification · Release notes · Monitoring", detail: "Everything you forget when excited to launch.", skills: ["base-standards","base-addresses"] },
  { tag: "Raise", cmd: "blue raise", price: "$0.20", desc: "Fundraising narrative · Investor deck · Competitive landscape", detail: "Smart money map for Base ecosystem.", skills: ["blue-agent-identity","base-standards"] },
];

const SKILLS_DATA = [
  { group: "Core",                color: "#4FC3F7", items: [
    { file: "base-security.md",         note: "84 checks · 13 categories" },
    { file: "base-addresses.md",        note: "verified contracts on Base" },
    { file: "base-standards.md",        note: "ERC standards · Base patterns" },
    { file: "base-ecosystem.md",        note: "protocols · teams · infra" },
    { file: "bankr-tools.md",           note: "Bankr LLM · x402 patterns" },
    { file: "blue-agent-identity.md",   note: "mission · surfaces · tone" },
    { file: "design-system.md",         note: "visual · language · components" },
  ]},
  { group: "Security",            color: "#f87171", items: [
    { file: "solidity-security-patterns.md",  note: "access control · reentrancy" },
    { file: "oracle-design-guide.md",          note: "Chainlink · TWAP · validation" },
    { file: "mev-protection-guide.md",         note: "frontrun defense · slippage" },
    { file: "mev-protection-advanced.md",      note: "Flashbots · Protect RPC" },
    { file: "cross-chain-bridge-security.md",  note: "finality · replay attacks" },
    { file: "agent-wallet-security.md",        note: "key mgmt · spend limits" },
    { file: "wallet-guardrails.md",            note: "allowlists · simulation" },
  ]},
  { group: "DeFi",                color: "#34d399", items: [
    { file: "aerodrome-dex-guide.md",         note: "pools · voting · bribes" },
    { file: "aave-lending-patterns.md",        note: "supply · borrow · liquidation" },
    { file: "uniswap-v4-hooks-guide.md",       note: "hooks · pool manager" },
    { file: "flashloan-patterns.md",           note: "callback · use cases" },
    { file: "flashloan-patterns-advanced.md",  note: "arbitrage · MEV defense" },
    { file: "staking-yield-farming.md",        note: "vaults · rewards · compounding" },
    { file: "gas-optimization-guide.md",       note: "packing · calldata · assembly" },
  ]},
  { group: "Accounts & Wallets", color: "#a78bfa", items: [
    { file: "base-account-integration.md",     note: "ERC-4337 · passkeys · sponsored" },
    { file: "account-abstraction-deep-dive.md", note: "UserOps · bundlers · paymasters" },
    { file: "multi-sig-wallet-security.md",    note: "Safe · threshold · timelock" },
    { file: "veil-privacy-transactions.md",    note: "stealth · private transfers" },
  ]},
  { group: "Payments",           color: "#fbbf24", items: [
    { file: "x402-patterns.md",       note: "pay-per-call · pricing · flow" },
    { file: "x402-escrow-patterns.md", note: "conditional release · USDC" },
  ]},
  { group: "Distribution",       color: "#fb923c", items: [
    { file: "frames-miniapps.md",        note: "Frame spec · actions · txs" },
    { file: "telegram-bot-patterns.md",  note: "webhooks · inline · wallet flows" },
    { file: "governance-dao-patterns.md", note: "Governor · timelock · quorum" },
  ]},
  { group: "Infrastructure",     color: "#94a3b8", items: [
    { file: "gig-marketplace-guide.md",          note: "escrow · reputation · USDC" },
    { file: "postgres-for-agents.md",            note: "schema · indexing · pgvector" },
    { file: "reputation-engine.md",              note: "Builder Score · Agent Score" },
    { file: "agent-transaction-verification.md", note: "pre-flight · simulation" },
  ]},
];

const HUB_CATEGORIES = [
  { label: "Intelligence",    color: "#4FC3F7", count: 6,  tools: ["launch-simulator","token-pick-signal","narrative-position","ecosystem-digest","market-fit","token-launch-readiness"] },
  { label: "Builder",         color: "#A78BFA", count: 13, tools: ["builder-deep-dd","competitor-scan","investor-memo","roadmap-validator","pitch-intelligence","fundraise-timing","gtm-brief","stack-recommender","token-distribution-plan","agent-performance","agent-collab-match","repo-health","community-sentiment"] },
  { label: "Trading",         color: "#34D399", count: 3,  tools: ["whale-copy-signal","token-momentum-scanner","portfolio-rebalancer"] },
  { label: "Content",         color: "#FB923C", count: 3,  tools: ["thread-intelligence","builder-brand-score","community-growth-playbook"] },
  { label: "Agent Economy",   color: "#F472B6", count: 3,  tools: ["agent-revenue-optimizer","agent-token-strategy","multi-agent-workflow"] },
  { label: "Base Ecosystem",  color: "#60A5FA", count: 3,  tools: ["base-grant-finder","base-protocol-comparison","base-builder-network-match"] },
  { label: "On-chain",        color: "#FBBF24", count: 3,  tools: ["wallet-strategy-analyzer","protocol-risk-monitor","defi-opportunity"] },
];

const ALL_COMMANDS = [
  { group: "WORKFLOW",     items: [
    { cmd: "blue idea",              arrow: "concept → fundable brief" },
    { cmd: "blue build",             arrow: "brief → architecture + stack" },
    { cmd: "blue audit",             arrow: "code → security review" },
    { cmd: "blue ship",              arrow: "project → deploy checklist" },
    { cmd: "blue raise",             arrow: "idea → fundraising narrative" },
  ]},
  { group: "SETUP",        items: [
    { cmd: "blue init",              arrow: "install 34 skill files" },
    { cmd: "blue new <name>",        arrow: "scaffold base-agent | base-x402 | base-token" },
    { cmd: "blue doctor",            arrow: "verify node, skills, API key, config" },
    { cmd: "blue validate [dir]",    arrow: "project health — package.json, tsconfig, env" },
  ]},
  { group: "CHAT",         items: [{ cmd: "blue chat", arrow: "streaming multi-turn REPL" }] },
  { group: "SCORE",        items: [
    { cmd: "blue score",             arrow: "@handle → Builder Score (0-100)" },
    { cmd: "blue agent-score",       arrow: "@handle|npm|github → Agent Score" },
    { cmd: "blue compare [a] [b]",   arrow: "compare two builders or agents" },
  ]},
  { group: "DISCOVERY",    items: [
    { cmd: "blue search [query]",    arrow: "search builders, agents, projects, tokens" },
    { cmd: "blue trending [filter]", arrow: "trending on Base — builders|agents|tokens" },
    { cmd: "blue watch [target]",    arrow: "watch wallet, handle, or token" },
    { cmd: "blue alert add",         arrow: "configure price or activity alerts" },
    { cmd: "blue history [input]",   arrow: "activity history for builder or agent" },
  ]},
  { group: "LAUNCH",       items: [
    { cmd: "blue launch [mode]",     arrow: "token launch on Base | agent on Bankr" },
    { cmd: "blue market",            arrow: "browse or publish on Bankr marketplace" },
  ]},
  { group: "TASKS",        items: [
    { cmd: "blue tasks",             arrow: "browse open tasks in Work Hub" },
    { cmd: "blue post-task",         arrow: "create task + escrow USDC" },
    { cmd: "blue accept <taskId>",   arrow: "accept an open task" },
    { cmd: "blue submit <taskId>",   arrow: "submit proof + earn XP + USDC" },
  ]},
  { group: "MICROTASKS",   items: [
    { cmd: "blue micro post",        arrow: "post $0.10–$20 microtask with slots" },
    { cmd: "blue micro list",        arrow: "browse open microtasks" },
    { cmd: "blue micro accept",      arrow: "claim a slot on a microtask" },
    { cmd: "blue micro submit",      arrow: "submit proof URL for claimed slot" },
    { cmd: "blue micro approve",     arrow: "approve submission + release USDC" },
    { cmd: "blue micro profile",     arrow: "doer earnings, reputation, history" },
  ]},
  { group: "TERMINAL UI",  items: [{ cmd: "blue tui", arrow: "open @blueagent/cli full TUI" }] },
];

const ECOSYSTEM_LAYERS = [
  { layer: "SURFACE",      label: "What users install", color: "#4FC3F7", packages: [
    { pkg: "@blueagent/cli",           version: "v1.3.5", cmd: "blueagent", badge: "TUI",      desc: "Terminal UI — interactive menu, 8 categories, 31+ tools.", install: "npm install -g @blueagent/cli" },
  ]},
  { layer: "CORE",         label: "Runtime & data",     color: "#A78BFA", packages: [
    { pkg: "@blueagent/core",          version: "v1.0.1", cmd: null, badge: "Runtime", desc: "Grounded LLM calls via Bankr · skill registry · command schemas.", install: "npm install @blueagent/core" },
    { pkg: "@blueagent/reputation",    version: "v0.1.1", cmd: null, badge: "Score",   desc: "Builder Score · Agent Score · Work Hub reputation system.", install: "npm install @blueagent/reputation" },
    { pkg: "@blueagent/tasks",         version: "v0.1.0", cmd: null, badge: "Tasks",   desc: "Work Hub — post tasks, earn USDC, build onchain reputation.", install: "npm install @blueagent/tasks" },
  ]},
  { layer: "INTEGRATIONS", label: "Plug into any stack", color: "#34D399", packages: [
    { pkg: "@blueagent/skill",         version: "v0.1.1", cmd: null, badge: "MCP",      desc: "MCP server — 5 tools for Claude Code · Cursor · Claude Desktop.", install: "npm install -g @blueagent/skill" },
    { pkg: "@blueagent/sdk",           version: "v0.1.0", cmd: null, badge: "SDK",      desc: "Unified programmatic API — ba.builder.idea() and more.", install: "npm install @blueagent/sdk" },
    { pkg: "@blueagent/agentkit",      version: "v0.1.0", cmd: null, badge: "AgentKit", desc: "Coinbase AgentKit plugin — 32 x402 tools as actions.", install: "npm install @blueagent/agentkit" },
    { pkg: "@blueagent/x402-guard",    version: "v1.0.0", cmd: null, badge: "Security", desc: "Security middleware for x402 payments — validate before you pay.", install: "npm install @blueagent/x402-guard" },
  ]},
];

// ─── Section panels ───────────────────────────────────────────────────────────

function PanelOverview() {
  const QUICK_CARDS = [
    {
      href: "/console", label: "Console", tag: "5 commands",
      desc: "Idea → build → audit → ship → raise. AI-powered, grounded in 34 verified Base skill files.",
      color: "#4FC3F7", cta: "Open Console",
    },
    {
      href: "/hub", label: "Blue Hub", tag: "34 tools",
      desc: "3-agent collab tools powered by Blue Agent · Aeon · MiroShark. Pay per use via x402.",
      color: "#A78BFA", cta: "Explore Hub",
    },
    {
      href: "/tools", label: "Tools", tag: "reference",
      desc: "All skills, commands, APIs, and npm packages. Everything you need to build on Base.",
      color: "#34D399", cta: "Browse Tools",
    },
    {
      href: "/docs", label: "Docs", tag: "quickstart",
      desc: "Up and running in 2 minutes. Install, init, and ship your first Base project.",
      color: "#FB923C", cta: "Read Docs",
    },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col font-mono">

      {/* ── Hero — vertically centered, fills available space ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-10 text-center min-h-0">

        {/* Badge */}
        <div className="inline-flex items-center gap-2 border border-[#4FC3F7]/20 bg-[#4FC3F7]/5 rounded-full px-4 py-1.5 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
          <span className="text-[10px] text-[#4FC3F7] tracking-widest">BUILT ON BASE · POWERED BY BANKR LLM</span>
        </div>

        {/* Heading */}
        <h1 className="text-6xl sm:text-7xl lg:text-8xl font-bold text-white tracking-tight leading-none mb-5">
          BLUE<span className="text-[#4FC3F7]">AGENT</span>
        </h1>
        <p className="text-base text-slate-400 mb-2 max-w-lg leading-relaxed">
          The AI founder console for Base builders.
        </p>
        <p className="text-sm text-slate-600 mb-10 max-w-md leading-relaxed">
          Idea → build → audit → ship → raise.<br />
          Grounded in real Base knowledge. No hallucinations.
        </p>

        {/* Install command */}
        <div className="flex items-center gap-2 bg-[#0D0D14] border border-[#1A1A2E] rounded-xl px-5 py-3 mb-2">
          <span className="text-xs text-slate-600 shrink-0">$</span>
          <span className="text-sm text-[#4FC3F7]">curl -fsSL https://blueagent.dev/setup.sh | bash</span>
        </div>
        <p className="text-[10px] text-slate-700 mb-9">
          installs <span className="text-slate-500">blueagent</span> (TUI) + <span className="text-slate-500">blue</span> (CLI) · Node ≥ 18
        </p>

        {/* CTAs */}
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/console"
            className="text-sm font-semibold bg-[#4FC3F7] text-[#050508] px-6 py-2.5 rounded hover:bg-[#29ABE2] transition-colors">
            Start building →
          </Link>
          <Link href="/hub"
            className="text-sm text-[#4FC3F7] border border-[#4FC3F7]/30 px-6 py-2.5 rounded hover:bg-[#4FC3F7]/5 transition-all">
            Explore Hub →
          </Link>
          <Link href="/docs"
            className="text-sm text-slate-500 border border-[#1A1A2E] px-6 py-2.5 rounded hover:text-white hover:border-[#4FC3F7]/30 transition-all">
            Read docs →
          </Link>
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="border-t border-[#1A1A2E] shrink-0" />

      {/* ── Bottom quick-access cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 shrink-0 divide-x divide-[#1A1A2E]">
        {QUICK_CARDS.map((card) => (
          <Link key={card.href} href={card.href}
            className="flex flex-col px-6 py-5 hover:bg-[#0D0D14] transition-colors group">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-white group-hover:text-[#4FC3F7] transition-colors">
                {card.label}
              </span>
              <span className="text-[10px] text-slate-700 border border-[#1A1A2E] px-1.5 py-0.5 rounded">
                {card.tag}
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed flex-1 mb-3">
              {card.desc}
            </p>
            <span className="text-xs font-medium transition-colors" style={{ color: card.color }}>
              {card.cta} →
            </span>
          </Link>
        ))}
      </div>

      {/* ── Footer ── */}
      <div className="border-t border-[#1A1A2E] px-8 py-3 shrink-0 flex flex-wrap items-center gap-x-5 gap-y-1">
        {[["34","skills"],["68","tools"],["34","hub tools"],["30","commands"],["Base","chain"]].map(([n, l]) => (
          <div key={n+l} className="flex items-baseline gap-1">
            <span className="text-sm font-bold text-[#4FC3F7]">{n}</span>
            <span className="text-xs text-slate-700">{l}</span>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-[#4FC3F7] animate-pulse" />
            <span className="text-[10px] text-slate-700">$BLUEAGENT</span>
          </span>
          <a href="https://x.com/blocky_agent" target="_blank" rel="noopener noreferrer"
            className="text-xs text-slate-700 hover:text-white transition-colors">X</a>
          <a href="https://github.com/madebyshun/blue-agent" target="_blank" rel="noopener noreferrer"
            className="text-xs text-slate-700 hover:text-white transition-colors">GitHub</a>
          <a href="https://t.me/blueagent_hub" target="_blank" rel="noopener noreferrer"
            className="text-xs text-slate-700 hover:text-white transition-colors">Telegram</a>
        </div>
      </div>

    </div>
  );
}

function PanelCommands() {
  return (
    <div>
      <div className="text-center py-12 px-8 border-b border-[#1A1A2E]">
        <div className="inline-flex items-center gap-2 border border-[#4FC3F7]/20 bg-[#4FC3F7]/5 rounded-full px-4 py-1.5 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
          <span className="font-mono text-[10px] text-[#4FC3F7] tracking-widest">BUILT FOR BASE · 5 COMMANDS</span>
        </div>
        <h2 className="font-mono text-4xl sm:text-5xl font-bold text-white tracking-tight mb-4">
          From idea to <span className="text-[#4FC3F7]">shipped</span>.
        </h2>
        <p className="font-mono text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
          5 commands · grounded by skill files · no hallucinations
        </p>
      </div>

      <div className="p-8 lg:p-10 max-w-5xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-12">
          {COMMANDS_DATA.map((c) => (
            <div key={c.tag} className="card-surface card-hover rounded-lg p-6 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-[#4FC3F7]">&lt;{c.tag}&gt;</span>
                <span className="font-mono text-[10px] text-slate-700">{c.price}</span>
              </div>
              <div className="font-mono text-base text-white font-semibold">{c.cmd}</div>
              <p className="font-mono text-sm text-slate-400 leading-relaxed">{c.desc}</p>
              <p className="font-mono text-xs text-slate-600">{c.detail}</p>
              <div className="flex flex-wrap gap-1 mt-auto pt-2 border-t border-[#1A1A2E]">
                <span className="font-mono text-[10px] text-slate-700">skills:</span>
                {c.skills.map((s) => (
                  <span key={s} className="font-mono text-[10px] text-slate-600 border border-[#1A1A2E] px-1.5 py-0.5 rounded">[{s}]</span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="font-mono text-[10px] text-[#4FC3F7] tracking-widest mb-2 mt-6">// ALL COMMANDS</p>
        <h3 className="font-mono text-xl font-bold text-white mb-6">
          {ALL_COMMANDS.reduce((s, g) => s + g.items.length, 0)} commands. Every step of the founder journey.
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          {ALL_COMMANDS.map((group) => (
            <div key={group.group}>
              <p className="font-mono text-[10px] text-slate-700 tracking-widest mb-3">{group.group}</p>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <div key={item.cmd} className="flex items-baseline gap-2">
                    <span className="font-mono text-xs text-white shrink-0">{item.cmd}</span>
                    <span className="font-mono text-[10px] text-slate-700">→</span>
                    <span className="font-mono text-xs text-slate-500">{item.arrow}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PanelSkills() {
  return (
    <div>
      <div className="text-center py-12 px-8 border-b border-[#1A1A2E]">
        <div className="inline-flex items-center gap-2 border border-[#4FC3F7]/20 bg-[#4FC3F7]/5 rounded-full px-4 py-1.5 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
          <span className="font-mono text-[10px] text-[#4FC3F7] tracking-widest">GROUNDING CONTRACT · 34 FILES</span>
        </div>
        <h2 className="font-mono text-4xl sm:text-5xl font-bold text-white tracking-tight mb-4">
          Zero <span className="text-[#4FC3F7]">hallucinations</span>.
        </h2>
        <p className="font-mono text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
          34 skill files · loaded before every command · verified Base data only
        </p>
      </div>

      <div className="p-8 lg:p-10 max-w-5xl mx-auto w-full">
      <div className="space-y-6 mb-8">
        {SKILLS_DATA.map((g) => (
          <div key={g.group}>
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono text-[10px] tracking-widest" style={{ color: g.color }}>{g.group.toUpperCase()}</span>
              <span className="font-mono text-[10px] text-slate-700">{g.items.length} files</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {g.items.map((s) => (
                <div key={s.file} className="card-surface rounded-lg p-3 flex flex-col gap-1">
                  <span className="font-mono text-[11px]" style={{ color: g.color }}>{s.file}</span>
                  <span className="font-mono text-xs text-slate-600">{s.note}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="card-surface rounded-lg p-4 inline-flex flex-col gap-1">
        <span className="font-mono text-[10px] text-slate-600">$ <span className="text-[#4FC3F7]">blue init</span> <span className="text-slate-700">← install all 34 skills</span></span>
      </div>
      </div>
    </div>
  );
}

function PanelHub() {
  return (
    <div>
      <div className="text-center py-12 px-8 border-b border-[#1A1A2E]">
        <div className="inline-flex items-center gap-2 border border-[#A78BFA]/20 bg-[#A78BFA]/5 rounded-full px-4 py-1.5 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA] animate-pulse" />
          <span className="font-mono text-[10px] text-[#A78BFA] tracking-widest">3-AGENT COLLAB · 34 TOOLS</span>
        </div>
        <h2 className="font-mono text-4xl sm:text-5xl font-bold text-white tracking-tight mb-4">
          34 tools. 3 agents. <span className="text-[#A78BFA]">One call</span>.
        </h2>
        <p className="font-mono text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
          Blue Agent × Aeon × MiroShark · pay per use · USDC on Base
        </p>
      </div>
      <div className="p-8 lg:p-10 max-w-5xl mx-auto w-full">

      <div className="flex flex-wrap gap-3 mb-8">
        {[
          { name: "Blue Agent", role: "verdict + synthesis",  color: "#4FC3F7" },
          { name: "Aeon",       role: "research + signals",   color: "#34D399" },
          { name: "MiroShark",  role: "consensus + personas", color: "#A78BFA" },
        ].map((a) => (
          <div key={a.name} className="card-surface rounded-lg px-4 py-3 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
            <div>
              <p className="font-mono text-xs text-white">{a.name}</p>
              <p className="font-mono text-[10px] text-slate-600">{a.role}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-8">
        {HUB_CATEGORIES.map((cat) => (
          <div key={cat.label} className="card-surface rounded-lg p-4">
            <div className="flex items-baseline justify-between mb-3">
              <span className="font-mono text-xs font-semibold" style={{ color: cat.color }}>{cat.label}</span>
              <span className="font-mono text-[10px] text-slate-700">{cat.count}</span>
            </div>
            <div className="space-y-1.5">
              {cat.tools.slice(0, 4).map((t) => (
                <p key={t} className="font-mono text-[10px] text-slate-600 truncate">{t}</p>
              ))}
              {cat.tools.length > 4 && (
                <p className="font-mono text-[10px] text-slate-700">+{cat.tools.length - 4} more</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <Link href="/hub" className="inline-block font-mono text-sm font-semibold bg-[#4FC3F7] text-[#050508] px-6 py-3 rounded hover:bg-[#29ABE2] transition-colors">
        Explore Blue Hub →
      </Link>
      </div>
    </div>
  );
}

function PanelEcosystem() {
  return (
    <div>
      <div className="text-center py-12 px-8 border-b border-[#1A1A2E]">
        <div className="inline-flex items-center gap-2 border border-[#34D399]/20 bg-[#34D399]/5 rounded-full px-4 py-1.5 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-[#34D399] animate-pulse" />
          <span className="font-mono text-[10px] text-[#34D399] tracking-widest">OPEN SOURCE · 9 PACKAGES</span>
        </div>
        <h2 className="font-mono text-4xl sm:text-5xl font-bold text-white tracking-tight mb-4">
          9 packages. <span className="text-[#34D399]">One ecosystem</span>.
        </h2>
        <p className="font-mono text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
          From TUI to SDK — every layer of the Blue Agent stack on npm
        </p>
      </div>
      <div className="p-8 lg:p-10 max-w-5xl mx-auto w-full">

      <div className="space-y-8">
        {ECOSYSTEM_LAYERS.map((layer) => (
          <div key={layer.layer}>
            <div className="flex items-center gap-3 mb-4">
              <span className="font-mono text-[10px] tracking-widest px-2 py-0.5 rounded border"
                style={{ color: layer.color, borderColor: `${layer.color}30`, background: `${layer.color}08` }}>
                {layer.layer}
              </span>
              <span className="font-mono text-xs text-slate-600">{layer.label}</span>
              <div className="flex-1 border-t border-dashed border-[#1A1A2E]" />
              <span className="font-mono text-[10px] text-slate-700">{layer.packages.length} packages</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {layer.packages.map((p) => (
                <div key={p.pkg} className="card-surface rounded-lg p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-1">
                    <span className="font-mono text-xs text-white font-semibold leading-snug break-all">{p.pkg}</span>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded shrink-0 mt-0.5"
                      style={{ color: layer.color, background: `${layer.color}12`, border: `1px solid ${layer.color}25` }}>
                      {p.badge}
                    </span>
                  </div>
                  {p.cmd && <div className="font-mono text-[10px] text-[#4FC3F7]">$ {p.cmd}</div>}
                  <p className="font-mono text-xs text-slate-500 leading-relaxed flex-1">{p.desc}</p>
                  <div className="pt-2 border-t border-[#1A1A2E] flex items-center justify-between">
                    <span className="font-mono text-[10px] text-slate-700">{p.version}</span>
                    <span className="font-mono text-[10px] text-slate-700">npm →</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 card-surface rounded-lg p-4 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] text-[#4FC3F7]">@blueagent/cli</span>
        <span className="font-mono text-[10px] text-slate-700">→ calls →</span>
        <span className="font-mono text-[10px] text-[#A78BFA]">@blueagent/core</span>
        <span className="font-mono text-[10px] text-slate-700">→ LLM via →</span>
        <span className="font-mono text-[10px] text-slate-400">Bankr LLM (Base)</span>
      </div>
      </div>
    </div>
  );
}

function PanelIntegrations() {
  const pkgs = [
    { pkg: "@blueagent/skill",        desc: "MCP server · Claude Code · Cursor · Claude Desktop", install: "npm install -g @blueagent/skill",     lang: "npm" },
    { pkg: "@blueagent/sdk",          desc: "Unified programmatic API",                            install: "npm install @blueagent/sdk",            lang: "npm" },
    { pkg: "@blueagent/agentkit",     desc: "Coinbase AgentKit · 32 tools as actions",             install: "npm install @blueagent/agentkit",        lang: "npm" },
    { pkg: "@blueagent/vercel-ai",    desc: "Vercel AI SDK · Next.js ready",                       install: "npm install @blueagent/vercel-ai",       lang: "npm" },
    { pkg: "blueagent-langchain",     desc: "Python · LangChain toolkit",                          install: "pip install blueagent-langchain",         lang: "pip" },
  ];
  const quickstart = [
    { label: "blue CLI", color: "#4FC3F7", tag: "recommended", lines: [
      { p: "$", cmd: "npm i -g @blueagent/cli" },
      { p: "$", cmd: "blue init" },
      { p: "$", cmd: 'blue idea "my Base project"', accent: true },
    ]},
    { label: "TUI — interactive", color: "#A78BFA", tag: "visual", lines: [
      { p: "$", cmd: "npm i -g @blueagent/cli" },
      { p: "$", cmd: "blueagent", accent: true },
      { p: "",  cmd: "↑↓ navigate · Enter select", muted: true },
    ]},
    { label: "One-liner", color: "#34D399", tag: "setup.sh", lines: [
      { p: "",  cmd: "installs CLI + TUI + skills", muted: true },
      { p: "$", cmd: "curl -fsSL https://blueagent.dev/setup.sh | bash", accent: true },
    ]},
  ];

  return (
    <div>
      <div className="text-center py-12 px-8 border-b border-[#1A1A2E]">
        <div className="inline-flex items-center gap-2 border border-[#4FC3F7]/20 bg-[#4FC3F7]/5 rounded-full px-4 py-1.5 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
          <span className="font-mono text-[10px] text-[#4FC3F7] tracking-widest">QUICK START · 2 MINUTES</span>
        </div>
        <h2 className="font-mono text-4xl sm:text-5xl font-bold text-white tracking-tight mb-4">
          Ready in <span className="text-[#4FC3F7]">2 minutes</span>.
        </h2>
        <p className="font-mono text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
          Install, init, and ship — that's the whole flow
        </p>
      </div>
      <div className="p-8 lg:p-10 max-w-5xl mx-auto w-full">

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
        {quickstart.map((qs) => (
          <div key={qs.label} className="card-surface rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#1A1A2E] bg-[#0D0D14]">
              <span className="font-mono text-xs font-semibold" style={{ color: qs.color }}>{qs.label}</span>
              <span className="font-mono text-[10px] px-1.5 rounded border" style={{ color: qs.color, borderColor: `${qs.color}30` }}>{qs.tag}</span>
            </div>
            <div className="p-4 space-y-2">
              {qs.lines.map((l, i) => (
                <div key={i} className="font-mono text-sm">
                  {l.p && <span className="text-slate-700">{l.p} </span>}
                  <span className={l.accent ? "" : l.muted ? "text-slate-700 text-xs" : "text-white"}
                    style={l.accent ? { color: qs.color } : {}}>
                    {l.cmd}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="font-mono text-[10px] text-[#4FC3F7] tracking-widest mb-2 mt-2">// INTEGRATIONS</p>
      <h3 className="font-mono text-xl font-bold text-white mb-6">Plug into any stack.</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {pkgs.map((pkg) => (
          <div key={pkg.pkg} className="card-surface card-hover rounded-lg p-5 flex flex-col gap-3">
            <span className="font-mono text-xs text-white font-semibold">{pkg.pkg}</span>
            <p className="font-mono text-xs text-slate-500 leading-relaxed">{pkg.desc}</p>
            <div className="mt-auto pt-3 border-t border-[#1A1A2E]">
              <span className="font-mono text-[10px] text-slate-700 mr-2">{pkg.lang === "pip" ? "pip" : "$"}</span>
              <span className="font-mono text-[10px] text-[#4FC3F7]">{pkg.install}</span>
            </div>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}

// ─── Sidebar nav ─────────────────────────────────────────────────────────────

type Section = "overview" | "commands" | "skills" | "hub" | "ecosystem" | "integrations";

const NAV: { key: Section; label: string; sub: string }[] = [
  { key: "overview",     label: "Overview",      sub: "What is Blue Agent" },
  { key: "commands",     label: "Commands",      sub: "30 commands" },
  { key: "skills",       label: "Skills",        sub: "34 grounding files" },
  { key: "hub",          label: "Hub",           sub: "34 collab tools" },
  { key: "ecosystem",    label: "Ecosystem",     sub: "9 npm packages" },
  { key: "integrations", label: "Integrations",  sub: "Quick start" },
];

const GRID_BG = {
  backgroundImage: "linear-gradient(rgba(79,195,247,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(79,195,247,0.02) 1px,transparent 1px)",
  backgroundSize: "40px 40px",
};

export default function Home() {
  const [active, setActive] = useState<Section>("overview");
  const mainRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Partial<Record<Section, HTMLElement>>>({});

  // Scroll-spy: update active nav item based on which section is visible
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActive(entry.target.id as Section);
          }
        });
      },
      { rootMargin: "0px 0px -60% 0px", threshold: 0.1 }
    );
    Object.values(sectionRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  function scrollTo(key: Section) {
    sectionRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <Navbar />
      <div className="flex bg-[#050508] font-mono pt-16" style={GRID_BG}>

        {/* ── Sidebar — sticky scroll-spy nav ── */}
        <aside className="hidden lg:flex flex-col w-72 shrink-0 sticky top-16 h-[calc(100vh-4rem)] border-r border-[#1A1A2E]">
          <div className="px-5 pt-5 pb-4 border-b border-[#1A1A2E]">
            <p className="font-mono text-xs text-[#4FC3F7] tracking-widest">// NAVIGATE</p>
          </div>

          <nav className="flex-1 overflow-y-auto py-3">
            {NAV.map((item) => (
              <button key={item.key} onClick={() => scrollTo(item.key)}
                className={`w-full text-left px-5 py-3 transition-all border-l-2 ${
                  active === item.key
                    ? "border-[#4FC3F7] bg-[#4FC3F7]/5 text-white"
                    : "border-transparent text-slate-500 hover:text-white hover:bg-[#0D0D1A]"
                }`}>
                <p className="font-mono text-xs font-medium">{item.label}</p>
                <p className="font-mono text-[10px] text-slate-700 mt-0.5">{item.sub}</p>
              </button>
            ))}
          </nav>

          <div className="px-4 py-4 border-t border-[#1A1A2E] space-y-2">
            <Link href="/console"
              className="flex items-center justify-between font-mono text-[10px] text-slate-400 hover:text-white border border-[#1A1A2E] hover:border-[#4FC3F7]/30 rounded px-3 py-2 transition-all">
              <span>Open Console</span><span className="text-[#4FC3F7]">→</span>
            </Link>
            <Link href="/hub"
              className="flex items-center justify-between font-mono text-[10px] text-slate-400 hover:text-white border border-[#1A1A2E] hover:border-[#4FC3F7]/30 rounded px-3 py-2 transition-all">
              <span>Blue Hub</span><span className="text-slate-600">34 tools</span>
            </Link>
          </div>

          <div className="px-5 py-3 border-t border-[#1A1A2E]">
            <div className="flex items-center gap-3 font-mono text-[10px] text-slate-700">
              <a href="https://x.com/blocky_agent" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">X</a>
              <a href="https://github.com/madebyshun/blue-agent" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a>
              <a href="https://t.me/blueagent_hub" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Telegram</a>
            </div>
          </div>
        </aside>

        {/* ── Main — all sections stacked, freely scrollable ── */}
        <main ref={mainRef} className="flex-1 overflow-y-auto">

          <section id="overview"
            ref={(el) => { if (el) sectionRefs.current.overview = el; }}
            className="border-b border-[#1A1A2E]">
            <PanelOverview />
          </section>

          <section id="commands"
            ref={(el) => { if (el) sectionRefs.current.commands = el; }}
            className="border-b border-[#1A1A2E]">
            <PanelCommands />
          </section>

          <section id="skills"
            ref={(el) => { if (el) sectionRefs.current.skills = el; }}
            className="border-b border-[#1A1A2E]">
            <PanelSkills />
          </section>

          <section id="hub"
            ref={(el) => { if (el) sectionRefs.current.hub = el; }}
            className="border-b border-[#1A1A2E]">
            <PanelHub />
          </section>

          <section id="ecosystem"
            ref={(el) => { if (el) sectionRefs.current.ecosystem = el; }}
            className="border-b border-[#1A1A2E]">
            <PanelEcosystem />
          </section>

          <section id="integrations"
            ref={(el) => { if (el) sectionRefs.current.integrations = el; }}>
            <PanelIntegrations />
          </section>

        </main>

      </div>
    </>
  );
}
