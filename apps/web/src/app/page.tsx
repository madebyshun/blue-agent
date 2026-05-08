import Navbar from "@/components/Navbar";

const COMMANDS = [
  {
    tag: "Idea",
    cmd: "blue idea",
    desc: "Turn a rough concept into a fundable brief — problem, why now, why Base, MVP scope, risks, 24h plan.",
    tags: ["base", "bankr", "brief"],
  },
  {
    tag: "Build",
    cmd: "blue build",
    desc: "Architecture, stack, folder structure, integrations, and test plan. Grounded in verified Base patterns. No hallucinated addresses.",
    tags: ["uniswap-v4", "x402", "base"],
  },
  {
    tag: "Audit",
    cmd: "blue audit",
    desc: "500+ security checks across 13 categories. Base-specific. Reentrancy, oracle, MEV, x402, Coinbase Smart Wallet edge cases.",
    tags: ["security", "base", "grounded"],
  },
  {
    tag: "Ship",
    cmd: "blue ship",
    desc: "Deployment checklist, verification steps, release notes, monitoring. Everything you forget when you're excited to launch.",
    tags: ["deploy", "verify", "monitor"],
  },
  {
    tag: "Raise",
    cmd: "blue raise",
    desc: "Fundraising narrative. Investor deck outline. Smart money map. Competitive landscape for your Base niche.",
    tags: ["pitch", "deck", "fundraise"],
  },
];

const SKILLS = [
  { file: "base-security.md",       note: "84 checks, 13 categories" },
  { file: "base-addresses.md",      note: "verified contracts on Base" },
  { file: "base-standards.md",      note: "ERC standards, Base patterns" },
  { file: "bankr-tools.md",         note: "Bankr LLM + x402 patterns" },
  { file: "blue-agent-identity.md", note: "mission + surfaces" },
  { file: "design-system.md",       note: "visual language" },
];

const COMING = [
  { icon: "🏗️", title: "Builder Score", desc: "Proof of build on Base" },
  { icon: "🤖", title: "Agent Score",   desc: "XP system for AI agents" },
  { icon: "🔧", title: "Work Hub",      desc: "Agents earn USDC via tasks" },
];

function Hero() {
  return (
    <section
      className="min-h-screen flex flex-col justify-center items-center px-6 pt-16 text-center"
      style={{
        backgroundImage:
          "linear-gradient(rgba(79,195,247,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(79,195,247,0.03) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }}
    >
      <p className="font-mono text-xs tracking-[0.3em] text-slate-500 mb-6 uppercase">
        BUILT ON BASE · POWERED BY BANKR LLM
      </p>

      <h1 className="font-mono text-5xl sm:text-7xl font-bold text-white tracking-tight mb-6">
        BLUE <span className="text-[#4FC3F7]">AGENT</span>
      </h1>

      <p className="font-mono text-sm sm:text-base text-slate-400 max-w-xl mb-10 leading-relaxed">
        The AI development layer for Base builders.<br />
        Idea, build, audit, ship, raise — grounded in real Base knowledge.
      </p>

      <div className="flex flex-wrap gap-3 justify-center mb-12">
        <a
          href="/console"
          className="font-mono text-sm font-semibold bg-[#4FC3F7] text-[#050508] px-5 py-2.5 rounded hover:bg-[#29ABE2] transition-colors"
        >
          Open Console →
        </a>
        <a
          href="https://github.com/madebyshun/blue-agent"
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-sm text-slate-400 border border-[#1A1A2E] px-5 py-2.5 rounded hover:border-[#4FC3F7]/30 hover:text-white transition-all"
        >
          View on GitHub
        </a>
      </div>

      <p className="font-mono text-xs text-slate-600 tracking-widest">
        v0.1 · 6 skills · 5 commands · Base
      </p>
    </section>
  );
}

function Engines() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-24">
      <p className="font-mono text-xs text-[#4FC3F7] mb-8">// the five engines</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {COMMANDS.map((c) => (
          <div key={c.tag} className="card-surface card-hover rounded-lg p-6">
            <div className="font-mono text-xs text-[#4FC3F7] mb-3">&lt;{c.tag}&gt;</div>
            <div className="font-mono text-sm text-white font-semibold mb-3">{c.cmd}</div>
            <p className="font-mono text-xs text-slate-500 leading-relaxed mb-4">{c.desc}</p>
            <div className="flex flex-wrap gap-1.5">
              {c.tags.map((t) => (
                <span
                  key={t}
                  className="font-mono text-[10px] text-slate-500 border border-[#1A1A2E] px-2 py-0.5 rounded"
                >
                  [{t}]
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
      <p className="font-mono text-xs text-[#4FC3F7] mb-2">// grounding contract</p>
      <p className="font-mono text-sm text-slate-400 mb-8">6 skill files bundled. Loaded before every command.</p>

      <div className="card-surface rounded-lg p-6 max-w-2xl">
        {/* terminal header */}
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#1A1A2E]">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
          <span className="font-mono text-xs text-slate-600 ml-2">~/.blue-agent/skills/</span>
        </div>
        {/* skill list */}
        <div className="space-y-2">
          {SKILLS.map((s) => (
            <div key={s.file} className="flex items-baseline gap-3">
              <span className="font-mono text-xs text-[#4FC3F7]">{s.file}</span>
              <span className="font-mono text-xs text-slate-600">→ {s.note}</span>
            </div>
          ))}
        </div>
        {/* install command */}
        <div className="mt-6 pt-4 border-t border-[#1A1A2E]">
          <span className="font-mono text-xs text-slate-500">$ </span>
          <span className="font-mono text-xs text-[#4FC3F7]">blue init</span>
          <span className="font-mono text-xs text-slate-600"> ← installs all skills to ~/.blue-agent/skills/</span>
        </div>
      </div>
    </section>
  );
}

function Install() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-24 border-t border-[#1A1A2E]">
      <p className="font-mono text-xs text-[#4FC3F7] mb-8">// quick start</p>
      <div className="card-surface rounded-lg p-6 max-w-lg">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#1A1A2E]">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
          <span className="font-mono text-xs text-slate-600 ml-2">terminal</span>
        </div>
        <div className="space-y-2 font-mono text-sm">
          <div>
            <span className="text-slate-600">$ </span>
            <span className="text-white">npm install -g @blueagent/builder</span>
          </div>
          <div>
            <span className="text-slate-600">$ </span>
            <span className="text-white">blue init</span>
          </div>
          <div>
            <span className="text-slate-600">$ </span>
            <span className="text-[#4FC3F7]">blue audit &quot;your project&quot;</span>
          </div>
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
        {COMING.map((item) => (
          <div key={item.title} className="card-surface rounded-lg p-6 flex flex-col gap-2">
            <span className="text-2xl">{item.icon}</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-white">{item.title}</span>
              <span className="font-mono text-[10px] text-[#4FC3F7] border border-[#4FC3F7]/30 px-1.5 py-0.5 rounded">soon</span>
            </div>
            <p className="font-mono text-xs text-slate-500">{item.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[#1A1A2E] px-6 py-12">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="font-mono text-xs text-slate-600 space-y-1">
            <p>$BLUEAGENT · <span className="text-slate-700">0xf895783b2931c919955e18b5e3343e7c7c456ba3</span></p>
            <p>Built on Base. Powered by Bankr LLM.</p>
          </div>
          <div className="flex items-center gap-4 font-mono text-xs text-slate-600">
            <a href="https://github.com/madebyshun/blue-agent" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">github</a>
            <a href="https://blueagent.dev" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">blueagent.dev</a>
            <a href="https://x.com/blocky_agent" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">@blocky_agent</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-[#050508] font-mono">
        <Hero />
        <Engines />
        <GroundingContract />
        <Install />
        <ComingSoon />
        <Footer />
      </main>
    </>
  );
}
