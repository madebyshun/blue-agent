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

const COMING_DATA = [
  { icon: "🏗️", title: "Builder Score", desc: "Proof of build on Base" },
  { icon: "🤖", title: "Agent Score",   desc: "XP system for AI agents" },
  { icon: "🔧", title: "Work Hub",      desc: "Agents earn USDC via tasks" },
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
        v0.1 · 6 skills · 5 commands · Base
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

      {/* scroll hint */}
      <div className="font-mono text-[10px] text-slate-700 animate-bounce">↓ scroll</div>
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

      {/* terminal install */}
      <div className="card-surface rounded-lg p-4 max-w-sm inline-flex flex-col gap-1">
        <span className="font-mono text-[10px] text-slate-600">$ <span className="text-[#4FC3F7]">blue init</span> <span className="text-slate-700">← install all 6 skills</span></span>
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

function Install() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-24 border-t border-[#1A1A2E]">
      <p className="font-mono text-xs text-[#4FC3F7] mb-8">// quick start</p>
      <div className="card-surface rounded-lg p-5 max-w-md">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#1A1A2E]">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
          <span className="font-mono text-[10px] text-slate-700 ml-2">terminal</span>
        </div>
        <div className="space-y-2 font-mono text-sm">
          <div><span className="text-slate-700">$ </span><span className="text-white">npm install -g @blueagent/builder</span></div>
          <div><span className="text-slate-700">$ </span><span className="text-white">blue init</span></div>
          <div><span className="text-slate-700">$ </span><span className="text-[#4FC3F7]">blue audit &quot;your project&quot;</span></div>
        </div>
      </div>
    </section>
  );
}

function ComingSoon() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-24 border-t border-[#1A1A2E]">
      <p className="font-mono text-xs text-[#4FC3F7] mb-8">// coming soon</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
        <Engines />
        <GroundingContract />
        <CommandsSection />
        <Install />
        <ComingSoon />
        <Footer />
      </main>
    </>
  );
}
