"use client";

import { useState, useMemo } from "react";
import Navbar from "@/components/Navbar";

const SKILLS = [
  { file: "base-security.md",       desc: "500+ security checks across 13 attack categories",         grounds: "Reentrancy, oracle, MEV, x402, Coinbase Smart Wallet patterns" },
  { file: "base-addresses.md",      desc: "Verified contract addresses on Base mainnet",               grounds: "USDC, WETH, Uniswap v3/v4, Aave, Compound, Clanker" },
  { file: "base-standards.md",      desc: "ERC standards and Base-native development patterns",        grounds: "ERC-20, ERC-721, ERC-4337, ERC-7702, x402 payment protocol" },
  { file: "bankr-tools.md",         desc: "Bankr LLM capabilities and x402 tool catalog",             grounds: "All 31 paid tools, endpoints, pricing, usage examples" },
  { file: "blue-agent-identity.md", desc: "Blue Agent mission, surfaces, tone, and values",           grounds: "Product positioning, voice, do/don't rules" },
  { file: "design-system.md",       desc: "Visual language and UI component patterns",                grounds: "Color palette, typography, card patterns, spacing system" },
];

const ALL_TOOLS = [
  {
    category: "Security", tag: "security", color: "#f87171",
    tools: [
      { name: "honeypot-check",  price: "$0.01",  desc: "Detect honeypot tokens that can't be sold after purchase",        example: "honeypot-check?token=0x..." },
      { name: "contract-audit",  price: "$0.05",  desc: "Full smart contract audit — reentrancy, overflow, access control", example: "contract-audit?address=0x..." },
      { name: "rug-pull-scan",   price: "$0.01",  desc: "Score a token's rug pull risk — liquidity, ownership, mint",       example: "rug-pull-scan?token=0x..." },
      { name: "wallet-risk",     price: "$0.01",  desc: "Risk score a wallet — history, counterparties, flagged activity",  example: "wallet-risk?address=0x..." },
      { name: "token-safety",    price: "$0.005", desc: "Quick token safety check — tax, blacklist, renounced ownership",   example: "token-safety?token=0x..." },
      { name: "lp-analysis",     price: "$0.02",  desc: "Analyze LP positions — impermanent loss, fees, rebalancing",       example: "lp-analysis?address=0x..." },
      { name: "deployer-check",  price: "$0.01",  desc: "Check a contract deployer's history and risk pattern",             example: "deployer-check?address=0x..." },
      { name: "bytecode-scan",   price: "$0.03",  desc: "Static bytecode analysis — known malicious patterns",              example: "bytecode-scan?address=0x..." },
    ],
  },
  {
    category: "Research", tag: "research", color: "#60a5fa",
    tools: [
      { name: "deep-analysis",   price: "$0.001", desc: "Comprehensive token fundamentals — on-chain activity, risk",       example: "deep-analysis?token=0x..." },
      { name: "token-analysis",  price: "$0.005", desc: "Token metrics — holder count, distribution, volume trends",        example: "token-analysis?token=0x..." },
      { name: "whale-tracker",   price: "$0.005", desc: "Track large wallet movements for a token",                         example: "whale-tracker?token=0x..." },
      { name: "holder-analysis", price: "$0.003", desc: "Analyze holder distribution and concentration risk",               example: "holder-analysis?token=0x..." },
      { name: "social-signals",  price: "$0.002", desc: "Social sentiment and narrative pulse for a token or topic",        example: "social-signals?topic=base" },
      { name: "competitor-map",  price: "$0.01",  desc: "Map competing projects and positioning in a sector",               example: "competitor-map?sector=DeFi" },
      { name: "market-depth",    price: "$0.003", desc: "DEX order book depth and liquidity analysis",                      example: "market-depth?token=0x..." },
    ],
  },
  {
    category: "Launch", tag: "launch", color: "#34d399",
    tools: [
      { name: "launch-advisor",  price: "$0.01",  desc: "AI launch strategy — timing, pricing, distribution",              example: "launch-advisor?project=Blue+Agent" },
      { name: "tokenomics",      price: "$0.01",  desc: "Score a token's economic model — supply, vesting, sustainability", example: "tokenomics?token=0x..." },
      { name: "grant-evaluator", price: "$0.01",  desc: "Evaluate grant eligibility and fit for Base ecosystem",            example: "grant-evaluator?url=https://..." },
      { name: "community-fit",   price: "$0.005", desc: "Community fit analysis — Discord, Telegram, X signals",            example: "community-fit?project=..." },
      { name: "naming-check",    price: "$0.003", desc: "Check name availability and brand uniqueness",                     example: "naming-check?name=BlueAgent" },
      { name: "pitch-score",     price: "$0.02",  desc: "Score a pitch deck or project narrative",                          example: "pitch-score?url=https://..." },
    ],
  },
  {
    category: "Premium", tag: "premium", color: "#a78bfa",
    tools: [
      { name: "wallet-pnl",      price: "$0.005", desc: "Realized and unrealized PnL across all positions",                example: "wallet-pnl?address=0x..." },
      { name: "risk-gate",       price: "$0.05",  desc: "Screen any transaction before execution — rug/malicious check",    example: "risk-gate?action=transfer&to=0x..." },
      { name: "quantum-premium", price: "$1.50",  desc: "Deep quantum-readiness analysis — entropy, migration plan",        example: "quantum-premium?address=0x..." },
      { name: "builder-score",   price: "$0.001", desc: "Builder Score for an X/Twitter handle (0-100)",                   example: "builder-score?handle=vitalik" },
      { name: "agent-score",     price: "$0.01",  desc: "Agent Score — XP system for AI agents on Base",                   example: "agent-score?handle=blue-agent" },
    ],
  },
];

const COMMANDS = [
  { group: "WORKFLOW", items: [
    { cmd: "blue idea [prompt]",            arrow: "concept → brief",              desc: "Fundable brief — problem, why now, MVP, risks, 24h plan",         example: 'blue idea "NFT marketplace for AI agents"' },
    { cmd: "blue build [prompt]",           arrow: "brief → architecture",         desc: "Architecture, stack, folder structure, integrations, test plan",   example: 'blue build "Base-native DEX"' },
    { cmd: "blue audit [prompt]",           arrow: "code → security review",       desc: "Security review — critical issues, suggested fixes, go/no-go",    example: 'blue audit "my ERC-20 contract"' },
    { cmd: "blue ship [prompt]",            arrow: "project → deploy checklist",   desc: "Deploy checklist, verification steps, release notes, monitoring",  example: 'blue ship "launch on Base mainnet"' },
    { cmd: "blue raise [prompt]",           arrow: "idea → fundraising narrative", desc: "Pitch narrative — why this wins, traction, ask, investors",        example: 'blue raise "Base DeFi protocol"' },
  ]},
  { group: "SETUP", items: [
    { cmd: "blue init",                     arrow: "install 6 skills",             desc: "Install all 6 skill files to ~/.blue-agent/skills/",               example: "blue init" },
    { cmd: "blue new <name>",               arrow: "scaffold project",             desc: "Scaffold: base-agent | base-x402 | base-token",                    example: "blue new my-token --template base-token" },
    { cmd: "blue doctor",                   arrow: "check setup",                  desc: "Verify node, skills, API key, config — full health check",          example: "blue doctor" },
    { cmd: "blue validate [dir]",           arrow: "project health",               desc: "Check Node, package.json, tsconfig, env, src/, git",               example: "blue validate ./my-project" },
  ]},
  { group: "CHAT", items: [
    { cmd: "blue chat [prompt]",            arrow: "chat with Blue Agent",         desc: "Streaming multi-turn REPL — Haiku (default) / Sonnet / Opus",      example: 'blue chat "how do I deploy on Base?"' },
  ]},
  { group: "SCORE", items: [
    { cmd: "blue score [handle]",           arrow: "@handle → Builder Score",      desc: "Builder Score for an X handle — activity, social, thesis (0-100)", example: "blue score @vitalik" },
    { cmd: "blue agent-score [input]",      arrow: "→ Agent Score",                desc: "@handle / npm:@pkg / github.com/repo / https://url",               example: "blue agent-score npm:@blueagent/builder" },
    { cmd: "blue compare [a] [b]",          arrow: "side-by-side comparison",      desc: "Compare two builders or agents head to head",                      example: "blue compare @vitalik @blocky_agent" },
  ]},
  { group: "DISCOVERY", items: [
    { cmd: "blue search [query]",           arrow: "search Base ecosystem",        desc: "Search builders, agents, projects, and tokens on Base",            example: "blue search \"AI agent\"" },
    { cmd: "blue trending [filter]",        arrow: "trending on Base",             desc: "Trending builders / agents / tokens (optional filter)",            example: "blue trending agents" },
    { cmd: "blue watch [target]",           arrow: "watch for activity",           desc: "Watch a wallet, handle, or token for activity",                    example: "blue watch 0x1234..." },
    { cmd: "blue alert add",                arrow: "set up alert",                 desc: "Configure price or activity alerts",                               example: "blue alert add" },
    { cmd: "blue history [input]",          arrow: "activity history",             desc: "Activity history for a builder or agent",                          example: "blue history @blocky_agent" },
  ]},
  { group: "LAUNCH / MARKET", items: [
    { cmd: "blue launch [mode]",            arrow: "token | agent",                desc: "Launch wizard — token on Base or agent on Bankr marketplace",      example: "blue launch token" },
    { cmd: "blue market [subcommand]",      arrow: "browse | publish",             desc: "Browse or publish agents, skills, prompts on Bankr marketplace",   example: "blue market publish" },
  ]},
  { group: "TASKS", items: [
    { cmd: "blue tasks",                    arrow: "browse open tasks",            desc: "Browse open tasks. Filter: audit|content|art|data|dev",            example: "blue tasks --category audit" },
    { cmd: "blue post-task [handle]",       arrow: "create task + escrow USDC",    desc: "Post a task to the Work Hub interactively",                        example: "blue post-task @myhandle" },
    { cmd: "blue accept <taskId>",          arrow: "accept a task",                desc: "Accept an open task from the Work Hub",                            example: "blue accept task_abc123" },
    { cmd: "blue submit <taskId> ...",      arrow: "submit proof + earn XP",       desc: "Submit completed work with proof URL, earn XP + USDC",             example: "blue submit task_abc123 @me https://..." },
  ]},
  { group: "MICROTASKS", items: [
    { cmd: "blue micro post [desc]",        arrow: "post microtask",               desc: "Post a $0.10–$20 microtask with reward, slots, platform, proof",   example: 'blue micro post "retweet our launch" --reward 0.5 --slots 10' },
    { cmd: "blue micro list [id]",          arrow: "browse microtasks",            desc: "Browse open microtasks — filter by platform, proof, status",       example: "blue micro list --platform x --sort reward" },
    { cmd: "blue micro accept <id>",        arrow: "claim a slot",                 desc: "Claim a slot on an open microtask",                                example: "blue micro accept task_abc123" },
    { cmd: "blue micro submit <id> <proof>",arrow: "submit proof",                 desc: "Submit proof URL for a claimed microtask slot",                    example: "blue micro submit task_abc123 https://x.com/..." },
    { cmd: "blue micro approve <id>",       arrow: "approve + release payment",    desc: "Approve submission and release USDC to doer",                      example: "blue micro approve task_abc123" },
    { cmd: "blue micro profile [handle]",   arrow: "doer profile",                 desc: "View earnings, reputation, completed tasks for a doer",            example: "blue micro profile @myhandle" },
  ]},
  { group: "TERMINAL UI", items: [
    { cmd: "blue tui",                      arrow: "open TUI",                     desc: "Launch the full @blueagent/cli terminal UI — arrow keys to navigate", example: "blue tui" },
  ]},
];

const SIDEBAR_SECTIONS = [
  { id: "tools",    label: "x402 Tools",  count: "31" },
  { id: "commands", label: "CLI Commands", count: "30" },
  { id: "skills",   label: "Skills",       count: "6"  },
];

const CATEGORIES = ["all", "security", "research", "launch", "premium"];

export default function ToolsPage() {
  const [section, setSection]   = useState<"tools" | "commands" | "skills">("tools");
  const [search, setSearch]     = useState("");
  const [category, setCategory] = useState("all");

  const filteredTools = useMemo(() => {
    const q = search.toLowerCase();
    return ALL_TOOLS.map((cat) => ({
      ...cat,
      tools: cat.tools.filter((t) =>
        (category === "all" || cat.tag === category) &&
        (q === "" || t.name.includes(q) || t.desc.toLowerCase().includes(q))
      ),
    })).filter((cat) => cat.tools.length > 0);
  }, [search, category]);

  const totalVisible = filteredTools.reduce((s, c) => s + c.tools.length, 0);

  return (
    <>
      <Navbar />
      <div className="bg-[#050508] font-mono pt-16 min-h-screen flex">

        {/* ── Sidebar ──────────────────────────────────── */}
        <aside className="hidden lg:flex flex-col w-56 shrink-0 sticky top-16 self-start h-[calc(100vh-4rem)] border-r border-[#1A1A2E] py-10 px-4">
          <p className="font-mono text-[10px] text-[#4FC3F7] tracking-widest mb-4 px-2">REFERENCE</p>
          <nav className="flex flex-col gap-1">
            {SIDEBAR_SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => { setSection(s.id as typeof section); setSearch(""); setCategory("all"); }}
                className={`flex items-center justify-between text-left px-3 py-2 rounded-lg transition-all font-mono text-sm ${
                  section === s.id
                    ? "text-[#4FC3F7] bg-[#4FC3F7]/8"
                    : "text-slate-500 hover:text-slate-300 hover:bg-[#1A1A2E]/50"
                }`}
              >
                <span>{s.label}</span>
                <span className="font-mono text-[10px] text-slate-700">{s.count}</span>
              </button>
            ))}
          </nav>

          {/* Category filter — only shown in tools tab */}
          {section === "tools" && (
            <div className="mt-6 pt-6 border-t border-[#1A1A2E]">
              <p className="font-mono text-[10px] text-slate-700 tracking-widest mb-3 px-2">CATEGORY</p>
              <div className="flex flex-col gap-1">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={`text-left px-3 py-1.5 rounded-lg font-mono text-xs capitalize transition-all ${
                      category === c
                        ? "text-[#4FC3F7] bg-[#4FC3F7]/8"
                        : "text-slate-600 hover:text-slate-300 hover:bg-[#1A1A2E]/50"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-auto px-2 pt-6 border-t border-[#1A1A2E]">
            <a href="https://x.com/blocky_agent" target="_blank" rel="noopener noreferrer"
              className="font-mono text-xs text-slate-700 hover:text-white transition-colors block mb-1">@blocky_agent →</a>
            <a href="/docs" className="font-mono text-xs text-slate-700 hover:text-white transition-colors block">docs →</a>
          </div>
        </aside>

        {/* ── Main content ─────────────────────────────── */}
        <main className="flex-1 px-6 lg:px-10 py-10 max-w-4xl">

          {/* Page header */}
          <div className="mb-10">
            <p className="font-mono text-xs text-[#4FC3F7] tracking-widest mb-3">// REFERENCE</p>
            <h1 className="font-mono text-4xl sm:text-5xl font-bold text-white mb-3">
              BLUE<span className="text-[#4FC3F7]">AGENT</span> Tools
            </h1>
            <p className="font-mono text-base text-slate-400 max-w-xl">
              6 skill files · 31 x402 tools · 12 commands — everything Blue Agent knows and can do.
            </p>

            {/* Mobile section tabs */}
            <div className="lg:hidden flex gap-2 mt-6 border-b border-[#1A1A2E] pb-4">
              {SIDEBAR_SECTIONS.map((s) => (
                <button key={s.id}
                  onClick={() => { setSection(s.id as typeof section); setSearch(""); setCategory("all"); }}
                  className={`font-mono text-xs px-3 py-1.5 rounded-lg transition-all ${
                    section === s.id ? "bg-[#4FC3F7]/10 text-[#4FC3F7] border border-[#4FC3F7]/30" : "text-slate-500 hover:text-white"
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── TOOLS ──────────────────────────────────── */}
          {section === "tools" && (
            <>
              <div className="flex flex-col sm:flex-row gap-3 mb-8">
                <div className="relative flex-1 max-w-sm">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tools…"
                    className="w-full pl-9 pr-4 py-2 rounded-xl bg-[#0D0D14] border border-[#1A1A2E] font-mono text-sm text-white placeholder:text-slate-600 outline-none focus:border-[#4FC3F7]/40 transition-colors" />
                </div>
                {/* Mobile category filter */}
                <div className="lg:hidden flex gap-2 flex-wrap">
                  {CATEGORIES.map((c) => (
                    <button key={c} onClick={() => setCategory(c)}
                      className={`font-mono text-xs px-3 py-1.5 rounded-lg capitalize transition-all ${
                        category === c ? "bg-[#4FC3F7]/10 text-[#4FC3F7] border border-[#4FC3F7]/30" : "text-slate-500 border border-[#1A1A2E] hover:text-white"
                      }`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <p className="font-mono text-xs text-slate-600 mb-6">{totalVisible} tools · pay-per-use · USDC on Base</p>

              {filteredTools.length === 0 ? (
                <div className="text-center py-16">
                  <p className="font-mono text-slate-600">No tools match &quot;{search}&quot;</p>
                </div>
              ) : (
                <div className="space-y-10">
                  {filteredTools.map((cat) => (
                    <div key={cat.category}>
                      <div className="flex items-center gap-3 mb-4">
                        <h2 className="font-mono text-sm font-semibold" style={{ color: cat.color }}>{cat.category}</h2>
                        <span className="font-mono text-xs text-slate-700">({cat.tools.length})</span>
                        <div className="flex-1 h-px bg-[#1A1A2E]" />
                      </div>
                      <div className="space-y-2">
                        {cat.tools.map((t) => (
                          <div key={t.name} className="card-surface rounded-xl p-4 grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-2 sm:gap-4 items-start hover:border-[#2A2A4E] transition-colors">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-sm font-semibold text-white">{t.name}</span>
                              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border"
                                style={{ color: cat.color, borderColor: cat.color + "40", background: cat.color + "10" }}>
                                {t.price}
                              </span>
                            </div>
                            <div>
                              <p className="font-mono text-sm text-slate-400 mb-1 leading-relaxed">{t.desc}</p>
                              <code className="font-mono text-xs text-slate-700">{t.example}</code>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Free tools */}
              <div className="mt-12 grid sm:grid-cols-2 gap-6">
                {[
                  { label: "Bankr Agent", items: [
                    { name: "***",          desc: "Wildcard — any Bankr agent action" },
                    { name: "transfer",     desc: "Transfer tokens via Bankr agent" },
                    { name: "portfolio",    desc: "Fetch wallet portfolio via Bankr agent" },
                    { name: "launch-token", desc: "Launch a token via Bankr agent" },
                  ]},
                  { label: "Task Hub", items: [
                    { name: "list-tasks",  desc: "List open tasks in the Work Hub" },
                    { name: "post-task",   desc: "Post a new task with USDC escrow" },
                    { name: "accept-task", desc: "Accept an open task" },
                    { name: "submit-task", desc: "Submit completed work and claim reward" },
                  ]},
                ].map((group) => (
                  <div key={group.label}>
                    <div className="flex items-center gap-3 mb-4">
                      <h2 className="font-mono text-sm font-semibold text-emerald-400">{group.label}</h2>
                      <span className="font-mono text-[10px] text-slate-700 border border-[#1A1A2E] px-1.5 rounded">free</span>
                      <div className="flex-1 h-px bg-[#1A1A2E]" />
                    </div>
                    <div className="space-y-2">
                      {group.items.map((t) => (
                        <div key={t.name} className="card-surface rounded-xl p-4 flex items-start gap-4">
                          <span className="font-mono text-sm font-semibold text-white min-w-[100px] shrink-0">{t.name}</span>
                          <span className="font-mono text-sm text-slate-500">{t.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── COMMANDS ───────────────────────────────── */}
          {section === "commands" && (
            <div className="space-y-10">
              {COMMANDS.map((group) => (
                <div key={group.group}>
                  <div className="flex items-center gap-3 mb-4">
                    <h2 className="font-mono text-sm font-semibold text-[#4FC3F7]">{group.group}</h2>
                    <div className="flex-1 h-px bg-[#1A1A2E]" />
                  </div>
                  <div className="space-y-3">
                    {group.items.map((item) => (
                      <div key={item.cmd} className="card-surface rounded-xl p-5">
                        <div className="flex flex-wrap items-baseline gap-2 mb-2">
                          <code className="font-mono text-sm font-semibold text-white">{item.cmd}</code>
                          <span className="font-mono text-xs text-slate-700">→</span>
                          <span className="font-mono text-xs text-[#4FC3F7]">{item.arrow}</span>
                        </div>
                        <p className="font-mono text-sm text-slate-400 mb-2 leading-relaxed">{item.desc}</p>
                        <div className="flex items-start gap-2">
                          <span className="font-mono text-xs text-slate-700 shrink-0">eg:</span>
                          <code className="font-mono text-xs text-slate-600">{item.example}</code>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── SKILLS ─────────────────────────────────── */}
          {section === "skills" && (
            <>
              <p className="font-mono text-sm text-slate-500 mb-8">
                Skill files ground every command in verified Base knowledge. Run{" "}
                <code className="text-[#4FC3F7]">blue init</code> to install all 6 to{" "}
                <code className="text-white">~/.blue-agent/skills/</code>.
              </p>
              <div className="space-y-3">
                {SKILLS.map((s) => (
                  <div key={s.file} className="card-surface rounded-xl p-5 grid sm:grid-cols-[220px_1fr] gap-3">
                    <code className="font-mono text-sm text-[#4FC3F7]">{s.file}</code>
                    <div>
                      <p className="font-mono text-sm text-slate-300 mb-1">{s.desc}</p>
                      <p className="font-mono text-xs text-slate-600">{s.grounds}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-8 card-surface rounded-xl p-5 inline-block">
                <code className="font-mono text-sm text-slate-500">
                  $ <span className="text-[#4FC3F7]">blue init</span>
                  <span className="text-slate-700 ml-3"># installs all 6 skills</span>
                </code>
              </div>
            </>
          )}
        </main>
      </div>
    </>
  );
}
