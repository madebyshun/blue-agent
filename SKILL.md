# Blue Agent Skills

> AI-native founder console for Base builders — idea → build → audit → ship → raise.
> Built by Blocky Studio. Install: `skill install https://github.com/madebyshun/blue-agent`

## What Blue Agent is

Blue Agent is a grounded AI agent for Base builders. It loads verified onchain knowledge (Base addresses, standards, security patterns) before every LLM call — no hallucinated addresses, no guessed contracts.

Three surfaces:
- **Telegram bot** — community, wallet, trading, rewards
- **Founder console** — this repo — AI workflow for builders
- **x402 API** — 32 pay-per-use AI tools for agents and developers

## Install

```bash
npm install -g @blueagent/builder
blue init   # installs skill files to ~/.blue-agent/skills/
```

Or use the SDK directly:
```bash
npm install @blueagent/core
```

## Commands

| Command | What it does | Price |
|---|---|---|
| `blue idea` | Concept → fundable brief | $0.05 |
| `blue build` | Architecture + files plan | $0.50 |
| `blue audit` | Security risk review | $1.00 |
| `blue ship` | Deployment checklist | $0.10 |
| `blue raise` | Pitch narrative | $0.20 |
| `blue new <name> --template base-agent` | Scaffold Bankr agent | free |
| `blue new <name> --template base-x402` | Scaffold paid API | free |
| `blue new <name> --template base-token` | Scaffold ERC-20 token | free |

## Packages

| Package | Description |
|---|---|
| `@blueagent/core` | Skill registry, grounded LLM runtime |
| `@blueagent/builder` | CLI (`blue` command) |
| `@blueagent/agentkit` | Coinbase AgentKit plugin (32 tools) |
| `@blueagent/vercel-ai` | Vercel AI SDK tools (32 tools) |
| `blueagent-langchain` | LangChain toolkit (32 tools, PyPI) |

## Skills (grounding files)

Loaded automatically before each LLM call:

| Skill | Contents |
|---|---|
| `base-addresses` | Verified contract addresses on Base |
| `base-standards` | ERC standards, gas, block time, Base-specific |
| `bankr-tools` | Bankr LLM API, x402 payment pattern |
| `base-security` | 150+ security checks, reentrancy, MEV, agent risks |
| `blue-agent-identity` | Who Blue Agent is, tone, mission |

## x402 Tools (32 pay-per-use)

```
risk-gate ($0.05)        honeypot-check           allowance-audit
phishing-scan            mev-shield               contract-trust
circuit-breaker          key-exposure             quantum-premium ($1.50)
quantum-batch ($2.50)    quantum-migrate          quantum-timeline
deep-analysis ($0.35)    token-launch ($1.00)     launch-advisor ($3.00)
grant-evaluator ($5.00)  x402-readiness           base-deploy-check
tokenomics-score         whitepaper-tldr          vc-tracker
wallet-pnl ($1.00)       whale-tracker            aml-screen
airdrop-check            narrative-pulse          dex-flow
yield-optimizer          lp-analyzer              tax-report
alert-subscribe          alert-check
```

## Links

- X/Twitter: [@blocky_agent](https://x.com/blocky_agent)
- Telegram: [t.me/blueagent_hub](https://t.me/blueagent_hub)
- Bankr: [bankr.bot/agent/blue-agent](https://bankr.bot/agent/blue-agent)
- Tokens: `$BLUEAGENT` · `$BLOCKY` on Base
