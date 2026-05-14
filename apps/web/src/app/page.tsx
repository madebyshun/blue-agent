import Navbar from "@/components/Navbar";

const COMMANDS_DATA = [
  {
    tag: "Idea",
    cmd: "blue idea",
    desc: "Turn rough concept → fundable brief",
    detail: "Problem · Why Now · Why Base · MVP · Risks · 24h Plan",
    skills: ["base-standards", "bankr-tools"],
  },
  {
    tag: "Build",
    cmd: "blue build",
    desc: "Architecture, stack, folder structure, integrations, test plan",
    detail: "No hallucinated addresses. Verified Base patterns only.",
    skills: ["base-addresses", "base-standards", "bankr-tools"],
  },
  {
    tag: "Audit",
    cmd: "blue audit",
    desc: "500+ security checks · 13 categories · Base-native",
    detail: "Reentrancy · Oracle · MEV · x402 · Coinbase Smart Wallet",
    skills: ["base-security", "base-addresses"],
  },
  {
    tag: "Ship",
    cmd: "blue ship",
    desc: "Deployment checklist · Verification · Release notes · Monitoring",
    detail: "Everything you forget when excited to launch.",
    skills: ["base-standards", "base-addresses"],
  },
  {
    tag: "Raise",
    cmd: "blue raise",
    desc: "Fundraising narrative · Investor deck · Competitive landscape",
    detail: "Smart money map for Base ecosystem.",
    skills: ["blue-agent-identity", "base-standards"],
  },
];

const SKILLS_DATA = [
  { file: "base-security.md",       stat: "84 checks",     note: "13 categories" },
  { file: "base-addresses.md",      stat: "Verified",      note: "contracts on Base" },
  { file: "base-standards.md",      stat: "ERC standards", note: "Base patterns" },
  { file: "bankr-tools.md",         stat: "Bankr LLM",     note: "x402 patterns" },
  { file: "blue-agent-identity.md", stat: "Mission",       note: "surfaces + tone" },
  { file: "design-system.md",       stat: "Visual",        note: "language + components" },
];

const ALL_COMMANDS = [
  { group: "WORKFLOW", items: [
    { cmd: "blue idea",        arrow: "concept → brief" },
    { cmd: "blue build",       arrow: "brief → architecture" },
    { cmd: "blue audit",       arrow: "code → security review" },
    { cmd: "blue ship",        arrow: "project → deploy checklist" },
    { cmd: "blue raise",       arrow: "idea → fundraising narrative" },
  ]},
  { group: "SETUP", items: [
    { cmd: "blue init",        arrow: "install 6 skills to ~/.blue-agent/skills/" },
    { cmd: "blue new",         arrow: "scaffold base-agent | base-x402 | base-token" },
  ]},
  { group: "SCORE", items: [
    { cmd: "blue score",       arrow: "@handle → Builder Score" },
    { cmd: "blue agent-score", arrow: "@handle|npm|github → Agent Score" },
  ]},
  { group: "TASKS", items: [
    { cmd: "blue tasks",       arrow: "browse open tasks" },
    { cmd: "blue post-task",   arrow: "create task + escrow USDC" },
    { cmd: "blue accept",      arrow: "accept a task" },
    { cmd: "blue submit",      arrow: "submit proof + earn XP" },
  ]},
];

const X402_CATEGORIES = [
  {
    label: "Security",
    count: 8,
    tools: [
      { name: "honeypot-check",  price: "$0.01" },
      { name: "contract-audit",  price: "$0.05" },
      { name: "rug-pull-scan",   price: "$0.01" },
      { name: "wallet-risk",     price: "$0.01" },
      { name: "token-safety",    price: "$0.005" },
      { name: "lp-analysis",     price: "$0.02" },
      { name: "deployer-check",  price: "$0.01" },
      { name: "bytecode-scan",   price: "$0.03" },
    ],
  },
  {
    label: "Research",
    count: 7,
    tools: [
      { name: "deep-analysis",   price: "$0.001" },
      { name: "token-analysis",  price: "$0.005" },
      { name: "whale-tracker",   price: "$0.005" },
      { name: "holder-analysis", price: "$0.003" },
      { name: "social-signals",  price: "$0.002" },
      { name: "competitor-map",  price: "$0.01" },
      { name: "market-depth",    price: "$0.003" },
    ],
  },
  {
    label: "Launch",
    count: 6,
    tools: [
      { name: "launch-advisor",  price: "$0.01" },
      { name: "tokenomics",      price: "$0.01" },
      { name: "grant-evaluator", price: "$0.01" },
      { name: "community-fit",   price: "$0.005" },
      { name: "naming-check",    price: "$0.003" },
      { name: "pitch-score",     price: "$0.02" },
    ],
  },
  {
    label: "Premium",
    count: 5,
    tools: [
      { name: "wallet-pnl",      price: "$0.005" },
      { name: "risk-gate",       price: "$0.05" },
      { name: "quantum-premium", price: "$1.50" },
      { name: "builder-score",   price: "$0.001" },
      { name: "agent-score",     price: "$0.01" },
    ],
  },
];

const INTEGRATIONS = [
  {
    pkg: "@blueagent/skill",
    desc: "MCP server · Claude Code · Cursor · Claude Desktop",
    install: "npm install -g @blueagent/skill",
    lang: "npm",
  },
  {
    pkg: "@blueagent/sdk",
    desc: "Unified programmatic API",
    install: "npm install @blueagent/sdk",
    lang: "npm",
  },
  {
    pkg: "@blueagent/agentkit",
    desc: "Coinbase AgentKit · 32 tools as actions",
    install: "npm install @blueagent/agentkit",
    lang: "npm",
  },
  {
    pkg: "@blueagent/vercel-ai",
    desc: "Vercel AI SDK · Next.js ready",
    install: "npm install @blueagent/vercel-ai",
    lang: "npm",
  },
  {
    pkg: "blueagent-langchain",
    desc: "Python · LangChain toolkit",
    install: "pip install blueagent-langchain",
    lang: "pip",
  },
];

const ECOSYSTEM_ROWS = [
  {
    label: "Surfaces",
    items: [
      { name: "@blueagent/builder", note: "CLI" },
      { name: "blueagent.dev",      note: "Web" },
      { name: "@blockyagent_bot",   note: "Telegram" },
      { name: "@blueagent/skill",   note: "MCP" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { name: "Skills",    note: "6 knowledge files" },
      { name: "Tools",     note: "37 functions" },
      { name: "Commands",  note: "12 workflows" },
      { name: "Bankr LLM", note: "inference" },
    ],
  },
  {
    label: "Identity",
    items: [
      { name: "Builder Score", note: "proof of build" },
      { name: "Agent Score",   note: "XP system" },
      { name: "Work Hub",      note: "task marketplace" },
      { name: "Score Cards",   note: "soulbound NFT" },
    ],
  },
];

const BUILT_FOR = [
  {
    title: "For Builders",
    items: [
      { cmd: "blue audit",      arrow: "security review" },
      { cmd: "blue idea",       arrow: "concept brief" },
      { cmd: "Builder Score",   arrow: "reputation" },
      { cmd: "Score Card NFT",  arrow: "identity" },
    ],
  },
  {
    title: "For Agents",
    items: [
      { cmd: "Agent Score",       arrow: "XP system" },
      { cmd: "Work Hub",          arrow: "earn USDC" },
      { cmd: "blue agent-score",  arrow: "evaluate" },
      { cmd: "MCP server",        arrow: "IDE integration" },
    ],
  },
  {
    title: "For Projects",
    items: [
      { cmd: "Builder Score API", arrow: "credibility" },
      { cmd: "Community Kit",     arrow: "bot automation" },
      { cmd: "x402 tools",        arrow: "security checks" },
      { cmd: "Launch wizard",     arrow: "token deploy" },
    ],
  },
];

const ROADMAP = [
  {
    label: "SHIPPED",
    emoji: "✅",
    items: [
      "@blueagent/builder CLI",
      "31 x402 security tools",
      "@blueagent/skill MCP",
      "Builder Score API",
      "Agent Score + Work Hub",
    ],
  },
  {
    label: "BUILDING",
    emoji: "🔵",
    items: [
      "Builder Score web UI",
      "Agent Score + directory",
      "Work Hub marketplace",
      "Score Card NFT (soulbound)",
      "blueagent.dev launch",
    ],
  },
  {
    label: "NEXT",
    emoji: "🔜",
    items: [
      "Signal Bot (whale tracker)",
      "Score Cards (soulbound NFT)",
      "Mobile app",
      "Governance ($BLUEAGENT)",
      "SDK v2",
    ],
  },
];

const COMING_DATA = [
  { icon: "🏗️", title: "Builder Score", desc: "Proof of build on Base" },
  { icon: "🤖", title: "Agent Score",   desc: "XP system for AI agents" },
  { icon: "🔧", title: "Work Hub",      desc: "Agents earn USDC via tasks" },
  { icon: "📡", title: "Signal Bot",    desc: "Whale + builder signals" },
  { icon: "🃏", title: "Score Cards",   desc: "Soulbound NFT identity" },
];

const GRID_BG = {
  backgroundImage:
    "linear-gradient(rgba(79,195,247,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(79,195,247,0.03) 1px,transparent 1px)",
  backgroundSize: "40px 40px",
};

function Hero() {
  return (
    <section
      className="min-h-screen flex flex-col justify-center items-center px-6 pt-16 text-center"
      style={GRID_BG}
    >
      <p className="font-mono text-xs tracking-[0.3em] text-slate-600 mb-3 uppercase">
        BUILT ON BASE · POWERED BY BANKR LLM
      </p>
      <p className="font-mono text-[10px] tracking-widest text-slate-700 mb-8">
        v0.1 · 6 skills · 37 tools · 12 commands · Base
      </p>

      <h1 className="font-mono text-6xl sm:text-8xl font-bold text-white tracking-tight mb-6 leading-none">
        BLUE<br /><span className="text-[#4FC3F7]">AGENT</span>
      </h1>

      <p className="font-mono text-sm text-slate-500 max-w-lg mb-10 leading-relaxed">
        The AI development layer for Base builders.<br />
        Idea, build, audit, ship, raise —<br />
        grounded in real Base knowledge.
      </p>

      <div className="flex flex-wrap gap-3 justify-center mb-16">
        <a
          href="/console"
          className="font-mono text-sm font-semibold bg-[#4FC3F7] text-[#050508] px-6 py-3 rounded hover:bg-[#29ABE2] transition-colors"
        >
          Open Console →
        </a>
        <a
          href="https://github.com/madebyshun/blue-agent"
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-sm text-slate-500 border border-[#1A1A2E] px-6 py-3 rounded hover:border-[#4FC3F7]/30 hover:text-white transition-all"
        >
          GitHub
        </a>
      </div>

      <div className="font-mono text-[10px] text-slate-700 animate-bounce">↓ scroll</div>
    </section>
  );
}

function StatsBar() {
  const stats = [
    { n: "6",  label: "Skills" },
    { n: "37", label: "Tools" },
    { n: "12", label: "Commands" },
    { n: "5",  label: "Packages" },
    { n: "Base", label: "" },
  ];
  return (
    <section className="border-y border-[#1A1A2E] bg-[#0D0D14]/60">
      <div className="max-w-6xl mx-auto px-6 py-4 flex flex-wrap items-center justify-center gap-0">
        {stats.map((s, i) => (
          <div key={s.n + s.label} className="flex items-center">
            <span className="font-mono text-xs text-white">
              <span className="text-[#4FC3F7] font-semibold">{s.n}</span>
              {s.label && <span className="text-slate-500"> {s.label}</span>}
            </span>
            {i < stats.length - 1 && (
              <span className="font-mono text-slate-800 mx-4">·</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function Engines() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-24 border-t border-[#1A1A2E]">
      <div className="flex items-baseline justify-between mb-10">
        <p className="font-mono text-xs text-[#4FC3F7]">// the five engines</p>
        <p className="font-mono text-xs text-slate-700">5 commands · grounded by skill files</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {COMMANDS_DATA.map((c) => (
          <div key={c.tag} className="card-surface card-hover rounded-lg p-6 flex flex-col gap-3">
            <div className="font-mono text-xs text-[#4FC3F7]">&lt;{c.tag}&gt;</div>
            <div className="font-mono text-sm text-white font-semibold">{c.cmd}</div>
            <p className="font-mono text-xs text-slate-400 leading-relaxed">{c.desc}</p>
            <p className="font-mono text-[10px] text-slate-600">{c.detail}</p>
            <div className="flex flex-wrap gap-1 mt-auto pt-2 border-t border-[#1A1A2E]">
              <span className="font-mono text-[9px] text-slate-700">skills:</span>
              {c.skills.map((s) => (
                <span key={s} className="font-mono text-[9px] text-slate-600 border border-[#1A1A2E] px-1.5 py-0.5 rounded">
                  [{s}]
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function GroundingContract() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-24 border-t border-[#1A1A2E]">
      <div className="flex items-baseline justify-between mb-3">
        <p className="font-mono text-xs text-[#4FC3F7]">// grounding contract</p>
        <p className="font-mono text-xs text-slate-700">6 skill files · loaded before every command</p>
      </div>
      <p className="font-mono text-xs text-slate-600 mb-10">Zero hallucinations. Loaded before every command.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
        {SKILLS_DATA.map((s) => (
          <div key={s.file} className="card-surface rounded-lg p-4 flex flex-col gap-1">
            <span className="font-mono text-xs text-[#4FC3F7]">{s.file}</span>
            <div className="flex gap-2 mt-1">
              <span className="font-mono text-[10px] text-white">{s.stat}</span>
              <span className="font-mono text-[10px] text-slate-600">·</span>
              <span className="font-mono text-[10px] text-slate-600">{s.note}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="card-surface rounded-lg p-4 max-w-sm inline-flex flex-col gap-1">
        <span className="font-mono text-[10px] text-slate-600">$ <span className="text-[#4FC3F7]">blue init</span> <span className="text-slate-700">← install all 6 skills</span></span>
      </div>
    </section>
  );
}

function X402Services() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-24 border-t border-[#1A1A2E]">
      <div className="flex items-baseline justify-between mb-10">
        <p className="font-mono text-xs text-[#4FC3F7]">// x402 services</p>
        <p className="font-mono text-xs text-slate-700">37 tools · pay-per-use · USDC on Base</p>
      </div>

      {/* x402 Tools — 4 categories */}
      <div className="mb-6">
        <p className="font-mono text-[10px] text-slate-700 tracking-widest mb-4">x402 TOOLS (31) — USDC per call</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {X402_CATEGORIES.map((cat) => (
            <div key={cat.label} className="card-surface rounded-lg p-4">
              <div className="flex items-baseline justify-between mb-3">
                <span className="font-mono text-xs text-white">{cat.label}</span>
                <span className="font-mono text-[10px] text-slate-600">({cat.count})</span>
              </div>
              <div className="space-y-1.5">
                {cat.tools.map((t) => (
                  <div key={t.name} className="flex items-baseline justify-between">
                    <span className="font-mono text-[10px] text-slate-500">{t.name}</span>
                    <span className="font-mono text-[10px] text-[#4FC3F7]">{t.price}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bankr Agent Tools */}
      <div className="mb-4">
        <p className="font-mono text-[10px] text-slate-700 tracking-widest mb-3">BANKR AGENT TOOLS (4) — free with BANKR_API_KEY</p>
        <div className="card-surface rounded-lg p-4 inline-flex flex-wrap gap-x-4 gap-y-1">
          {["***", "transfer", "portfolio", "launch-token"].map((t) => (
            <span key={t} className="font-mono text-[10px] text-slate-500">{t}</span>
          ))}
        </div>
      </div>

      {/* Task Hub Tools */}
      <div className="mb-8">
        <p className="font-mono text-[10px] text-slate-700 tracking-widest mb-3">TASK HUB TOOLS (4) — free</p>
        <div className="card-surface rounded-lg p-4 inline-flex flex-wrap gap-x-4 gap-y-1">
          {["list-tasks", "post-task", "accept-task", "submit-task"].map((t) => (
            <span key={t} className="font-mono text-[10px] text-slate-500">{t}</span>
          ))}
        </div>
      </div>

      <div className="font-mono text-[10px] text-slate-700">
        x402 endpoint: <span className="text-slate-500">x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/&lt;service&gt;</span>
      </div>
    </section>
  );
}

function CommandsSection() {
  const total = ALL_COMMANDS.reduce((sum, g) => sum + g.items.length, 0);
  return (
    <section className="max-w-6xl mx-auto px-6 py-24 border-t border-[#1A1A2E]">
      <div className="flex items-baseline justify-between mb-10">
        <p className="font-mono text-xs text-[#4FC3F7]">// commands</p>
        <p className="font-mono text-xs text-slate-700">{total} commands · every step of the founder journey</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
        {ALL_COMMANDS.map((group) => (
          <div key={group.group}>
            <p className="font-mono text-[10px] text-slate-700 tracking-widest mb-3">{group.group}</p>
            <div className="space-y-2">
              {group.items.map((item) => (
                <div key={item.cmd} className="flex items-baseline gap-2">
                  <span className="font-mono text-xs text-white shrink-0">{item.cmd}</span>
                  <span className="font-mono text-[10px] text-slate-700">→</span>
                  <span className="font-mono text-[10px] text-slate-500">{item.arrow}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Integrations() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-24 border-t border-[#1A1A2E]">
      <div className="flex items-baseline justify-between mb-10">
        <p className="font-mono text-xs text-[#4FC3F7]">// integrations</p>
        <p className="font-mono text-xs text-slate-700">plug into any stack</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {INTEGRATIONS.map((pkg) => (
          <div key={pkg.pkg} className="card-surface card-hover rounded-lg p-5 flex flex-col gap-3">
            <div>
              <span className="font-mono text-xs text-white font-semibold">{pkg.pkg}</span>
            </div>
            <p className="font-mono text-[10px] text-slate-500 leading-relaxed">{pkg.desc}</p>
            <div className="mt-auto pt-3 border-t border-[#1A1A2E]">
              <span className="font-mono text-[9px] text-slate-700 mr-2">{pkg.lang === "pip" ? "pip" : "$"}</span>
              <span className="font-mono text-[10px] text-[#4FC3F7]">{pkg.install}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function EcosystemMap() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-24 border-t border-[#1A1A2E]">
      <div className="flex items-baseline justify-between mb-10">
        <p className="font-mono text-xs text-[#4FC3F7]">// ecosystem</p>
        <p className="font-mono text-xs text-slate-700">one platform · many surfaces</p>
      </div>

      <div className="space-y-6">
        {ECOSYSTEM_ROWS.map((row) => (
          <div key={row.label}>
            <p className="font-mono text-[10px] text-slate-700 tracking-widest mb-3">{row.label.toUpperCase()}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {row.items.map((item) => (
                <div key={item.name} className="card-surface rounded-lg p-3 flex flex-col gap-1">
                  <span className="font-mono text-xs text-white">{item.name}</span>
                  <span className="font-mono text-[10px] text-slate-600">{item.note}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function BuiltFor() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-24 border-t border-[#1A1A2E]">
      <div className="flex items-baseline justify-between mb-10">
        <p className="font-mono text-xs text-[#4FC3F7]">// built for</p>
        <p className="font-mono text-xs text-slate-700">three types of builders</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {BUILT_FOR.map((col) => (
          <div key={col.title}>
            <p className="font-mono text-[10px] text-slate-700 tracking-widest mb-4">{col.title.toUpperCase()}</p>
            <div className="space-y-2.5">
              {col.items.map((item) => (
                <div key={item.cmd} className="flex items-baseline gap-2">
                  <span className="font-mono text-xs text-white shrink-0">{item.cmd}</span>
                  <span className="font-mono text-[10px] text-slate-700">→</span>
                  <span className="font-mono text-[10px] text-slate-500">{item.arrow}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Roadmap() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-24 border-t border-[#1A1A2E]">
      <div className="flex items-baseline justify-between mb-10">
        <p className="font-mono text-xs text-[#4FC3F7]">// roadmap</p>
        <p className="font-mono text-xs text-slate-700">building in public</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {ROADMAP.map((col) => (
          <div key={col.label} className="card-surface rounded-lg p-5">
            <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-4">
              {col.label} {col.emoji}
            </p>
            <div className="space-y-2">
              {col.items.map((item) => (
                <div key={item} className="flex items-start gap-2">
                  <span className="font-mono text-[10px] text-slate-700 mt-0.5">·</span>
                  <span className="font-mono text-[10px] text-slate-400">{item}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Install() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-24 border-t border-[#1A1A2E]">
      <div className="flex items-baseline justify-between mb-8">
        <p className="font-mono text-xs text-[#4FC3F7]">// quick start</p>
        <p className="font-mono text-xs text-slate-700">ready in &lt; 2 minutes</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 max-w-2xl">
        {/* Option A — one-liner */}
        <div className="flex-1 card-surface rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#1A1A2E] bg-[#0D0D14]">
            <span className="font-mono text-[10px] text-[#4FC3F7] font-semibold">Quick Install</span>
            <span className="font-mono text-[9px] text-green-400/70 border border-green-400/20 px-1.5 rounded">recommended</span>
          </div>
          <div className="p-4">
            <p className="font-mono text-[10px] text-slate-600 mb-3">one command — installs everything</p>
            <div className="flex items-center gap-2">
              <span className="text-slate-700 font-mono text-xs">$</span>
              <span className="font-mono text-xs text-[#4FC3F7] break-all">
                curl -fsSL https://blueagent.dev/setup.sh | bash
              </span>
            </div>
          </div>
        </div>

        {/* Option B — manual */}
        <div className="flex-1 card-surface rounded-lg overflow-hidden">
          <div className="flex items-center px-4 py-2 border-b border-[#1A1A2E] bg-[#0D0D14]">
            <span className="font-mono text-[10px] text-slate-500">Manual</span>
          </div>
          <div className="p-4 space-y-1.5 font-mono text-xs">
            <div><span className="text-slate-700">$ </span><span className="text-white">npm install -g @blueagent/builder</span></div>
            <div><span className="text-slate-700">$ </span><span className="text-white">blue init</span></div>
            <div><span className="text-slate-700">$ </span><span className="text-[#4FC3F7]">blue audit &quot;your project&quot;</span></div>
          </div>
        </div>
      </div>

      <p className="font-mono text-[10px] text-slate-700 mt-4">
        verify setup: <span className="text-slate-500">blue doctor</span>
      </p>
    </section>
  );
}

function ComingSoon() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-24 border-t border-[#1A1A2E]">
      <p className="font-mono text-xs text-[#4FC3F7] mb-8">// coming soon</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {COMING_DATA.map((item) => (
          <div key={item.title} className="card-surface rounded-lg p-5 flex flex-col gap-2">
            <span className="text-xl">{item.icon}</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-white">{item.title}</span>
              <span className="font-mono text-[9px] text-[#4FC3F7] border border-[#4FC3F7]/30 px-1.5 py-0.5 rounded">soon</span>
            </div>
            <p className="font-mono text-[10px] text-slate-600">{item.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[#1A1A2E] px-6 py-10">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="font-mono text-[10px] text-slate-700 space-y-1">
          <p>$BLUEAGENT · <span className="text-slate-800">0xf895783b2931c919955e18b5e3343e7c7c456ba3</span></p>
          <p>Built on Base. Powered by Bankr LLM.</p>
        </div>
        <div className="flex items-center gap-4 font-mono text-[10px] text-slate-700">
          <a href="https://github.com/madebyshun/blue-agent" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">github</a>
          <a href="https://t.me/blueagent_hub" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">telegram</a>
          <a href="https://npmjs.com/package/@blueagent/builder" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">npm</a>
          <a href="https://blueagent.dev" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">blueagent.dev</a>
          <a href="https://x.com/blocky_agent" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">@blocky_agent</a>
        </div>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <>
      <Navbar />
      <main className="bg-[#050508] font-mono">
        <Hero />
        <StatsBar />
        <Engines />
        <GroundingContract />
        <X402Services />
        <CommandsSection />
        <Integrations />
        <EcosystemMap />
        <BuiltFor />
        <Roadmap />
        <Install />
        <ComingSoon />
        <Footer />
      </main>
    </>
  );
}
