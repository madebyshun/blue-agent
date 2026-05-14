import Navbar from "@/components/Navbar";

const GRID_BG = {
  backgroundImage:
    "linear-gradient(rgba(79,195,247,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(79,195,247,0.03) 1px,transparent 1px)",
  backgroundSize: "40px 40px",
};

const COMMANDS_DOCS = [
  {
    group: "WORKFLOW",
    items: [
      { cmd: "blue idea [prompt]",   desc: "Turn a concept into a fundable brief — problem, why now, MVP, risks, 24h plan",     example: 'blue idea "NFT marketplace for Base agents"' },
      { cmd: "blue build [prompt]",  desc: "Architecture, stack, folder structure, integrations, test plan",                     example: 'blue build "Base-native staking protocol"' },
      { cmd: "blue audit [prompt]",  desc: "Security review — reentrancy, oracle, MEV, go/no-go verdict",                       example: 'blue audit "my Solidity contract"' },
      { cmd: "blue ship [prompt]",   desc: "Deployment checklist, verification, release notes, monitoring",                      example: 'blue ship "launch on Base mainnet"' },
      { cmd: "blue raise [prompt]",  desc: "Pitch narrative — why this wins, traction, ask, Base investor map",                  example: 'blue raise "Base DeFi protocol"' },
    ],
  },
  {
    group: "SETUP",
    items: [
      { cmd: "blue init",            desc: "Install 6 skill files to ~/.blue-agent/skills/ for local grounding",                example: "blue init" },
      { cmd: "blue new <name>",      desc: "Scaffold a new Base project from a template",                                       example: "blue new my-token --template base-token" },
    ],
  },
  {
    group: "SCORE",
    items: [
      { cmd: "blue score [handle]",        desc: "Builder Score for an X handle — activity, social, thesis (0-100)",            example: "blue score @blockyagent" },
      { cmd: "blue agent-score [input]",   desc: "@handle / npm:@pkg / github.com/repo / https://url → Agent Score",           example: "blue agent-score npm:@blueagent/builder" },
    ],
  },
  {
    group: "TASKS",
    items: [
      { cmd: "blue tasks",                       desc: "Browse open tasks. Filter by category: audit|content|art|data|dev",     example: "blue tasks --category audit" },
      { cmd: "blue post-task [handle]",          desc: "Post a task to the Work Hub (interactive)",                             example: "blue post-task @myhandle" },
      { cmd: "blue accept <taskId>",             desc: "Accept an open task from the Work Hub",                                 example: "blue accept task_abc123" },
      { cmd: "blue submit <taskId> <h> <proof>", desc: "Submit proof of work and earn XP + USDC",                              example: "blue submit task_abc123 @me https://github.com/..." },
    ],
  },
];

const SKILLS_DOCS = [
  { file: "base-security.md",       desc: "500+ security checks across 13 categories. Loaded for blue audit.",       install: "auto via blue init" },
  { file: "base-addresses.md",      desc: "Verified contract addresses on Base — USDC, WETH, Uniswap, Aave.",       install: "auto via blue init" },
  { file: "base-standards.md",      desc: "ERC standards, Base patterns, x402 protocol spec.",                      install: "auto via blue init" },
  { file: "bankr-tools.md",         desc: "Bankr LLM capabilities and all 31 x402 tools.",                          install: "auto via blue init" },
  { file: "blue-agent-identity.md", desc: "Blue Agent mission, product voice, do/don't rules.",                     install: "auto via blue init" },
  { file: "design-system.md",       desc: "Visual language, colors, card patterns, spacing.",                       install: "auto via blue init" },
];

function Section({ id, label, note, children }: { id: string; label: string; note?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="max-w-4xl mx-auto px-6 py-16 border-t border-[#1A1A2E]">
      <div className="flex items-baseline justify-between mb-8">
        <p className="font-mono text-xs text-[#4FC3F7]">{label}</p>
        {note && <p className="font-mono text-xs text-slate-700">{note}</p>}
      </div>
      {children}
    </section>
  );
}

export default function DocsPage() {
  return (
    <>
      <Navbar />
      <main className="bg-[#050508] font-mono pt-16" style={GRID_BG}>
        {/* Header */}
        <section className="max-w-4xl mx-auto px-6 py-16">
          <p className="font-mono text-xs tracking-[0.3em] text-slate-600 mb-3 uppercase">Documentation</p>
          <h1 className="font-mono text-4xl sm:text-5xl font-bold text-white mb-4">
            BLUE<span className="text-[#4FC3F7]">AGENT</span> Docs
          </h1>
          <p className="font-mono text-sm text-slate-500 max-w-xl mb-6">
            Everything you need to build, score, and ship on Base.
          </p>
          {/* TOC */}
          <nav className="card-surface rounded-lg p-4 inline-flex flex-col gap-1">
            {[
              { id: "#quickstart", label: "Quick Start" },
              { id: "#commands",   label: "Commands" },
              { id: "#skills",     label: "Skills" },
              { id: "#mcp",        label: "MCP Setup" },
              { id: "#api",        label: "API Reference" },
              { id: "#devs",       label: "For Developers" },
            ].map((item) => (
              <a key={item.id} href={item.id} className="font-mono text-[10px] text-slate-500 hover:text-[#4FC3F7] transition-colors">
                {item.label}
              </a>
            ))}
          </nav>
        </section>

        {/* 1 — Quick Start */}
        <Section id="quickstart" label="// 1. quick start" note="install + init + first command">
          <div className="card-surface rounded-lg p-5 max-w-md mb-6">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#1A1A2E]">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
              <span className="font-mono text-[10px] text-slate-700 ml-2">terminal</span>
            </div>
            <div className="space-y-2 font-mono text-sm">
              <div><span className="text-slate-700"># 1. install CLI</span></div>
              <div><span className="text-slate-700">$ </span><span className="text-white">npm install -g @blueagent/builder</span></div>
              <div className="pt-2"><span className="text-slate-700"># 2. install skill files</span></div>
              <div><span className="text-slate-700">$ </span><span className="text-white">blue init</span></div>
              <div className="pt-2"><span className="text-slate-700"># 3. run your first command</span></div>
              <div><span className="text-slate-700">$ </span><span className="text-[#4FC3F7]">blue idea &quot;DeFi protocol for Base&quot;</span></div>
            </div>
          </div>
          <p className="font-mono text-[10px] text-slate-600">
            Requires <span className="text-white">Node.js &gt;= 18</span>. No API key needed for core commands.
            Set <span className="text-white">BANKR_API_KEY</span> for Bankr agent tools.
          </p>
        </Section>

        {/* 2 — Commands */}
        <Section id="commands" label="// 2. commands" note="12 commands · all steps of the founder journey">
          <div className="space-y-10">
            {COMMANDS_DOCS.map((group) => (
              <div key={group.group}>
                <p className="font-mono text-[10px] text-slate-700 tracking-widest mb-4">{group.group}</p>
                <div className="space-y-3">
                  {group.items.map((item) => (
                    <div key={item.cmd} className="card-surface rounded p-4">
                      <p className="font-mono text-xs text-white font-semibold mb-1">{item.cmd}</p>
                      <p className="font-mono text-[10px] text-slate-500 mb-2">{item.desc}</p>
                      <div className="flex items-start gap-2">
                        <span className="font-mono text-[9px] text-slate-700 shrink-0">eg:</span>
                        <span className="font-mono text-[9px] text-[#4FC3F7]">{item.example}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* 3 — Skills */}
        <Section id="skills" label="// 3. skills" note="6 files · loaded before every command">
          <p className="font-mono text-[10px] text-slate-600 mb-6">
            Skill files are markdown documents that ground the LLM in verified Base knowledge.
            Run <span className="text-[#4FC3F7]">blue init</span> to install them to{" "}
            <span className="text-white">~/.blue-agent/skills/</span>.
          </p>
          <div className="space-y-2">
            {SKILLS_DOCS.map((s) => (
              <div key={s.file} className="card-surface rounded p-4 grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-2">
                <span className="font-mono text-xs text-[#4FC3F7]">{s.file}</span>
                <span className="font-mono text-[10px] text-slate-500">{s.desc}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* 4 — MCP Setup */}
        <Section id="mcp" label="// 4. mcp setup" note="Claude Code · Cursor · Claude Desktop">
          <div className="space-y-4">
            <div className="card-surface rounded-lg p-5 max-w-md">
              <p className="font-mono text-[10px] text-slate-700 mb-3">INSTALL</p>
              <div className="font-mono text-sm space-y-1">
                <div><span className="text-slate-700">$ </span><span className="text-white">npm install -g @blueagent/skill</span></div>
              </div>
            </div>
            <div className="card-surface rounded-lg p-5 max-w-md">
              <p className="font-mono text-[10px] text-slate-700 mb-3">CLAUDE CODE / CURSOR</p>
              <div className="font-mono text-xs text-slate-500 space-y-1">
                <p>Add to your MCP config (.mcp.json or settings):</p>
              </div>
              <pre className="font-mono text-[10px] text-[#4FC3F7] mt-2 overflow-x-auto">{`{
  "mcpServers": {
    "blueagent": {
      "command": "npx",
      "args": ["-y", "@blueagent/skill"]
    }
  }
}`}</pre>
            </div>
            <div className="card-surface rounded-lg p-5 max-w-md">
              <p className="font-mono text-[10px] text-slate-700 mb-3">AVAILABLE TOOLS</p>
              <div className="space-y-1">
                {["blue_idea", "blue_build", "blue_audit", "blue_ship", "blue_raise", "blue_score", "blue_new"].map((t) => (
                  <div key={t} className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-slate-600">·</span>
                    <span className="font-mono text-[10px] text-white">{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* 5 — API Reference */}
        <Section id="api" label="// 5. api reference" note="builder-score + agent-score">
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
    "activity": 22,
    "social": 25,
    "uniqueness": 18,
    "thesis": 15,
    "community": 7
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
    "skillDepth": 20,
    "onchainActivity": 18,
    "reliability": 15,
    "interoperability": 18,
    "reputation": 7
  },
  "strengths": [...],
  "gaps": [...]
}`,
              },
            ].map((api) => (
              <div key={api.endpoint} className="card-surface rounded-lg p-5">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="font-mono text-[10px] text-green-400/70 border border-green-400/20 px-1.5 rounded">{api.method}</span>
                  <span className="font-mono text-xs text-white">{api.endpoint}</span>
                </div>
                <p className="font-mono text-[10px] text-slate-500 mb-3">{api.desc}</p>
                <pre className="font-mono text-[9px] text-slate-600 overflow-x-auto leading-relaxed">{api.response}</pre>
              </div>
            ))}
          </div>
        </Section>

        {/* 6 — For Developers */}
        <Section id="devs" label="// 6. for developers" note="fork + extend + contribute">
          <div className="space-y-4 max-w-2xl">
            <div className="card-surface rounded-lg p-5">
              <p className="font-mono text-[10px] text-slate-700 mb-3">FORK AND RUN LOCALLY</p>
              <div className="font-mono text-sm space-y-1">
                <div><span className="text-slate-700">$ </span><span className="text-white">git clone https://github.com/madebyshun/blue-agent</span></div>
                <div><span className="text-slate-700">$ </span><span className="text-white">npm install</span></div>
                <div><span className="text-slate-700">$ </span><span className="text-white">npm run dev</span></div>
              </div>
            </div>
            <div className="card-surface rounded-lg p-5">
              <p className="font-mono text-[10px] text-slate-700 mb-3">PACKAGES</p>
              <div className="space-y-2">
                {[
                  { pkg: "@blueagent/core",       desc: "Runtime, skill loading, LLM calls" },
                  { pkg: "@blueagent/builder",     desc: "CLI — blue idea/build/audit/ship/raise" },
                  { pkg: "@blueagent/skill",       desc: "MCP server — 7 tools for Claude/Cursor" },
                  { pkg: "@blueagent/sdk",         desc: "Unified SDK — ba.builder.idea() etc." },
                  { pkg: "@blueagent/agentkit",    desc: "Coinbase AgentKit — 32 actions" },
                  { pkg: "@blueagent/vercel-ai",   desc: "Vercel AI SDK — 32 tools" },
                  { pkg: "blueagent-langchain",    desc: "Python · LangChain toolkit" },
                ].map((p) => (
                  <div key={p.pkg} className="flex items-baseline gap-3">
                    <span className="font-mono text-[10px] text-[#4FC3F7] shrink-0 min-w-[180px]">{p.pkg}</span>
                    <span className="font-mono text-[10px] text-slate-600">{p.desc}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card-surface rounded-lg p-5">
              <p className="font-mono text-[10px] text-slate-700 mb-3">ADD A SKILL FILE</p>
              <p className="font-mono text-[10px] text-slate-500 mb-2">
                Drop a <span className="text-white">.md</span> file in <span className="text-white">skills/</span> and register it in{" "}
                <span className="text-[#4FC3F7]">packages/core/src/registry.ts</span>.
              </p>
              <p className="font-mono text-[10px] text-slate-500">
                Skills are loaded from: <span className="text-white">BLUE_AGENT_SKILLS_DIR</span> →{" "}
                <span className="text-white">~/.blue-agent/skills/</span> → monorepo <span className="text-white">skills/</span>.
              </p>
            </div>
          </div>
        </Section>

        {/* Footer spacer */}
        <div className="border-t border-[#1A1A2E] px-6 py-10">
          <div className="max-w-4xl mx-auto flex flex-wrap gap-4">
            <a
              href="https://github.com/madebyshun/blue-agent"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] text-slate-700 hover:text-white transition-colors"
            >
              github
            </a>
            <a
              href="https://x.com/blocky_agent"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] text-slate-700 hover:text-white transition-colors"
            >
              @blocky_agent
            </a>
            <a
              href="https://t.me/blueagent_hub"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] text-slate-700 hover:text-white transition-colors"
            >
              telegram
            </a>
          </div>
        </div>
      </main>
    </>
  );
}
