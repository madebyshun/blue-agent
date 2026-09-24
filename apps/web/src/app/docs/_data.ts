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

// Exactly the files `blue init` copies — i.e. `packages/builder/skills/*.md`,
// nothing more. /docs/skills renders this list under the sentence "these ship
// with the CLI", so an entry here is a promise that the file lands in the
// reader's ~/.blue-agent/skills/. Equality with the shipped directory is
// enforced by apps/web/scripts/skills-truth-check.ts, which is why this comment
// no longer carries a count: the number is derived, not asserted.
//
// It did carry one — "the 35 core skill files (+ 5 aeon-*.md documented
// separately on /docs/aeon-skills; 35 + 5 = the 40 total)" — and every clause of
// that was false by 2026-09-25: the Aeon files and their page were deleted with
// the Bankr purge, and the list itself had drifted three files away from what
// builder ships. Root `skills/` is a SUPERSET of this list and always has been.
export const SKILLS_DOCS = [
  { file: "base-security.md",                 desc: "500+ security checks across 13 categories. Loaded for blue audit." },
  { file: "base-addresses.md",                desc: "Verified contract addresses on Base — USDC, WETH, Uniswap, Aave." },
  { file: "base-standards.md",                desc: "ERC standards, Base patterns, x402 protocol spec." },
  { file: "base-ecosystem.md",                desc: "Base ecosystem overview — key protocols, teams, infrastructure." },
  { file: "base-account-integration.md",      desc: "Coinbase Smart Wallet — ERC-4337, passkeys, sponsored txs." },
  { file: "account-abstraction-deep-dive.md", desc: "ERC-4337 deep dive — UserOps, bundlers, paymasters, EntryPoint." },
  // Was `x402-tools.md` here until 2026-09-25 — a filename that has never existed
  // in any commit (`git log --all` for it is empty in both skill trees). Commit
  // 8577ed1d, 2026-07-24, whose own body reads "x402-tools.md replaces
  // bankr-tools.md entry", de-Bankr'd the NAME in this list without renaming any
  // file. The real file was renamed bankr-tools.md → llm-and-x402.md two months
  // later (102fbe39, in both trees) and nothing reconnected the two. So this page
  // advertised a skill `blue init` cannot install, while the shipped file it
  // describes was listed nowhere — one drift, visible from both ends.
  { file: "llm-and-x402.md",                  desc: "Inference gateway + payment layer — Virtuals API shape, x402 pricing, paid calls. Loaded for blue build." },
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
  // `token-launch-guide.md` was listed here until 2026-09-25 and is NOT shipped:
  // it has never been in packages/builder/skills/ in any commit, and SKILL_REGISTRY
  // does not name it, so neither `blue init` nor any of the five commands ever put
  // it in front of a CLI user. It is not dead, though — it is WEB grounding, fetched
  // from the root copy on GitHub by SKILL_URLS.tokenLaunch in
  // apps/web/src/app/api/_lib/llm.ts. Same status as `b20-launch-guide.md`, which
  // this list correctly never claimed. Root-only by design; keep the file, drop the
  // claim that the CLI installs it.
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

// AEON_SKILLS REMOVED 2026-09-25 with the Bankr purge, along with the five
// skills/aeon-*.md files it described and the /docs/aeon-skills page that
// rendered it. They were vendored from BankrBot/skills; four shaped LLM output
// and never called Bankr, but the fifth (aeon-distribute-tokens) settled
// payouts through the Bankr Wallet API, which 403s at the ACCOUNT level — so
// the set could not be kept whole and a page advertising four-of-five with a
// tombstone for the fifth is worse than no page.
//
// /docs/aeon-skills answered 200 in production, so it 301s to /docs/skills from
// culledRedirect() in middleware.ts rather than 404ing. Do not re-add a nav
// entry for it.
//
// ⚠️ NOT the same thing as the Aeon KV pipeline (`aeon:<skill>` keys in
// api/_lib/aeon-kv.ts, written by /api/cron/research-loop, read by 15 paid x402
// handlers). Same word, unrelated system, deliberately untouched here.


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
