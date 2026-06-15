# Blue Agent

[![npm](https://img.shields.io/npm/v/@blueagent/cli?color=4FC3F7&label=%40blueagent%2Fcli)](https://www.npmjs.com/package/@blueagent/cli)
[![npm](https://img.shields.io/npm/v/@blueagent/x402?color=A78BFA&label=%40blueagent%2Fx402)](https://www.npmjs.com/package/@blueagent/x402)
[![GitHub stars](https://img.shields.io/github/stars/madebyshun/blue-agent?color=4FC3F7)](https://github.com/madebyshun/blue-agent/stargazers)
[![License: MIT](https://img.shields.io/badge/license-MIT-94A3B8)](LICENSE)
[![Built on Base](https://img.shields.io/badge/built%20on-Base-0052FF)](https://base.org)
[![Powered by x402](https://img.shields.io/badge/payments-x402-A78BFA)](https://x402.org)
[![Website](https://img.shields.io/badge/website-blueagent.dev-4FC3F7)](https://blueagent.dev)

**AI-native founder console + tool marketplace for Base builders.**

Blue Agent is a full economic actor on Base: it holds a wallet, executes onchain transactions, powers a growing ecosystem of tools, and helps builders go from idea to shipped product.

- Website: [blueagent.dev](https://blueagent.dev)
- Hub: [blueagent.dev/hub](https://blueagent.dev/hub)
- Terminal: [blueagent.dev/terminal](https://blueagent.dev/terminal)
- X: [@blueagent_](https://x.com/blueagent_)
- Telegram: [t.me/blueagent_hub](https://t.me/blueagent_hub)
- Bankr: [bankr.bot/agents/blue-agent](https://bankr.bot/agents/blue-agent)

---

## Blue Hub — 40 AI Tools on Base

Blue Hub is a curated marketplace of 68 pay-per-call AI tools built on Base. Any agent or developer can call tools via x402 micropayments in USDC — no API key, no account, no human in the loop.

```bash
# Discover all tools + prices
GET https://blueagent.dev/api/catalog

# Machine-readable x402 pricing
GET https://blueagent.dev/.well-known/pricing

# Call any tool
POST https://blueagent.dev/api/x402/{tool-id}
X-Payment: <EIP-3009 USDC on Base>
```

**68 tools across 9 categories** — intelligence · builder · trading · security · investor · agent-economy · base-ecosystem · on-chain · content

Registry: [ERC-8257 ToolRegistry](https://basescan.org/address/0x265BB2DBFC0A8165C9A1941Eb1372F349baD2cf1) · [agentic.market](https://agentic.market) · [CDP Bazaar](https://www.coinbase.com/developer-platform)

---

## x402 SDK

```bash
npm install @blueagent/x402
```

```typescript
import { createX402Client } from "@blueagent/x402"

const client = createX402Client({ privateKey: "0x..." })

// 5 core commands
const brief = await client.idea("gasless USDC tipping app on Base")
const arch  = await client.build("...")
const audit = await client.audit("0x<contract>")
const ship  = await client.ship("...")
const raise = await client.raise("...")

// Any Hub tool
const pick  = await client.tokenPick()
const news  = await client.hub("ecosystem-digest", { focus: "DeFi" })

// Discover pricing
const manifest = await client.pricing()
const price    = await client.priceOf("blue-audit") // { priceUSD: "$1.00" }
```

The SDK handles the full x402 flow: `402 → decode requirements → sign EIP-3009 → retry → 200 OK`

---

## 5 Core Commands

| Command | What it does | Price |
|---|---|---|
| `blue idea` | Rough concept → fundable brief | $0.05 |
| `blue build` | Brief → architecture + stack + file tree | $0.50 |
| `blue audit` | Code → security review + go/no-go | $1.00 |
| `blue ship` | Project → deploy checklist + release notes | $0.10 |
| `blue raise` | Idea → pitch narrative + investor framing | $0.20 |

---

## Install CLI

```bash
npm install -g @blueagent/cli
```

```bash
export BANKR_API_KEY=your_key_here
blueagent
```

Navigate with `↑ ↓ Enter`. Press `Esc` to go back.

### Categories in the TUI

| Category | Tools |
|---|---|
| **Build** | idea · build · audit · ship · raise |
| **Security** | honeypot-check · contract-trust · allowance-audit · phishing-scan · mev-shield · aml-screen · quantum-* · base-deploy-check |
| **Research** | deep-analysis · whale-tracker · narrative-pulse · dex-flow · vc-tracker · tokenomics-score · whitepaper-tldr · grant-evaluator |
| **Score** | builder-score · agent-score |
| **Tasks** | post-task · accept · submit · list |
| **Data** | wallet-pnl · lp-analyzer · risk-gate |
| **Earn** | yield-optimizer · airdrop-check · tax-report |
| **Bankr** | swap · transfer · portfolio · launch-token |

### System check

```bash
blue doctor
```

---

## Blue Terminal

Browser-based CLI at [blueagent.dev/terminal](https://blueagent.dev/terminal) — run all 68 Hub tools, 5 core commands, and onchain queries directly in the browser. No install required.

```
blue hub ls                    # list all 68 tools
blue hub info token-pick-signal
blue idea <prompt>             # $0.05 via Bankr LLM
blue balance 0x...             # ETH + USDC on Base mainnet
```

---

## Blue Tasks

Tasks are local micropayment jobs — post work, accept it, submit proof. Data lives at `~/.blue-agent/tasks.json`.

```bash
# In TUI: Tasks → blue post-task
title:       "Audit smart contract for reentrancy"
reward:      5          # USDC
category:    audit

# Doer accepts
Tasks → blue accept → taskId + handle

# Doer submits proof
Tasks → blue submit → taskId + proof URL
```

Fee = 5% platform cut. Doer receives 95%.

---

## Builder Score / Agent Score

```bash
# In TUI: Score → builder-score
handle: madebyshun
```

Builder Score dimensions (max 100): activity · social · uniqueness · thesis · community

---

## Repo structure

```
blue-agent/
├── apps/
│   └── web/              # Next.js 15 — /hub, /console, /terminal, /skills
├── packages/
│   ├── x402-client/      # @blueagent/x402 — x402 SDK for Blue Hub
│   ├── cli/              # @blueagent/cli — TUI (Ink + React)
│   ├── core/             # Shared schemas, pricing, tool-input specs
│   ├── bankr/            # Bankr LLM client (callBankrLLM)
│   ├── payments/         # x402 payment helpers
│   ├── reputation/       # @blueagent/reputation — Builder Score + Agent Score
│   ├── skill/            # @blueagent/skill — MCP server
│   └── skills/           # Bundled .md skill files
├── bankr-skills/         # BankrBot/skills submissions (blue-hub + 5 commands)
├── commands/             # Command contract docs (idea.md, build.md, ...)
├── scripts/              # register-all-tools.sh — ERC-8257 registration
└── docs/                 # Product brief, roadmap, quickstart
```

---

## Published packages

| Package | Version | Description |
|---|---|---|
| [`@blueagent/x402`](https://npmjs.com/package/@blueagent/x402) | 0.1.0 | x402 SDK — call any Blue Hub tool |
| [`@blueagent/cli`](https://npmjs.com/package/@blueagent/cli) | 1.3.14 | CLI/TUI — full builder console |
| [`@blueagent/skill`](https://npmjs.com/package/@blueagent/skill) | 0.1.1 | MCP server for Blue Agent tools |
| [`@blueagent/reputation`](https://npmjs.com/package/@blueagent/reputation) | 0.1.1 | Builder Score + Agent Score |

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15, App Router, Tailwind |
| CLI/TUI | Ink (React for terminals) |
| LLM | Bankr LLM — `https://llm.bankr.bot/v1/messages` |
| Payments | x402 v2 + USDC on Base |
| Chain | Base only (chain ID 8453) |
| Registry | ERC-8257 ToolRegistry on Base |

---

## Tokens

- `$BLUEAGENT` — `0xf895783b2931c919955e18b5e3343e7c7c456ba3` (Base, Uniswap v4)

---

## Hard rules

1. **Base chain only.** All addresses and transactions target Base (chain ID 8453).
2. **All AI calls go through Bankr LLM.** `packages/bankr` → `callBankrLLM()`. No direct OpenAI or Anthropic calls.
3. **Never invent contract addresses.** If an address is needed and not in the codebase, flag it.
4. **Business logic in packages, not in apps.** Keep `apps/web` thin.

---

## Commit convention

```
feat:     new feature
fix:      bug fix
skill:    new skill or grounding file
cmd:      command contract change (commands/*.md)
docs:     documentation only
refactor: restructure, no behavior change
chore:    tooling, deps, config
```

Branch: always work on `dev`. PRs go `dev → main`.
