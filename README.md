# Blue Agent

**AI-native founder console for Base builders.**

Built by [Blocky Studio](https://blocky.studio) — Blue Agent is a full economic actor on Base: it holds a wallet, executes onchain transactions, powers a growing ecosystem of tools, and helps builders go from idea to shipped product.

- X: [@blocky_agent](https://x.com/blocky_agent)
- Telegram: [t.me/blueagent_hub](https://t.me/blueagent_hub)
- Bankr: [bankr.bot/agent/blue-agent](https://bankr.bot/agent/blue-agent)

---

## What is this repo

The `blue-agent` monorepo is the **founder console** — a workflow-first product for building on Base, powered by Bankr LLM and monetized via x402 micropayments.

Five core commands take a builder from zero to launch:

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

Checks node version, skills installed, `BANKR_API_KEY`, and config file.

---

## Blue Tasks

Tasks are local micropayment jobs — post work, accept it, submit proof. Data lives at `~/.blue-agent/tasks.json`.

```bash
# In TUI: Tasks → blue post-task
title:       "Audit smart contract for reentrancy"
description: "Review Solidity contract and report critical issues"
reward:      5          # USDC
category:    audit      # audit | content | art | dev
handle:      madebyshun

# Doer accepts
Tasks → blue accept → taskId + handle

# Doer submits proof
Tasks → blue submit → taskId + proof URL

# List all tasks
Tasks → blue tasks
```

Fee = 5% platform cut. Doer receives 95% of reward.

---

## Builder Score / Agent Score

Scores are AI-powered reputation signals, not onchain data.

```bash
# In TUI: Score → builder-score
handle: madebyshun
```

Builder Score dimensions (max 100):

| Dimension | Max |
|---|---|
| activity | 25 |
| social | 25 |
| uniqueness | 20 |
| thesis | 20 |
| community | 10 |

Requires `BANKR_API_KEY`.

---

## Repo structure

```
blue-agent/
├── apps/
│   ├── web/              # Next.js 15 — /idea, /build, /audit, /ship, /raise, /micro
│   ├── api/              # x402 paid endpoints (deep-analysis, risk-gate, wallet-pnl, ...)
│   └── worker/           # Background cron — task expiry, auto-approve, reputation sync
├── packages/
│   ├── cli/              # @blueagent/cli — TUI (Ink + React)
│   ├── builder/          # @blueagent/builder — blue idea/build/audit/ship/raise
│   ├── core/             # Shared schemas, pricing, tool-input specs
│   ├── bankr/            # Bankr LLM client (callBankrLLM)
│   ├── reputation/       # @blueagent/reputation — Builder Score + Agent Score
│   ├── tasks/            # @blueagent/tasks — local task hub
│   ├── payments/         # x402 payment helpers
│   ├── skill/            # @blueagent/skill — grounding skill loader
│   └── skills/           # Bundled .md skill files (34 skills)
├── commands/             # Command contract docs (idea.md, build.md, ...)
├── agents/               # Agent runtime config (agent.json, tasks.json)
└── docs/                 # Product brief, roadmap, quickstart
```

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15, App Router, Tailwind |
| CLI/TUI | Ink (React for terminals) |
| LLM | Bankr LLM — `https://llm.bankr.bot/v1/messages` |
| Payments | x402 micropayments |
| Chain | Base only (chain ID 8453) |
| Storage | JSON files at `~/.blue-agent/` |

---

## Published packages

| Package | Version | Description |
|---|---|---|
| `@blueagent/cli` | 1.3.5 | TUI — full builder console |
| `@blueagent/builder` | 0.1.10 | Core build commands |
| `@blueagent/reputation` | 0.1.1 | Builder Score + Agent Score |
| `@blueagent/skill` | 0.1.1 | Skill loader |

---

## Tokens

- `$BLUEAGENT` — `0xf895783b2931c919955e18b5e3343e7c7c456ba3` (Base, Uniswap v4)
- `$BLOCKY` — `0x1E11dC42b7916621EEE1874da5664d75A0D74b07` (Base)
- Treasury — `0xf31f59e7b8b58555f7871f71973a394c8f1bffe5` (Base)

---

## Hard rules

1. **Base chain only.** All addresses and transactions target Base (chain ID 8453).
2. **All AI calls go through Bankr LLM.** `packages/bankr` → `callBankrLLM()`. No direct OpenAI or Anthropic calls.
3. **Never invent contract addresses.** If an address is needed and not in the codebase, flag it.
4. **Business logic in packages, not in apps.** Keep `apps/web` and `apps/api` thin.

---

## Commit convention

```
feat:     new feature
fix:      bug fix
skill:    new skill or grounding file
cmd:      command contract change (commands/*.md)
design:   UI / TUI design change
docs:     documentation only
refactor: restructure, no behavior change
chore:    tooling, deps, config
```

Branch: always work on `dev`. PRs go `dev → main`.
