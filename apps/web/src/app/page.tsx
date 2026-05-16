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

const ECOSYSTEM_LAYERS = [
  {
    layer: "SURFACE",
    label: "What users install",
    color: "#4FC3F7",
    packages: [
      {
        pkg: "@blueagent/cli",
        cmd: "blueagent",
        version: "v1.3.5",
        desc: "Terminal UI — interactive menu, navigate with arrow keys. 8 categories, 31+ tools.",
        install: "npm install -g @blueagent/cli",
        badge: "TUI",
      },
      {
        pkg: "@blueagent/builder",
        cmd: "blue",
        version: "v0.1.11",
        desc: "CLI — 5 core commands + setup + score + tasks. The workhorse.",
        install: "npm install -g @blueagent/builder",
        badge: "CLI",
      },
    ],
  },
  {
    layer: "CORE",
    label: "Runtime & data",
    color: "#A78BFA",
    packages: [
      {
        pkg: "@blueagent/core",
        cmd: null,
        version: "v1.0.1",
        desc: "Grounded LLM calls via Bankr · skill registry · command schemas.",
        install: "npm install @blueagent/core",
        badge: "Runtime",
      },
      {
        pkg: "@blueagent/reputation",
        cmd: null,
        version: "v0.1.1",
        desc: "Builder Score · Agent Score · Work Hub reputation system.",
        install: "npm install @blueagent/reputation",
        badge: "Score",
      },
      {
        pkg: "@blueagent/tasks",
        cmd: null,
        version: "v0.1.0",
        desc: "Work Hub — post tasks, earn USDC, build onchain reputation.",
        install: "npm install @blueagent/tasks",
        badge: "Tasks",
      },
    ],
  },
  {
    layer: "INTEGRATIONS",
    label: "Plug into any stack",
    color: "#34D399",
    packages: [
      {
        pkg: "@blueagent/skill",
        cmd: null,
        version: "v0.1.1",
        desc: "MCP server — 5 tools for Claude Code · Cursor · Claude Desktop.",
        install: "npm install -g @blueagent/skill",
        badge: "MCP",
      },
      {
        pkg: "@blueagent/sdk",
        cmd: null,
        version: "v0.1.0",
        desc: "Unified programmatic API — ba.builder.idea() and more.",
        install: "npm install @blueagent/sdk",
        badge: "SDK",
      },
      {
        pkg: "@blueagent/agentkit",
        cmd: null,
        version: "v0.1.0",
        desc: "Coinbase AgentKit plugin — 32 x402 tools as actions.",
        install: "npm install @blueagent/agentkit",
        badge: "AgentKit",
      },
      {
        pkg: "@blueagent/x402-guard",
        cmd: null,
        version: "v1.0.0",
        desc: "Security middleware for x402 payments — validate before you pay.",
        install: "npm install @blueagent/x402-guard",
        badge: "Security",
      },
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
      <div className="inline-flex items-center gap-2 border border-[#4FC3F7]/20 bg-[#4FC3F7]/5 rounded-full px-4 py-1.5 mb-8">
        <span className="w-2 h-2 rounded-full bg-[#4FC3F7] animate-pulse" />
        <span className="font-mono text-[10px] text-[#4FC3F7] tracking-widest">BUILT ON BASE · POWERED BY BANKR LLM</span>
      </div>

      <h1 className="font-mono text-6xl sm:text-8xl font-bold text-white tracking-tight mb-4 leading-none">
        BLUE<br /><span className="text-[#4FC3F7]">AGENT</span>
      </h1>

      <p className="font-mono text-base sm:text-lg text-slate-400 max-w-xl mb-3 leading-relaxed">
        The AI founder console for Base builders.
      </p>
      <p className="font-mono text-sm text-slate-600 max-w-lg mb-10 leading-relaxed">
        Idea → build → audit → ship → raise.
        Grounded in real Base knowledge. No hallucinations.
      </p>

      {/* Quick install — right in the hero */}
      <div className="flex items-center gap-2 bg-[#0D0D14] border border-[#1A1A2E] rounded-xl px-5 py-3 mb-8">
        <span className="font-mono text-xs text-slate-600">$</span>
        <span className="font-mono text-sm text-[#4FC3F7]">curl -fsSL https://blueagent.dev/setup.sh | bash</span>
      </div>
      <p className="font-mono text-[10px] text-slate-700 -mt-5 mb-8">
        installs <span className="text-slate-500">blueagent</span> (TUI) + <span className="text-slate-500">blue</span> (CLI) · Node ≥ 18
      </p>

      <div className="flex flex-wrap gap-3 justify-center mb-16">
        <a
          href="/console"
          className="font-mono text-sm font-semibold bg-[#4FC3F7] text-[#050508] px-6 py-3 rounded hover:bg-[#29ABE2] transition-colors"
        >
          Start building →
        </a>
        <a
          href="/docs"
          className="font-mono text-sm text-slate-500 border border-[#1A1A2E] px-6 py-3 rounded hover:border-[#4FC3F7]/30 hover:text-white transition-all"
        >
          Read docs →
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
    { n: "30", label: "Commands" },
    { n: "9",  label: "Packages" },
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
    <section id="commands" className="max-w-6xl mx-auto px-6 py-24 border-t border-[#1A1A2E] scroll-mt-28">
      <div className="mb-10">
        <p className="font-mono text-xs text-[#4FC3F7] tracking-widest mb-2">// THE FIVE ENGINES</p>
        <h2 className="font-mono text-3xl sm:text-4xl font-bold text-white mb-2">From idea to shipped.</h2>
        <p className="font-mono text-sm text-slate-500">5 commands · grounded by skill files · no hallucinations</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {COMMANDS_DATA.map((c) => (
          <div key={c.tag} className="card-surface card-hover rounded-lg p-6 flex flex-col gap-3">
            <div className="font-mono text-xs text-[#4FC3F7]">&lt;{c.tag}&gt;</div>
            <div className="font-mono text-base text-white font-semibold">{c.cmd}</div>
            <p className="font-mono text-sm text-slate-400 leading-relaxed">{c.desc}</p>
            <p className="font-mono text-xs text-slate-600">{c.detail}</p>
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
    <section id="skills" className="max-w-6xl mx-auto px-6 py-24 border-t border-[#1A1A2E] scroll-mt-28">
      <div className="mb-10">
        <p className="font-mono text-xs text-[#4FC3F7] tracking-widest mb-2">// GROUNDING CONTRACT</p>
        <h2 className="font-mono text-3xl sm:text-4xl font-bold text-white mb-2">Zero hallucinations.</h2>
        <p className="font-mono text-sm text-slate-500">6 skill files · loaded before every command · verified Base data only</p>
      </div>

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
    <section id="tools" className="max-w-6xl mx-auto px-6 py-24 border-t border-[#1A1A2E] scroll-mt-28">
      <div className="mb-10">
        <p className="font-mono text-xs text-[#4FC3F7] tracking-widest mb-2">// X402 SERVICES</p>
        <h2 className="font-mono text-3xl sm:text-4xl font-bold text-white mb-2">37 tools. Pay per use.</h2>
        <p className="font-mono text-sm text-slate-500">USDC on Base · no subscriptions · agents welcome</p>
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
      <div className="mb-10">
        <p className="font-mono text-xs text-[#4FC3F7] tracking-widest mb-2">// COMMANDS</p>
        <h2 className="font-mono text-3xl sm:text-4xl font-bold text-white mb-2">{total} commands.</h2>
        <p className="font-mono text-sm text-slate-500">Every step of the founder journey — idea to exit</p>
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

function EcosystemPackages() {
  return (
    <section id="ecosystem" className="max-w-6xl mx-auto px-6 py-24 border-t border-[#1A1A2E] scroll-mt-28">
      <div className="mb-10">
        <p className="font-mono text-xs text-[#4FC3F7] tracking-widest mb-2">// ECOSYSTEM</p>
        <h2 className="font-mono text-3xl sm:text-4xl font-bold text-white mb-2">9 packages. One ecosystem.</h2>
        <p className="font-mono text-sm text-slate-500">From TUI to SDK — every layer of the Blue Agent stack on npm</p>
      </div>

      <div className="space-y-10">
        {ECOSYSTEM_LAYERS.map((layer) => (
          <div key={layer.layer}>
            {/* Layer header */}
            <div className="flex items-center gap-3 mb-4">
              <span
                className="font-mono text-[10px] tracking-widest px-2 py-0.5 rounded border"
                style={{ color: layer.color, borderColor: `${layer.color}30`, background: `${layer.color}08` }}
              >
                {layer.layer}
              </span>
              <span className="font-mono text-xs text-slate-600">{layer.label}</span>
              <div className="flex-1 border-t border-dashed border-[#1A1A2E]" />
              <span className="font-mono text-[10px] text-slate-700">{layer.packages.length} packages</span>
            </div>

            {/* Package cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {layer.packages.map((p) => (
                <div key={p.pkg} className="card-surface rounded-lg p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-1">
                    <span className="font-mono text-xs text-white font-semibold leading-snug break-all">{p.pkg}</span>
                    <span
                      className="font-mono text-[9px] px-1.5 py-0.5 rounded shrink-0 mt-0.5"
                      style={{ color: layer.color, background: `${layer.color}12`, border: `1px solid ${layer.color}25` }}
                    >
                      {p.badge}
                    </span>
                  </div>
                  {p.cmd && (
                    <div className="font-mono text-[10px] text-[#4FC3F7]">$ {p.cmd}</div>
                  )}
                  <p className="font-mono text-[10px] text-slate-500 leading-relaxed flex-1">{p.desc}</p>
                  <div className="pt-2 border-t border-[#1A1A2E] flex items-center justify-between">
                    <span className="font-mono text-[9px] text-slate-700">{p.version}</span>
                    <span className="font-mono text-[9px] text-slate-700">npm →</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Architecture arrow */}
      <div className="mt-10 card-surface rounded-lg p-4 flex flex-col sm:flex-row items-center justify-center gap-2 text-center">
        <span className="font-mono text-[10px] text-[#4FC3F7]">@blueagent/cli</span>
        <span className="font-mono text-[10px] text-slate-700">→ wraps →</span>
        <span className="font-mono text-[10px] text-white">@blueagent/builder</span>
        <span className="font-mono text-[10px] text-slate-700">→ calls →</span>
        <span className="font-mono text-[10px] text-[#A78BFA]">@blueagent/core</span>
        <span className="font-mono text-[10px] text-slate-700">→ LLM via →</span>
        <span className="font-mono text-[10px] text-slate-400">Bankr LLM (Base)</span>
      </div>
    </section>
  );
}

function Integrations() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-24 border-t border-[#1A1A2E]">
      <div className="mb-10">
        <p className="font-mono text-xs text-[#4FC3F7] tracking-widest mb-2">// INTEGRATIONS</p>
        <h2 className="font-mono text-3xl sm:text-4xl font-bold text-white mb-2">Plug into any stack.</h2>
        <p className="font-mono text-sm text-slate-500">npm, pip, MCP, SDK — works where you already work</p>
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

function QuickStart() {
  return (
    <section id="quickstart" className="max-w-6xl mx-auto px-6 py-24 border-t border-[#1A1A2E] scroll-mt-28">
      <div className="mb-10">
        <p className="font-mono text-xs text-[#4FC3F7] tracking-widest mb-2">// QUICK START</p>
        <h2 className="font-mono text-3xl sm:text-4xl font-bold text-white mb-2">Ready in 2 minutes.</h2>
        <p className="font-mono text-sm text-slate-500">Install, init, and ship — that's the whole flow</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl">
        {/* CLI */}
        <div className="card-surface rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#1A1A2E] bg-[#0D0D14]">
            <span className="font-mono text-xs text-[#4FC3F7] font-semibold">blue CLI</span>
            <span className="font-mono text-[9px] text-green-400/70 border border-green-400/20 px-1.5 rounded">recommended</span>
          </div>
          <div className="p-4 space-y-2 font-mono text-sm">
            <div><span className="text-slate-700">$ </span><span className="text-white">npm i -g @blueagent/builder</span></div>
            <div><span className="text-slate-700">$ </span><span className="text-white">blue init</span></div>
            <div><span className="text-slate-700">$ </span><span className="text-[#4FC3F7]">blue idea "my Base project"</span></div>
          </div>
        </div>

        {/* TUI */}
        <div className="card-surface rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#1A1A2E] bg-[#0D0D14]">
            <span className="font-mono text-xs text-[#A78BFA] font-semibold">TUI — interactive</span>
            <span className="font-mono text-[9px] text-[#A78BFA]/70 border border-[#A78BFA]/20 px-1.5 rounded">visual</span>
          </div>
          <div className="p-4 space-y-2 font-mono text-sm">
            <div><span className="text-slate-700">$ </span><span className="text-white">npm i -g @blueagent/cli</span></div>
            <div><span className="text-slate-700">$ </span><span className="text-[#A78BFA]">blueagent</span></div>
            <div className="text-slate-700 text-xs">↑↓ navigate · Enter select</div>
          </div>
        </div>

        {/* One-liner */}
        <div className="card-surface rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#1A1A2E] bg-[#0D0D14]">
            <span className="font-mono text-xs text-[#34D399] font-semibold">One-liner</span>
            <span className="font-mono text-[9px] text-[#34D399]/60 border border-[#34D399]/20 px-1.5 rounded">setup.sh</span>
          </div>
          <div className="p-4 space-y-2 font-mono text-sm">
            <div className="text-slate-600 text-xs">installs CLI + TUI + skills</div>
            <div className="text-[#34D399] text-xs break-all">curl -fsSL https://blueagent.dev/setup.sh | bash</div>
          </div>
        </div>
      </div>

      <p className="font-mono text-xs text-slate-700 mt-6">
        verify: <span className="text-slate-500">blue doctor</span>
        {" · "}
        <a href="/docs" className="text-slate-500 hover:text-[#4FC3F7] transition-colors">full docs →</a>
        {" · "}
        <a href="/tools" className="text-slate-500 hover:text-[#4FC3F7] transition-colors">all 9 packages →</a>
      </p>
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
        <EcosystemPackages />
        <Integrations />
        <QuickStart />
        <Footer />
      </main>
    </>
  );
}
