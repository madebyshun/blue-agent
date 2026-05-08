import Navbar from "@/components/Navbar";

const SKILLS = [
  { file: "base-security.md",       desc: "500+ security checks across 13 attack categories",         grounds: "Reentrancy, oracle, MEV, x402, Coinbase Smart Wallet patterns" },
  { file: "base-addresses.md",      desc: "Verified contract addresses on Base mainnet",               grounds: "USDC, WETH, Uniswap v3/v4, Aave, Compound, Clanker" },
  { file: "base-standards.md",      desc: "ERC standards and Base-native development patterns",        grounds: "ERC-20, ERC-721, ERC-4337, ERC-7702, x402 payment protocol" },
  { file: "bankr-tools.md",         desc: "Bankr LLM capabilities and x402 tool catalog",             grounds: "All 31 paid tools, endpoints, pricing, usage examples" },
  { file: "blue-agent-identity.md", desc: "Blue Agent mission, surfaces, tone, and values",           grounds: "Product positioning, voice, do/don't rules" },
  { file: "design-system.md",       desc: "Visual language and UI component patterns",                grounds: "Color palette, typography, card patterns, spacing system" },
];

const X402_TOOLS = [
  {
    category: "Security (8)",
    tools: [
      { name: "honeypot-check",  price: "$0.01",  desc: "Detect honeypot tokens that can't be sold after purchase",       example: "honeypot-check?token=0x..." },
      { name: "contract-audit",  price: "$0.05",  desc: "Full smart contract audit — reentrancy, overflow, access control", example: "contract-audit?address=0x..." },
      { name: "rug-pull-scan",   price: "$0.01",  desc: "Score a token's rug pull risk — liquidity, ownership, mint",      example: "rug-pull-scan?token=0x..." },
      { name: "wallet-risk",     price: "$0.01",  desc: "Risk score a wallet — history, counterparties, flagged activity", example: "wallet-risk?address=0x..." },
      { name: "token-safety",    price: "$0.005", desc: "Quick token safety check — tax, blacklist, renounced ownership",  example: "token-safety?token=0x..." },
      { name: "lp-analysis",     price: "$0.02",  desc: "Analyze LP positions — impermanent loss, fees, rebalancing",     example: "lp-analysis?address=0x..." },
      { name: "deployer-check",  price: "$0.01",  desc: "Check a contract deployer's history and risk pattern",           example: "deployer-check?address=0x..." },
      { name: "bytecode-scan",   price: "$0.03",  desc: "Static bytecode analysis — known malicious patterns",            example: "bytecode-scan?address=0x..." },
    ],
  },
  {
    category: "Research (7)",
    tools: [
      { name: "deep-analysis",   price: "$0.001", desc: "Comprehensive token fundamentals — on-chain activity, risk",     example: "deep-analysis?token=0x..." },
      { name: "token-analysis",  price: "$0.005", desc: "Token metrics — holder count, distribution, volume trends",      example: "token-analysis?token=0x..." },
      { name: "whale-tracker",   price: "$0.005", desc: "Track large wallet movements for a token",                       example: "whale-tracker?token=0x..." },
      { name: "holder-analysis", price: "$0.003", desc: "Analyze holder distribution and concentration risk",             example: "holder-analysis?token=0x..." },
      { name: "social-signals",  price: "$0.002", desc: "Social sentiment and narrative pulse for a token or topic",      example: "social-signals?topic=base" },
      { name: "competitor-map",  price: "$0.01",  desc: "Map competing projects and positioning in a sector",             example: "competitor-map?sector=DeFi" },
      { name: "market-depth",    price: "$0.003", desc: "DEX order book depth and liquidity analysis",                    example: "market-depth?token=0x..." },
    ],
  },
  {
    category: "Launch (6)",
    tools: [
      { name: "launch-advisor",  price: "$0.01",  desc: "AI launch strategy — timing, pricing, distribution",            example: "launch-advisor?project=Blue+Agent" },
      { name: "tokenomics",      price: "$0.01",  desc: "Score a token's economic model — supply, vesting, sustainability", example: "tokenomics?token=0x..." },
      { name: "grant-evaluator", price: "$0.01",  desc: "Evaluate grant eligibility and fit for Base ecosystem",          example: "grant-evaluator?url=https://..." },
      { name: "community-fit",   price: "$0.005", desc: "Community fit analysis — Discord, Telegram, X signals",          example: "community-fit?project=..." },
      { name: "naming-check",    price: "$0.003", desc: "Check name availability and brand uniqueness",                   example: "naming-check?name=BlueAgent" },
      { name: "pitch-score",     price: "$0.02",  desc: "Score a pitch deck or project narrative",                       example: "pitch-score?url=https://..." },
    ],
  },
  {
    category: "Premium (5)",
    tools: [
      { name: "wallet-pnl",      price: "$0.005", desc: "Realized and unrealized PnL across all positions",              example: "wallet-pnl?address=0x..." },
      { name: "risk-gate",       price: "$0.05",  desc: "Screen any transaction before execution — rug/malicious check",  example: "risk-gate?action=transfer&to=0x..." },
      { name: "quantum-premium", price: "$1.50",  desc: "Deep quantum-readiness analysis — entropy, migration plan",     example: "quantum-premium?address=0x..." },
      { name: "builder-score",   price: "$0.001", desc: "Builder Score for an X/Twitter handle (0-100)",                 example: "builder-score?handle=vitalik" },
      { name: "agent-score",     price: "$0.01",  desc: "Agent Score — XP system for AI agents on Base",                 example: "agent-score?handle=blue-agent" },
    ],
  },
];

const BANKR_TOOLS = [
  { name: "***",          desc: "Wildcard — any Bankr agent action",                   free: true },
  { name: "transfer",     desc: "Transfer tokens via Bankr agent",                     free: true },
  { name: "portfolio",    desc: "Fetch wallet portfolio via Bankr agent",              free: true },
  { name: "launch-token", desc: "Launch a token via Bankr agent",                     free: true },
];

const TASK_TOOLS = [
  { name: "list-tasks",   desc: "List open tasks in the Work Hub",                    free: true },
  { name: "post-task",    desc: "Post a new task with USDC escrow",                   free: true },
  { name: "accept-task",  desc: "Accept an open task",                                free: true },
  { name: "submit-task",  desc: "Submit completed work and claim reward",             free: true },
];

const COMMANDS = [
  {
    group: "WORKFLOW",
    items: [
      { cmd: "blue idea [prompt]",        arrow: "concept → brief",          desc: "Turn a rough idea into a fundable brief with problem, why now, MVP, risks",          example: 'blue idea "NFT marketplace for AI agents"' },
      { cmd: "blue build [prompt]",       arrow: "brief → architecture",     desc: "Generate architecture, stack, folder structure, integrations, and test plan",        example: 'blue build "Base-native DEX"' },
      { cmd: "blue audit [prompt]",       arrow: "code → security review",   desc: "Security and product risk review — critical issues, suggested fixes, go/no-go",      example: 'blue audit "my ERC-20 contract"' },
      { cmd: "blue ship [prompt]",        arrow: "project → deploy checklist",desc: "Deployment checklist, verification steps, release notes, monitoring plan",          example: 'blue ship "launch on Base mainnet"' },
      { cmd: "blue raise [prompt]",       arrow: "idea → fundraising narrative",desc: "Pitch narrative — market framing, why this wins, traction, ask, target investors", example: 'blue raise "Base DeFi protocol"' },
    ],
  },
  {
    group: "SETUP",
    items: [
      { cmd: "blue init",                 arrow: "install 6 skills",         desc: "Install all 6 skill files to ~/.blue-agent/skills/ for local grounding",             example: "blue init" },
      { cmd: "blue new <name>",           arrow: "scaffold project",         desc: "Scaffold a new Base project from template: base-agent | base-x402 | base-token",     example: "blue new my-token --template base-token" },
    ],
  },
  {
    group: "SCORE",
    items: [
      { cmd: "blue score [handle]",       arrow: "@handle → Builder Score",  desc: "Builder Score for an X/Twitter handle — activity, social, thesis (0-100)",          example: "blue score @vitalik" },
      { cmd: "blue agent-score [input]",  arrow: "@handle|npm|github → Agent Score", desc: "Agent Score — @handle / npm:@pkg / github.com/repo / https://url",           example: "blue agent-score npm:@blueagent/builder" },
    ],
  },
  {
    group: "TASKS",
    items: [
      { cmd: "blue tasks",                arrow: "browse open tasks",        desc: "Browse open tasks in the Work Hub. Filter by category.",                             example: "blue tasks --category audit" },
      { cmd: "blue post-task [handle]",   arrow: "create task + escrow USDC",desc: "Post a task to the Work Hub interactively — set reward, difficulty, deadline",       example: "blue post-task @myhandle" },
      { cmd: "blue accept <taskId>",      arrow: "accept a task",            desc: "Accept an open task from the Work Hub",                                              example: "blue accept task_abc123" },
      { cmd: "blue submit <taskId> <handle> <proof>", arrow: "submit proof + earn XP", desc: "Submit completed work with proof URL and earn XP + USDC",                  example: "blue submit task_abc123 @me https://github.com/..." },
    ],
  },
];

const GRID_BG = {
  backgroundImage:
    "linear-gradient(rgba(79,195,247,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(79,195,247,0.03) 1px,transparent 1px)",
  backgroundSize: "40px 40px",
};

export default function ToolsPage() {
  return (
    <>
      <Navbar />
      <main className="bg-[#050508] font-mono pt-16" style={GRID_BG}>
        {/* Header */}
        <section className="max-w-6xl mx-auto px-6 py-16">
          <p className="font-mono text-xs tracking-[0.3em] text-slate-600 mb-3 uppercase">Reference</p>
          <h1 className="font-mono text-4xl sm:text-5xl font-bold text-white mb-4">
            BLUE<span className="text-[#4FC3F7]">AGENT</span> Tools
          </h1>
          <p className="font-mono text-sm text-slate-500 max-w-xl">
            6 skill files · 37 tools · 12 commands — everything Blue Agent knows and can do.
          </p>
        </section>

        {/* Section 1 — Skills */}
        <section className="max-w-6xl mx-auto px-6 py-16 border-t border-[#1A1A2E]">
          <div className="flex items-baseline justify-between mb-8">
            <p className="font-mono text-xs text-[#4FC3F7]">// skills (6)</p>
            <p className="font-mono text-xs text-slate-700">loaded before every command · zero hallucinations</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1A1A2E]">
                  <th className="font-mono text-[10px] text-slate-700 text-left py-2 pr-6">FILE</th>
                  <th className="font-mono text-[10px] text-slate-700 text-left py-2 pr-6">DESCRIPTION</th>
                  <th className="font-mono text-[10px] text-slate-700 text-left py-2">WHAT IT GROUNDS</th>
                </tr>
              </thead>
              <tbody>
                {SKILLS.map((s) => (
                  <tr key={s.file} className="border-b border-[#1A1A2E]/50 hover:bg-[#0D0D14]/50 transition-colors">
                    <td className="font-mono text-xs text-[#4FC3F7] py-3 pr-6 whitespace-nowrap">{s.file}</td>
                    <td className="font-mono text-[10px] text-slate-400 py-3 pr-6">{s.desc}</td>
                    <td className="font-mono text-[10px] text-slate-600 py-3">{s.grounds}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 2 — Tools */}
        <section className="max-w-6xl mx-auto px-6 py-16 border-t border-[#1A1A2E]">
          <div className="flex items-baseline justify-between mb-8">
            <p className="font-mono text-xs text-[#4FC3F7]">// tools (37)</p>
            <p className="font-mono text-xs text-slate-700">x402 · Bankr · TaskHub</p>
          </div>

          {/* x402 categories */}
          <div className="space-y-10 mb-10">
            {X402_TOOLS.map((cat) => (
              <div key={cat.category}>
                <p className="font-mono text-[10px] text-slate-700 tracking-widest mb-4">{cat.category}</p>
                <div className="space-y-2">
                  {cat.tools.map((t) => (
                    <div key={t.name} className="card-surface rounded p-3 grid grid-cols-1 sm:grid-cols-[140px_1fr_180px] gap-2 sm:gap-4 items-start">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-white">{t.name}</span>
                        <span className="font-mono text-[9px] text-[#4FC3F7] border border-[#4FC3F7]/30 px-1 rounded">{t.price}</span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-500">{t.desc}</span>
                      <span className="font-mono text-[9px] text-slate-700">{t.example}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Bankr tools */}
          <div className="mb-8">
            <p className="font-mono text-[10px] text-slate-700 tracking-widest mb-4">BANKR AGENT TOOLS — free with BANKR_API_KEY</p>
            <div className="space-y-2">
              {BANKR_TOOLS.map((t) => (
                <div key={t.name} className="card-surface rounded p-3 flex items-center gap-4">
                  <div className="flex items-center gap-2 min-w-[120px]">
                    <span className="font-mono text-xs text-white">{t.name}</span>
                    <span className="font-mono text-[9px] text-green-500/70 border border-green-500/20 px-1 rounded">free</span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-500">{t.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Task Hub tools */}
          <div>
            <p className="font-mono text-[10px] text-slate-700 tracking-widest mb-4">TASK HUB TOOLS — free</p>
            <div className="space-y-2">
              {TASK_TOOLS.map((t) => (
                <div key={t.name} className="card-surface rounded p-3 flex items-center gap-4">
                  <div className="flex items-center gap-2 min-w-[120px]">
                    <span className="font-mono text-xs text-white">{t.name}</span>
                    <span className="font-mono text-[9px] text-green-500/70 border border-green-500/20 px-1 rounded">free</span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-500">{t.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Section 3 — Commands */}
        <section className="max-w-6xl mx-auto px-6 py-16 border-t border-[#1A1A2E]">
          <div className="flex items-baseline justify-between mb-8">
            <p className="font-mono text-xs text-[#4FC3F7]">// commands (12)</p>
            <p className="font-mono text-xs text-slate-700">every step of the founder journey</p>
          </div>

          <div className="space-y-10">
            {COMMANDS.map((group) => (
              <div key={group.group}>
                <p className="font-mono text-[10px] text-slate-700 tracking-widest mb-4">{group.group}</p>
                <div className="space-y-2">
                  {group.items.map((item) => (
                    <div key={item.cmd} className="card-surface rounded p-4">
                      <div className="flex flex-wrap items-baseline gap-2 mb-1">
                        <span className="font-mono text-xs text-white font-semibold">{item.cmd}</span>
                        <span className="font-mono text-[10px] text-slate-700">→</span>
                        <span className="font-mono text-[10px] text-[#4FC3F7]">{item.arrow}</span>
                      </div>
                      <p className="font-mono text-[10px] text-slate-500 mb-2">{item.desc}</p>
                      <p className="font-mono text-[9px] text-slate-700">eg: {item.example}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Footer spacer */}
        <div className="border-t border-[#1A1A2E] px-6 py-10">
          <div className="max-w-6xl mx-auto">
            <p className="font-mono text-[10px] text-slate-700">
              $ <span className="text-[#4FC3F7]">blue init</span> <span className="text-slate-800">← install all 6 skill files locally</span>
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
