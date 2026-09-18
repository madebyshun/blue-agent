// Shared data for the Blue Agent docs. Single source of truth so each docs page
// stays thin and the numbers don't drift across pages.

import { TOOL_COUNT } from "@/lib/agent-tools";
import { MCP_TOOL_COUNT } from "@/lib/mcp-tools";

export const STATS = [
  // Both counts are DERIVED, and they are different surfaces on purpose: the Hub
  // catalog is everything, the MCP manifest is a curated subset. "MCP Tools" sat
  // at a literal 57 long enough for the real surface to reach 86 without it
  // moving — which is why this file no longer gets to type a count at all.
  { value: String(TOOL_COUNT),     label: "Hub Tools", color: "#4FC3F7" },
  { value: "5",                    label: "Commands",  color: "#34D399" },
  { value: String(MCP_TOOL_COUNT), label: "MCP Tools", color: "#A78BFA" },
  { value: "3",                    label: "Agents",    color: "#fbbf24" },
];

export const PRODUCTS = [
  { name: "Blue Hood", color: "#34D399", desc: "Oracle-vs-DEX drift · tokenized stocks on Base + RH · graded in public",  link: "/app/hood", label: "Open Hood →" },
  { name: "Blue Chat", color: "#A78BFA", desc: "AI agent chat · multi-model · skill-based · Built for RH + Base",         link: "/app/chat", label: "Open Chat →" },
  { name: "Blue Hub",  color: "#4FC3F7", desc: `${TOOL_COUNT} AI tools · live on-chain data · x402 pay-per-call · no API key`, link: "/app/hub",  label: "Open Hub →" },
];

export const FOUNDATION = [
  // Venice was removed from the fallback chain 2026-07-25 and Bankr was
  // 403-banned 2026-07-20; every LLM call now goes to Virtuals via
  // api/_lib/llm.ts → callLLM. This list used to name Venice as primary.
  { label: "Virtuals",   desc: "The LLM gateway — every x402 handler and chat call", color: "#22C55E" },
  { label: "x402",       desc: "Pay per call in USDC on Base — EIP-3009 via CDP",  color: "#34D399" },
  { label: "RH Chain",   desc: "Robinhood Chain (chain ID 4663) — RWA trading",    color: "#22C55E" },
  { label: "Base",       desc: "Base (chain ID 8453) — builder + token surface",   color: "#2563EB" },
  { label: "Moralis",    desc: "Wallet data, token holdings, tx history",          color: "#fbbf24" },
];

// One preset per use-case — kept 1:1 with VIRTUALS_PRESETS_V1 in
// app/chat/components/ChatInput.tsx (the authoritative picker). All inference
// runs on Virtuals; update both sites together.
export const CHAT_MODELS = [
  { icon: "💬", label: "Balanced", model: "Claude Sonnet 5",    note: "Default for most work · 200K ctx", cr: "50 cr",  color: "#4FC3F7" },
  { icon: "⚡", label: "Fast",     model: "DeepSeek V4 Flash",  note: "Cheapest · snappy · 1M ctx",       cr: "10 cr",  color: "#34D399" },
  { icon: "🔬", label: "Deep",     model: "Claude Opus 4.8",    note: "Heavy reasoning · 200K ctx",       cr: "200 cr", color: "#A78BFA" },
  { icon: "🔍", label: "Grok",     model: "Grok 4",             note: "Live web · 2M ctx",                cr: "60 cr",  color: "#E879F9" },
  { icon: "🔒", label: "Private",  model: "E2EE DeepSeek V4",   note: "E2EE · no logs · 1M ctx",          cr: "30 cr",  color: "#6EE7B7" },
];

export const CHAT_CAPABILITIES = [
  { t: "Slash commands", d: "/idea /build /audit /ship /raise · /pick /scan /wallet — same power as the CLI, inline." },
  { t: "Hub tools",      d: "Live token prices, whale flow, risk gate, wallet PnL — the Hub tools the model calls for you." },
  { t: "Web search",     d: "Toggle on to let the model pull live web data and cite sources (the Grok preset is built for live web)." },
];

export const TIERS = [
  { tier: "Guest",  need: "No wallet",    perk: "100 cr/day · ~10 messages",       color: "#64748b" },
  { tier: "Member", need: "Any wallet",   perk: "500 cr/day · no token needed",    color: "#4FC3F7" },
  { tier: "Packs",  need: "USDC on Base", perk: "Top up anytime · pay-per-credit", color: "#F59E0B" },
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
    { cmd: "blue chat [prompt]",  desc: "Interactive chat with the Blue Agent LLM (Virtuals) in the terminal", example: 'blue chat "how do I add x402 to my API?"' },
  ]},
  { group: "REPUTATION", items: [
    { cmd: "blue score [handle]",       desc: "Builder Score for a wallet or X handle",                        example: "blue score @blueagent_" },
    { cmd: "blue agent-score [input]",  desc: "Evaluate an agent's reliability score",                         example: "blue agent-score 0x…" },
    { cmd: "blue compare [a] [b]",      desc: "Compare two builders or agents side by side",                   example: "blue compare @a @b" },
  ]},
  // `search`, `trending`, `watch`, `history`, `launch` and `market` were listed here until
  // 2026-09-18. They were retired, not renamed: each asked an LLM for market facts with no
  // data source behind it and printed the answer as measured. Do not re-add a row here
  // without a real source behind the command.
  { group: "ALERTS", items: [
    { cmd: "blue alert [subcommand]", desc: "Record a threshold alert locally — nothing delivers until you wire a listener", example: "blue alert add" },
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
  { file: "x402-tools.md",                    desc: `The full ${TOOL_COUNT}-tool x402 hub — pricing, inputs, and how agents call each one.` },
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
  // DEAD, and labelled dead rather than quietly dropped — the skill file still
  // ships, so a reader who finds it needs to know why it cannot run. MEASURED
  // 2026-09-06: POST /token-launches/deploy → 403 {"error":"Account suspended",
  // "banned":true,"banType":"restricted"}. The ban is on the ACCOUNT, not a
  // hostname, so every Bankr WRITE is closed — including the Wallet API a payout
  // would use.
  //
  // This entry ended "Reads still work; the transfer does not" until 2026-09-18,
  // when GET llm.bankr.bot/v1/usage answered 403 "This account has been banned"
  // on all three windows. The read carve-out was TRUE when measured on 09-06 and
  // FALSE twelve days later, so the clause is gone rather than re-hedged: a
  // carve-out earned by one measurement expires, and a public page is the worst
  // place to keep one alive. The other four skills are fine for a reason that
  // does not depend on Bankr at all — they shape output and never call it.
  { file: "aeon-distribute-tokens", color: "#f87171", trigger: "Weekly $BLUEAGENT rewards payout to the leaderboard",     desc: "Distributes $BLUEAGENT rewards to top contributors. ⚠️ Cannot run — payouts settle through the Bankr Wallet API and Blue Agent's Bankr account is suspended (403 on every verb, measured 2026-09-06 and 2026-09-18). Account-level ban: a different API key does not help. Reinstating it needs a different transfer rail." },
];

export const PACKAGES = [
  { label: "SURFACE — what users install", color: "#4FC3F7", items: [
    { pkg: "@blueagent/cli",  desc: "TUI + CLI · blueagent (interactive) · blue (direct commands)" },
    { pkg: "@blueagent/x402", desc: "x402 client SDK · auto payment · createX402Client()" },
  ]},
  { label: "CORE — runtime & data", color: "#A78BFA", items: [
    { pkg: "@blueagent/core",       desc: "Runtime · skill loading · Virtuals LLM gateway · schemas" },
    { pkg: "@blueagent/reputation", desc: "Builder Score · Agent Score · Work Hub reputation" },
  ]},
  { label: "INTEGRATIONS", color: "#34D399", items: [
    { pkg: "@blueagent/skill",    desc: "MCP server · Claude Code · Cursor · Claude Desktop" },
    // 12, not the 32 this said until 2026-09-18. `apps/web` does not depend on
    // the package, so the number cannot be imported — it is pinned instead by
    // scripts/docs-truth-check.ts group 10, counted out of provider.ts.
    { pkg: "@blueagent/agentkit", desc: "Coinbase AgentKit plugin · 12 x402 actions" },
    { pkg: "@blueagent/sdk",      desc: "Unified SDK · ba.builder.idea() etc." },
  ]},
];

// Re-exported, not re-typed. This file used to carry a hand-copied snapshot of
// the MCP manifest; it drifted to 63 entries while /api/mcp served 86, and 7 of
// those 63 were served by nothing at all. /docs/mcp now renders the same array
// the route returns. See lib/mcp-tools.ts for the measurement.
export { MCP_TOOLS, MCP_TOOL_COUNT } from "@/lib/mcp-tools";
