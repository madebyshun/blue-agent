# CLAUDE.md — Blue Agent

## What is Blue Agent

**Blue Agent** is an AI agent layer built on Base — it interacts with users, automates tasks, and generates onchain activity.

Built by [Blocky Studio](https://blocky.studio) ([@madebyshun](https://x.com/blocky_agent)), Blue Agent is the flagship AI agent of the Base ecosystem. It is not just a chatbot — it is a full economic actor: it holds a wallet, executes onchain transactions, earns and distributes tokens, and powers a growing ecosystem of tools and services.

**Three surfaces:**
- **Telegram bot** — community hub, wallet, trading, rewards, builder tools
- **Founder console** (this repo) — AI-native workflow for Base builders: idea → build → audit → ship → raise
- **x402 API services** — 31 pay-per-use AI tools for agents and developers

**Tokens:**
- `$BLUEAGENT` — `0xf895783b2931c919955e18b5e3343e7c7c456ba3` (Base, Uniswap v4)
- `$BLOCKY` — `0x1E11dC42b7916621EEE1874da5664d75A0D74b07` (Base)
- Treasury — `0xf31f59e7b8b58555f7871f71973a394c8f1bffe5` (Base)

**Links:**
- X/Twitter: [@blocky_agent](https://x.com/blocky_agent)
- Telegram community: [t.me/blueagent_hub](https://t.me/blueagent_hub)
- Bankr profile: [bankr.bot/agent/blue-agent](https://bankr.bot/agent/blue-agent)

---

## This repo — Founder Console

The `blue-agent` repo is the **AI-native founder console for Base builders**. It is a workflow-first product for thinking, building, auditing, shipping, and raising on Base — powered by Bankr LLM and monetized via x402 micropayments.

---

## Tech stack

| Layer | What it is |
|---|---|
| `apps/web` | Next.js 15 frontend — founder console UI |
| `apps/api` | x402 paid API services (risk-gate, deep-analysis, wallet-pnl, etc.) |
| `packages/bankr` | Bankr LLM client — wraps `https://llm.bankr.bot/v1/messages` |
| `packages/core` | Shared schemas, command pricing, and tool input definitions |
| `packages/payments` | x402 payment helpers |
| Base chain | All on-chain actions are Base only (chain ID 8453) |

---

## Repo structure

```
blue-agent/
├── apps/
│   ├── web/              # Next.js app — /code, /chat, /launch, /market, /rewards
│   └── api/              # x402 paid endpoints (TypeScript)
│       └── x402/         # Individual paid tool handlers
├── packages/
│   ├── core/             # Shared types, schemas, pricing, tool-input specs
│   ├── bankr/            # Bankr LLM client (callBankrLLM, extractJsonObject)
│   └── payments/         # x402 payment flow helpers
├── agents/
│   └── blue-agent/       # Agent runtime config (agent.json, tasks.json)
├── commands/             # Command contract docs (idea.md, build.md, etc.)
├── skills/               # Bundled grounding knowledge (Base addresses, standards, tools)
├── docs/                 # Product brief, roadmap, status, quickstart
├── features/             # Feature folders
└── CLAUDE.md             # This file
```

---

## Hard rules

1. **Base chain only.** Never suggest Ethereum mainnet. All contract addresses, RPC calls, and on-chain actions target Base (chain ID 8453). Mention Base explicitly in every on-chain context.

2. **All contract addresses must be verified on Basescan.** Never invent or guess a contract address. If an address is needed and not already in the codebase, flag it for the user to supply. Format: `0x…` — always full checksum address.

3. **Use Bankr LLM for all AI calls.** Import from `packages/bankr` and call `callBankrLLM()`. Do NOT call OpenAI, Anthropic, or any other LLM API directly. The endpoint is `https://llm.bankr.bot/v1/messages`. API key is `process.env.BANKR_API_KEY`.

4. **No hallucinated addresses, ever.** If you don't have a verified address, say so. Do not fill in placeholders that look like real addresses.

5. **Business logic lives in packages, not in the app.** Keep `apps/web` thin. Schemas, pricing, and tool definitions belong in `packages/core`.

---

## The 5 core commands

Each has a contract doc in `commands/`.

| Command | What it does | Price |
|---|---|---|
| `blue idea` | Turns a rough concept into a fundable brief — problem, why now, why Base, MVP scope, risks, 24h plan | $0.05 |
| `blue build` | Architecture, stack, folder structure, files, integrations, and test plan | $0.50 |
| `blue audit` | Security and product risk review — critical issues, suggested fixes, go/no-go | $1.00 |
| `blue ship` | Deployment checklist, verification steps, release notes, monitoring plan | $0.10 |
| `blue raise` | Pitch narrative — market framing, why this wins, traction, ask, target investors | $0.20 |

Pricing is defined in `packages/core/src/schemas.ts` → `BLUE_AGENT_PRICING`.

---

## Commit convention

```
feat:     new feature
fix:      bug fix
skill:    new skill or grounding file added
cmd:      changes to a command contract (commands/*.md)
docs:     documentation only
refactor: code restructure, no behavior change
chore:    tooling, deps, config
```

---

## Branch policy

**Always work on `dev`.** Never commit directly to `main`. PRs go `dev → main`.
