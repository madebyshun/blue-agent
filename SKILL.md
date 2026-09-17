# Blue Agent Skills

> AI-native founder console for Base builders — idea → build → audit → ship → raise.
> Built by Blocky Studio. Source: https://github.com/madebyshun/blue-agent

<!-- Counts in this file are pinned by apps/web/scripts/docs-truth-check.ts, which runs in
     CI. If you change a number here and it does not match the live catalog, the build fails.
     That check exists because this file once advertised a hardcoded list of 32 ids while the
     catalog held 111, and 20 of those ids had never existed. Link the catalog; do not retype it. -->

## What Blue Agent is

Blue Agent is a grounded AI agent for Base builders. It loads verified onchain knowledge
(Base addresses, standards, security patterns) before every LLM call — no hallucinated
addresses, no guessed contracts.

Two live surfaces:

- **Founder console** — this repo — AI workflow for builders, at https://app.blueagent.dev
- **x402 API** — pay-per-use AI tools for agents and developers, settled in USDC on Base

> A Telegram bot was a third surface until 2026-06 and is **no longer in active development**.
> It is named here only so a reader who meets an old reference knows it was retired on purpose,
> not that it is a feature to reach for.

## Install

```bash
npm install -g @blueagent/builder
blue init   # installs skill files to ~/.blue-agent/skills/
```

Or use the SDK directly:

```bash
npm install @blueagent/core
```

No install needed to call the tools — point any MCP client at the hosted server:

```
https://blueagent.dev/api/mcp
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

Prices come from `BLUE_AGENT_PRICING` in `packages/core/src/schemas.ts`.

## x402 Tools

Blue Hub exposes **111 paid tools** across 12 categories.

Categories: on-chain · security · data · intelligence · builder · trading · content · agent-economy · base-ecosystem · earn · signal · portfolio

**The list is not reproduced here on purpose.** The catalog changes when a tool ships or
retires; a hand-typed copy in a markdown file does not, and the stale copy is the one an agent
reads. Resolve tools from the generated source instead:

| Source | What it gives you |
|---|---|
| https://blueagent.dev/api/catalog | JSON — every tool id, name, description, category, price |
| https://blueagent.dev/llms.txt | Short agent brief for the same surface |
| https://app.blueagent.dev/hub | Human UI |

Calling a tool:

- **Protocol:** x402 (version 2)
- **Network:** `eip155:8453` (Base mainnet)
- **Asset:** USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- **Endpoint:** `POST https://blueagent.dev/api/x402/{tool-id}`

Prices are per-call and range from free to $5.00; the catalog carries the exact figure for each
id, so read it there rather than assuming a tier.

## Packages

Published on npm:

| Package | Description |
|---|---|
| `@blueagent/core` | Skill registry, grounded LLM runtime |
| `@blueagent/builder` | CLI — the five commands above (`blue` binary) |
| `@blueagent/cli` | Terminal UI for the wider ecosystem |
| `@blueagent/skill` | MCP server — a curated subset of the Hub, not the whole catalog |
| `@blueagent/agentkit` | Coinbase AgentKit plugin |

`packages/vercel-ai` (Vercel AI SDK tools) and `packages/langchain` (`blueagent-langchain`)
exist in this repo but are **not published** to npm or PyPI. Do not tell a user to install
them.

The MCP surface is deliberately a **subset**, not a mirror.

MCP serves 86 tools — 15 `blue_` + 64 `hub_` + 7 `b20_`.

Only the 64 `hub_` tools are drawn from the 111-tool catalog; `blue_` are the console commands
and `b20_` are MCP-only calldata builders that take no x402 payment. So **none of these
numbers is interchangeable with another** — a count always belongs to the one surface it was
measured on. If you need a total, measure the surface you are actually calling.

## Skills (grounding files)

41 grounding files live in `skills/` and are loaded before LLM calls. The frequently-used core:

| Skill | Contents |
|---|---|
| `base-addresses` | Verified contract addresses on Base |
| `base-standards` | ERC standards, gas, block time, Base-specific |
| `base-security` | 150+ security checks, reentrancy, MEV, agent risks |
| `blue-agent-identity` | Who Blue Agent is, tone, mission |
| `x402-patterns` | x402 payment flows and escrow patterns |

`skills/README.md` indexes the rest. The set covers DeFi (Aave, Aerodrome, Uniswap v4 hooks),
security (MEV, multi-sig, flashloans, oracles), and agent infrastructure.

## Chains

Two live venues, and a ticker alone never identifies a token — chain **and** address do:

- **Base (8453)** — primary venue. Tokenized stocks are Coinbase B20.
- **Robinhood Chain (4663)** — second live venue. The `rh-*` tools and the RWA registry are
  RH-specific.

The two chains share no state: a Base contract does not exist on Robinhood Chain's explorer,
and the reverse. Never resolve a contract by ticker string.

## Links

- X/Twitter: [@blueagent_](https://x.com/blueagent_)
- Telegram: [t.me/blueagent_hub](https://t.me/blueagent_hub)
- Docs: [blueagent.dev](https://blueagent.dev)
