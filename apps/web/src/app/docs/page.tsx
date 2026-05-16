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
    { cmd: "blue init",                      desc: "Install 6 skill files to ~/.blue-agent/skills/ for local grounding",        example: "blue init" },
    { cmd: "blue new <name>",                desc: "Scaffold a new Base project — base-agent | base-x402 | base-token",         example: "blue new my-token --template base-token" },
    { cmd: "blue doctor",                    desc: "Verify node, skills, API key, config — full environment health check",      example: "blue doctor" },
    { cmd: "blue validate [dir]",            desc: "Project health check — Node, package.json, tsconfig, env, src/, git",       example: "blue validate ./my-project" },
  ]},
  { group: "CHAT", items: [
    { cmd: "blue chat [prompt]",             desc: "Streaming multi-turn REPL — Haiku by default, --sonnet or --opus flags",    example: 'blue chat "how do I use x402 on Base?"' },
  ]},
  { group: "SCORE", items: [
    { cmd: "blue score [handle]",            desc: "Builder Score for an X handle — activity, social, thesis (0-100)",          example: "blue score @blockyagent" },
    { cmd: "blue agent-score [input]",       desc: "@handle / npm:@pkg / github.com/repo / https://url → Agent Score",          example: "blue agent-score npm:@blueagent/builder" },
    { cmd: "blue compare [a] [b]",           desc: "Compare two builders or agents side by side",                               example: "blue compare @vitalik @blocky_agent" },
  ]},
  { group: "DISCOVERY", items: [
    { cmd: "blue search [query]",            desc: "Search builders, agents, projects, and tokens on Base",                     example: 'blue search "AI agent"' },
    { cmd: "blue trending [filter]",         desc: "Trending on Base — builders / agents / tokens (optional filter)",           example: "blue trending agents" },
    { cmd: "blue watch [target]",            desc: "Watch a wallet, handle, or token for activity",                             example: "blue watch 0x1234..." },
    { cmd: "blue alert add",                 desc: "Configure price or activity alerts",                                        example: "blue alert add" },
    { cmd: "blue history [input]",           desc: "Activity history for a builder or agent — @handle / npm / github",          example: "blue history @blocky_agent" },
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
  { file: "base-security.md",       desc: "500+ security checks across 13 categories. Loaded for blue audit.",       install: "auto via blue init" },
  { file: "base-addresses.md",      desc: "Verified contract addresses on Base — USDC, WETH, Uniswap, Aave.",       install: "auto via blue init" },
  { file: "base-standards.md",      desc: "ERC standards, Base patterns, x402 protocol spec.",                      install: "auto via blue init" },
  { file: "bankr-tools.md",         desc: "Bankr LLM capabilities and all 31 x402 tools.",                          install: "auto via blue init" },
  { file: "blue-agent-identity.md", desc: "Blue Agent mission, product voice, do/don't rules.",                     install: "auto via blue init" },
  { file: "design-system.md",       desc: "Visual language, colors, card patterns, spacing.",                       install: "auto via blue init" },
];

const NAV_ITEMS = [
  { id: "quickstart", label: "Quick Start",     num: "01" },
  { id: "commands",   label: "Commands",        num: "02" },
  { id: "microtasks", label: "Microtasks",      num: "03" },
  { id: "skills",     label: "Skills",          num: "04" },
  { id: "mcp",        label: "MCP Setup",       num: "05" },
  { id: "api",        label: "API Reference",   num: "06" },
  { id: "devs",       label: "For Developers",  num: "07" },
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
      <div className="bg-[#050508] font-mono pt-16 min-h-screen flex">

          {/* ── Sticky sidebar ───────────────────── */}
          <aside className="hidden lg:flex flex-col w-56 shrink-0 sticky top-16 self-start h-[calc(100vh-4rem)] border-r border-[#1A1A2E] py-10 px-4">
            <p className="font-mono text-[10px] text-[#4FC3F7] tracking-widest mb-4 px-2">DOCUMENTATION</p>
            <nav className="flex flex-col gap-1">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => scrollTo(item.id)}
                  className={`flex items-center gap-2 text-left px-3 py-2 rounded-lg transition-all font-mono text-sm ${
                    activeSection === item.id
                      ? "text-[#4FC3F7] bg-[#4FC3F7]/8"
                      : "text-slate-500 hover:text-slate-300 hover:bg-[#1A1A2E]/50"
                  }`}
                >
                  <span className="text-[10px] text-slate-700 w-6 shrink-0">{item.num}</span>
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="mt-auto px-2 pt-6 border-t border-[#1A1A2E]">
              <a href="https://github.com/madebyshun/blue-agent" target="_blank" rel="noopener noreferrer"
                className="font-mono text-xs text-slate-700 hover:text-white transition-colors block mb-1">github →</a>
              <a href="https://x.com/blocky_agent" target="_blank" rel="noopener noreferrer"
                className="font-mono text-xs text-slate-700 hover:text-white transition-colors block mb-1">@blocky_agent →</a>
              <a href="https://t.me/blueagent_hub" target="_blank" rel="noopener noreferrer"
                className="font-mono text-xs text-slate-700 hover:text-white transition-colors block">telegram →</a>
            </div>
          </aside>

          {/* ── Main content ─────────────────────── */}
          <main className="flex-1 px-6 lg:px-10 py-10 max-w-4xl">

            {/* Page header */}
            <div className="mb-12">
              <p className="font-mono text-xs text-[#4FC3F7] tracking-widest mb-3">// DOCUMENTATION</p>
              <h1 className="font-mono text-4xl sm:text-5xl font-bold text-white mb-3">
                BLUE<span className="text-[#4FC3F7]">AGENT</span> Docs
              </h1>
              <p className="font-mono text-base text-slate-400 max-w-xl">
                Everything you need to build, score, and ship on Base.
              </p>

              {/* Mobile TOC */}
              <div className="lg:hidden mt-6 card-surface rounded-xl p-4">
                <p className="font-mono text-xs text-slate-600 mb-3 tracking-widest">ON THIS PAGE</p>
                <div className="grid grid-cols-2 gap-1">
                  {NAV_ITEMS.map((item) => (
                    <button key={item.id} onClick={() => scrollTo(item.id)}
                      className="text-left font-mono text-xs text-slate-500 hover:text-[#4FC3F7] py-1 transition-colors">
                      {item.num} {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

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
                  <div><span className="text-slate-600">$ </span><span className="text-white">npm install -g @blueagent/builder</span></div>
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
                  <span className="font-mono text-[9px] text-[#A78BFA]/60 border border-[#A78BFA]/20 px-1.5 py-0.5 rounded">@blueagent/cli</span>
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

            {/* ── 02 Commands ─────────────────────── */}
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
              <SectionHeader num="04" title="Skills" subtitle="6 knowledge files · loaded before every command" />
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
                  <p className="font-mono text-[10px] text-[#4FC3F7] tracking-widest mb-2">SURFACE — what users install</p>
                  <div className="space-y-2 mb-5">
                    {[
                      { pkg: "@blueagent/cli",        desc: "TUI · blueagent cmd · interactive menu · 8 categories" },
                      { pkg: "@blueagent/builder",    desc: "CLI · blue cmd · 5 commands + setup + score + tasks" },
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

          </main>
      </div>
    </>
  );
}
