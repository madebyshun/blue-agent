// Shared data for the Blue Agent docs. Single source of truth so each docs page
// stays thin and the numbers don't drift across pages.

export const STATS = [
  { value: "24", label: "Commands", color: "#4FC3F7" },
  { value: "40", label: "Skills", color: "#34D399" },
  { value: "72", label: "Hub Tools", color: "#A78BFA" },
  { value: "56", label: "MCP Tools", color: "#fbbf24" },
];

export const PRODUCTS = [
  { name: "Blue Chat", color: "#A78BFA", desc: "AI chat for Base builders · Sonnet / Opus / Venice · credit system", link: "/app/chat", label: "Open Chat →" },
  { name: "Blue Hub",  color: "#4FC3F7", desc: "72 AI tools · 3-agent consensus · pay per use via x402",            link: "/hub",      label: "Open Hub →" },
  { name: "Blue CLI",  color: "#34D399", desc: "@blueagent/cli · idea / build / audit / ship · Terminal + TUI",     link: "/docs/commands", label: "View Commands →" },
  { name: "Blue API",  color: "#fbbf24", desc: "60+ x402 endpoints · USDC on Base · no subscription",               link: "https://api.blueagent.dev/docs", label: "API Docs →" },
];

export const FOUNDATION = [
  { label: "Bankr LLM", desc: "llm.bankr.bot — AI backbone for all commands and chat", color: "#4FC3F7" },
  { label: "x402",      desc: "Pay per call in USDC — no subscription, no signup",      color: "#34D399" },
  { label: "Base",      desc: "All onchain actions on Base (chain ID 8453)",            color: "#2563EB" },
];

export const CHAT_MODELS = [
  { icon: "💬", label: "Chat",       model: "Sonnet",       note: "Balanced default · 200K ctx", cr: "50 cr",  color: "#4FC3F7" },
  { icon: "⚡", label: "Fast",        model: "DeepSeek V4",  note: "Cheapest · 1M ctx",           cr: "10 cr",  color: "#34D399" },
  { icon: "🔍", label: "Web Search",  model: "Grok 4",       note: "Live multi-source web",       cr: "60 cr",  color: "#E879F9" },
  { icon: "🔬", label: "Deep Think",  model: "Opus",         note: "Heavy reasoning + web",       cr: "200 cr", color: "#A78BFA" },
  { icon: "✍️", label: "Fable 5",     model: "Claude Fable", note: "Creative · 1M ctx",           cr: "120 cr", color: "#F472B6" },
  { icon: "🔒", label: "Private",     model: "Gemma 27B",    note: "E2EE · no logs",              cr: "30 cr",  color: "#6EE7B7" },
];

export const CHAT_CAPABILITIES = [
  { t: "Slash commands", d: "/idea /build /audit /ship /raise · /pick /scan /wallet — same power as the CLI, inline." },
  { t: "Hub tools",      d: "Live token prices, whale flow, risk gate, wallet PnL — 72 Hub tools the model calls for you." },
  { t: "Personas",       d: "Swap the agent's expert role (Trader · Cipher · Oracle · Custom) without changing the model." },
  { t: "Web search",     d: "Toggle on to let the model pull live web data and cite sources (auto-on for Web Search / Deep Think)." },
];

export const TIERS = [
  { tier: "Guest",   need: "No wallet", perk: "100 cr/day · ~10 messages", color: "#64748b" },
  { tier: "Starter", need: "500K BLUE", perk: "500 cr/day",                color: "#4FC3F7" },
  { tier: "Pro",     need: "2M BLUE",   perk: "2,000 cr/day",              color: "#A78BFA" },
  { tier: "Max",     need: "10M BLUE",  perk: "∞ credits · 40% off",       color: "#F59E0B" },
];

export const CORE_COMMANDS = [
  { cmd: "idea",  price: "$0.05", color: "#4FC3F7", desc: "Fundable brief" },
  { cmd: "build", price: "$0.50", color: "#A78BFA", desc: "Full architecture" },
  { cmd: "audit", price: "$1.00", color: "#f87171", desc: "Security review" },
  { cmd: "ship",  price: "$0.10", color: "#34D399", desc: "Deploy checklist" },
  { cmd: "raise", price: "$0.20", color: "#fbbf24", desc: "Pitch narrative" },
];

// Derived from packages/builder/src/cli.ts (the `blue` binary) + the CLI TUI.
export const COMMANDS_DOCS = [
  { group: "WORKFLOW", items: [
    { cmd: "blue idea [prompt]",  desc: "Concept → fundable brief (problem, why Base, MVP, risks, 24h plan)", example: 'blue idea "NFT marketplace for Base agents"' },
    { cmd: "blue build [prompt]", desc: "Brief → architecture + stack, folder structure, integrations",       example: 'blue build "Base-native staking protocol"' },
    { cmd: "blue audit [prompt]", desc: "Code → security review (reentrancy, oracle, MEV, go/no-go)",          example: 'blue audit "my Solidity contract"' },
    { cmd: "blue ship [prompt]",  desc: "Project → deploy checklist, verification, release notes, monitoring", example: 'blue ship "launch on Base mainnet"' },
    { cmd: "blue raise [prompt]", desc: "Idea → fundraising narrative, investor map, competitive landscape",   example: 'blue raise "Base DeFi protocol"' },
  ]},
  { group: "SETUP", items: [
    { cmd: "blue init",           desc: "Install skill files to ~/.blue-agent/skills/ for local grounding",    example: "blue init" },
    { cmd: "blue new <name>",     desc: "Scaffold a new Base project — base-agent | base-x402 | base-token",   example: "blue new my-token --template base-token" },
    { cmd: "blue doctor",         desc: "Check environment health — Node, skills, API key, config",            example: "blue doctor" },
    { cmd: "blue validate [dir]", desc: "Validate project structure — package.json, tsconfig, env, src/, git", example: "blue validate ./my-project" },
  ]},
  { group: "CHAT", items: [
    { cmd: "blue chat [prompt]",  desc: "Interactive chat with Bankr LLM in the terminal",                     example: 'blue chat "how do I add x402 to my API?"' },
  ]},
  { group: "REPUTATION", items: [
    { cmd: "blue score [handle]",       desc: "Builder Score for a wallet or X handle",                        example: "blue score @blueagent_" },
    { cmd: "blue agent-score [input]",  desc: "Evaluate an agent's reliability score",                         example: "blue agent-score 0x…" },
    { cmd: "blue compare [a] [b]",      desc: "Compare two builders or agents side by side",                   example: "blue compare @a @b" },
  ]},
  { group: "DISCOVERY", items: [
    { cmd: "blue search [query]",   desc: "Search builders, agents, projects, tokens",                         example: 'blue search "base lending"' },
    { cmd: "blue trending [filter]", desc: "What's trending on Base right now",                                example: "blue trending tokens" },
    { cmd: "blue watch [target]",   desc: "Watch a wallet, handle, or token",                                  example: "blue watch 0x…" },
    { cmd: "blue alert [subcommand]", desc: "Configure threshold alerts",                                      example: "blue alert add" },
    { cmd: "blue history [input]",  desc: "Activity history for a builder or agent",                           example: "blue history @blueagent_" },
  ]},
  { group: "LAUNCH", items: [
    { cmd: "blue launch [mode]",      desc: "Launch a token or project on Base",                               example: "blue launch token" },
    { cmd: "blue market [subcommand]", desc: "Market intelligence for the Base ecosystem",                     example: "blue market movers" },
  ]},
  { group: "TASKS", items: [
    { cmd: "blue tasks",                       desc: "Browse open tasks on the Work Hub",                      example: "blue tasks" },
    { cmd: "blue post-task [handle]",          desc: "Post a task + escrow USDC",                              example: "blue post-task @myhandle" },
    { cmd: "blue accept [taskId] [handle]",    desc: "Accept an open task",                                    example: "blue accept task_abc123 @me" },
    { cmd: "blue submit [taskId] [h] [proof]", desc: "Submit proof of work and earn XP + USDC",                example: "blue submit task_abc123 @me https://github.com/…" },
  ]},
];

// The 35 core skill files in skills/ (the 5 aeon-*.md skills are documented
// separately on /docs/aeon-skills; 35 + 5 = the 40 total).
export const SKILLS_DOCS = [
  { file: "base-security.md",                 desc: "500+ security checks across 13 categories. Loaded for blue audit." },
  { file: "base-addresses.md",                desc: "Verified contract addresses on Base — USDC, WETH, Uniswap, Aave." },
  { file: "base-standards.md",                desc: "ERC standards, Base patterns, x402 protocol spec." },
  { file: "base-ecosystem.md",                desc: "Base ecosystem overview — key protocols, teams, infrastructure." },
  { file: "base-account-integration.md",      desc: "Coinbase Smart Wallet — ERC-4337, passkeys, sponsored txs." },
  { file: "account-abstraction-deep-dive.md", desc: "ERC-4337 deep dive — UserOps, bundlers, paymasters, EntryPoint." },
  { file: "bankr-tools.md",                   desc: "Bankr LLM capabilities and the full x402 tool suite." },
  { file: "blue-agent-identity.md",           desc: "Blue Agent mission, product voice, do/don't rules." },
  { file: "design-system.md",                 desc: "Visual language, colors, card patterns, spacing." },
  { file: "x402-patterns.md",                 desc: "x402 payment patterns — pay-per-call APIs, pricing, flow." },
  { file: "x402-escrow-patterns.md",          desc: "x402 escrow — conditional payments, dispute resolution, release." },
  { file: "agent-wallet-security.md",         desc: "Security patterns for agent-controlled wallets." },
  { file: "agent-transaction-verification.md", desc: "Verify agent transactions before signing — simulation, intent checks." },
  { file: "wallet-guardrails.md",             desc: "Wallet guardrails for AI agents — spend limits, allowlists, approvals." },
  { file: "aerodrome-dex-guide.md",           desc: "Aerodrome DEX — pools, voting, bribes, LP strategy on Base." },
  { file: "aave-lending-patterns.md",         desc: "Aave v3 lending and borrowing patterns on Base." },
  { file: "uniswap-v4-hooks-guide.md",        desc: "Uniswap v4 hooks — lifecycle, pool manager, custom logic." },
  { file: "flashloan-patterns.md",            desc: "Flashloan fundamentals — callback structure, use cases." },
  { file: "flashloan-patterns-advanced.md",   desc: "Advanced flashloan strategies and attack vectors." },
  { file: "staking-yield-farming.md",         desc: "Staking and yield farming — vaults, rewards, compounding." },
  { file: "token-launch-guide.md",            desc: "Token launch — contract, Uniswap pool, liquidity, listing on Base." },
  { file: "solidity-security-patterns.md",    desc: "Solidity security — access control, overflow, reentrancy." },
  { file: "oracle-design-guide.md",           desc: "Oracle design — Chainlink, TWAP, price feed validation." },
  { file: "mev-protection-guide.md",          desc: "MEV protection — frontrun defense, slippage, commit-reveal." },
  { file: "mev-protection-advanced.md",       desc: "Advanced MEV protection — private orderflow, bundle strategies." },
  { file: "gas-optimization-guide.md",        desc: "Gas optimization — storage packing, calldata, assembly." },
  { file: "cross-chain-bridge-security.md",   desc: "Cross-chain bridge security — validation, trust assumptions, exploits." },
  { file: "governance-dao-patterns.md",       desc: "DAO governance — Governor, timelock, voting, quorum." },
  { file: "multi-sig-wallet-security.md",     desc: "Multi-sig — Safe, threshold signing, timelock, key rotation." },
  { file: "veil-privacy-transactions.md",     desc: "Privacy transactions — shielded transfers and ZK patterns on Base." },
  { file: "frames-miniapps.md",               desc: "Farcaster Frames and Base mini app development." },
  { file: "telegram-bot-patterns.md",         desc: "Telegram bot patterns — commands, webhooks, wallet linking." },
  { file: "gig-marketplace-guide.md",         desc: "On-chain gig/work marketplace — escrow, reputation, payouts." },
  { file: "postgres-for-agents.md",           desc: "Postgres for agents — schema design, indexing, pgvector." },
  { file: "reputation-engine.md",             desc: "Reputation engine — Builder Score, Agent Score, onchain signals." },
];

export const X402_SUITE = [
  { id: "blue-research",  price: "$1.00", color: "#60a5fa", desc: "Deep DD memo — grounds in live market data" },
  { id: "blue-compose",   price: "$0.10", color: "#34D399", desc: "Plan a runnable chain of Blue Hub tools" },
  { id: "blue-monitor",   price: "$0.20", color: "#f87171", desc: "Health + risk snapshot for a token/contract" },
  { id: "blue-deploy",    price: "$0.10", color: "#34D399", desc: "Base deploy mechanics — scripts, verify" },
  { id: "blue-analytics", price: "$0.25", color: "#60a5fa", desc: "Live token metrics + interpretation" },
  { id: "blue-simulate",  price: "$0.15", color: "#A78BFA", desc: "Bull/base/bear scenario modeling" },
  { id: "blue-stream",    price: "$0.05", color: "#34D399", desc: "Live Base onchain activity feed" },
  { id: "blue-registry",  price: "$0.05", color: "#fbbf24", desc: "Discover the full tool catalog" },
];

export const AEON_SKILLS = [
  { file: "aeon-token-movers",      color: "#34D399", trigger: '"what\'s pumping" · "top movers today" · pre-trade scan', desc: "Scans Base for the biggest movers right now — a fast pre-trade radar of what's running." },
  { file: "aeon-token-pick",        color: "#4FC3F7", trigger: '"give me a token pick" · "asymmetric setup today"',       desc: "Surfaces one asymmetric setup with a thesis — entry logic, why now, and the risk." },
  { file: "aeon-narrative-tracker", color: "#A78BFA", trigger: '"what\'s running on CT" · narrative positions · content', desc: "Tracks live crypto-Twitter narratives and the tokens positioned under each one." },
  { file: "aeon-deep-research",     color: "#fbbf24", trigger: '"DD on X" · "build me a memo" · contrarian take',         desc: "Full due-diligence memo on a token or project, with a contrarian angle." },
  { file: "aeon-distribute-tokens", color: "#f87171", trigger: "Weekly $BLUEAGENT rewards payout to the leaderboard",     desc: "Distributes $BLUEAGENT rewards to top contributors. Needs BANKR_API_KEY with Wallet write scope." },
];

export const PACKAGES = [
  { label: "SURFACE — what users install", color: "#4FC3F7", items: [
    { pkg: "@blueagent/cli",  desc: "TUI + CLI · blueagent (interactive) · blue (direct commands)" },
    { pkg: "@blueagent/x402", desc: "x402 client SDK · auto payment · createX402Client()" },
  ]},
  { label: "CORE — runtime & data", color: "#A78BFA", items: [
    { pkg: "@blueagent/core",       desc: "Runtime · skill loading · Bankr LLM · schemas" },
    { pkg: "@blueagent/reputation", desc: "Builder Score · Agent Score · Work Hub reputation" },
  ]},
  { label: "INTEGRATIONS", color: "#34D399", items: [
    { pkg: "@blueagent/skill",    desc: "MCP server · Claude Code · Cursor · Claude Desktop" },
    { pkg: "@blueagent/agentkit", desc: "Coinbase AgentKit plugin · 32 x402 actions" },
    { pkg: "@blueagent/sdk",      desc: "Unified SDK · ba.builder.idea() etc." },
  ]},
];
