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
- Chat: [app.blueagent.dev/chat](https://app.blueagent.dev/chat)
- X: [@blueagent_](https://x.com/blueagent_)
- Telegram: [t.me/blueagent_hub](https://t.me/blueagent_hub)

---

## Blue Hub — 30 AI Tools on Base

Blue Hub is a curated marketplace of 30 AI tools built on Base — 23 pay-per-call, 7 free. Any agent or developer can call tools via x402 micropayments in USDC — no API key, no account, no human in the loop.

```bash
# Discover all tools + prices
GET https://blueagent.dev/api/catalog

# Machine-readable x402 pricing
GET https://blueagent.dev/.well-known/pricing

# Call a paid tool
POST https://blueagent.dev/api/x402/{tool-id}
X-Payment: <EIP-3009 USDC on Base>

# Call a free tool — no header, no signature, nothing to settle
POST https://blueagent.dev/api/x402/blue-doctor
```

**30 tools across 5 categories** — on-chain · signal · security · builder · trading

<!-- Both numbers above, and every other tool count in this file, are pinned to
     `TOOL_COUNT` by apps/web/scripts/docs-truth-check.ts, which runs in CI. -->

Registry: [ERC-8257 ToolRegistry](https://basescan.org/address/0x265BB2DBFC0A8165C9A1941Eb1372F349baD2cf1) · [agentic.market](https://agentic.market) · [CDP Bazaar](https://www.coinbase.com/developer-platform)

---

## x402 SDK

```bash
npm install @blueagent/x402
```

```typescript
import { createX402Client } from "@blueagent/x402"

const client = createX402Client({ privateKey: "0x..." })

// Any Hub tool, by id — the SDK does 402 -> sign -> retry for you
const price  = await client.hub("token-price", {
  token: "0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b", // $VIRTUAL on Base
})
const safety = await client.hub("honeypot-check", { token: "0x…" })

// A free tool answers 200 on the first try; nothing is signed and nothing is charged
const target = await client.hub("pre-trade-check", {
  token: "0x…", chain: "base", kind: "swap", sender: "0x…", recipient: "0x…",
})

// Discover pricing before spending
const manifest = await client.pricing()
const quote    = await client.priceOf("base-stock-quote") // { priceUSD: "$0.02", amountRequired }
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
export VIRTUALS_API_KEY=your_key_here
blueagent
```

Inference runs through Virtuals (`compute.virtuals.io`) — that is the only
provider, and `VIRTUALS_API_KEY` is the only key this line has ever needed to
name. It named a different one until 2026-09-18, pointing at a provider that
returned an auth error on the first grounded command a new user ran. A README is
the first thing a stranger trusts, so a dead setup step costs more than a dead
feature further down: re-check this export against
`packages/core/src/runtime.ts` whenever the provider moves.

Navigate with `↑ ↓ Enter`. Press `Esc` to go back.

### Categories in the TUI

| Category | Tools |
|---|---|
| **On-chain** (12) | token-price · pool-scan · wallet-holdings · gas-tracker · base-stock-quote · base-stock-movers · rh-stock-quote · rh-stock-liquidity · rh-stock-holders · rh-stock-ohlc · safe-trending · rh-stock-swap-quote |
| **Security** (9) | wallet-risk · honeypot-check · risk-gate · contract-trust · liquidity-depth · pre-trade-check · sign-check · approval-audit · rh-rwa-verify |
| **Signal** (5) | hood-live · weekend-scorecard · rh-stock-movers · rh-stock-arb · rh-stock-agent-brief |
| **Builder** (1) | blue-registry |
| **Trading** (2) | rh-stock-swap-prepare · rh-stock-swap-quote |

One category the TUI still renders is **not** listed above, because it does not
work and listing it as a feature is how a stranger loses an afternoon:

- **Tasks** (`post-task · accept · submit · list`) — the microtask marketplace was
  retired on 2026-09-02 and its six API routes were deleted, so these commands
  call endpoints that no longer exist.

Both still ship in `@blueagent/cli`. Removing them from the package is a published-package
change, not a README edit, and is tracked separately.

### System check

```bash
blue doctor
```

---

## Blue Chat

The browser terminal folded into Blue Chat at
[app.blueagent.dev/chat](https://app.blueagent.dev/chat) — all 30 Hub tools, the
5 core commands, and onchain queries, in the browser. No install required.
(`/terminal` still 301s there, so old links keep working.)

```
blue hub ls                    # list all 30 tools
blue hub info base-stock-quote
blue idea <prompt>             # $0.05, inference via Virtuals
blue balance 0x...             # ETH + USDC on Base mainnet
```

---

## Blue Tasks

A local ledger for tracking work — post a job, accept it, submit proof. It records
who did what and what is owed. **It moves no money and it is not a marketplace:**
there is no server, no escrow, and no chain call anywhere in these commands.
Settling up is between the two people.

```bash
# Persists to ~/.blue-agent/microtasks.json
blue micro post "audit this contract for reentrancy" \
  --reward 5 --slots 1 --proof url --deadline 2026-12-31
blue micro list
blue micro claim <taskId> @handle
blue micro approve <claimId>       # marks it owed; sends nothing
```

The `blue post-task` / `tasks` / `accept` / `submit` group is a **separate draft
tool** backed by an in-memory store (`packages/reputation` → `taskHub.ts`), so its
state does not survive the process — every run starts empty. It does not read or
write `~/.blue-agent/tasks.json`; nothing shipped does.

The 5% figure the commands print is arithmetic on the ledger, not a fee anyone collects.

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
│   ├── web/              # Next.js 15 — the whole live x402 surface + /hub, /chat, /hood
│   └── docs/             # Mintlify docs source (not an npm workspace)
├── packages/             # the ones worth knowing:
│   ├── x402-client/      # @blueagent/x402 — x402 SDK for Blue Hub
│   ├── cli/              # @blueagent/cli — TUI (Ink + React)
│   ├── builder/          # the `blue` command implementations
│   ├── core/             # Shared schemas, pricing, tool-input specs
│   ├── payments/         # x402 payment helpers
│   ├── reputation/       # @blueagent/reputation — Builder Score + Agent Score
│   ├── skill/            # @blueagent/skill — MCP server
│   ├── claude-plugin/    # Claude Code plugin manifest — not an npm workspace
│   └── langchain/        # Python package (pyproject.toml) — not an npm workspace
├── commands/             # Command contract docs (idea.md, build.md, ...)
├── skills/               # Bundled .md grounding files (Base addresses, standards, ...)
├── scripts/              # register-all-tools.sh — ERC-8257 registration
└── docs/                 # Product brief, roadmap, quickstart
```

This block used to say `18 workspaces` and list `packages/skills/` as "Bundled .md skill
files". Both were wrong: only 12 of those 18 directories had a `package.json`, and four
(`agents`, `config`, `skills`, `ui`) held nothing but a `.gitkeep` — including the one this
block pointed readers at. The skill files have always lived in **root `skills/`**, which is
what `CLAUDE.md` documents and what the commands actually load. The four empty placeholders
were deleted rather than described, and the count was dropped rather than corrected: an
uncheckable number on the front page is what produced the wrong one.

---

## Published packages

The version column is a live npm badge, not a number typed here. It renders whatever npm's
`latest` tag currently serves, so it cannot go stale — this table previously pinned
`@blueagent/skill` at `0.1.1` while npm had been serving `0.4.0`.

| Package | Version (live from npm) | Description |
|---|---|---|
| [`@blueagent/x402`](https://npmjs.com/package/@blueagent/x402) | ![npm](https://img.shields.io/npm/v/@blueagent/x402?label=) | x402 SDK — call any Blue Hub tool |
| [`@blueagent/cli`](https://npmjs.com/package/@blueagent/cli) | ![npm](https://img.shields.io/npm/v/@blueagent/cli?label=) | CLI/TUI — full builder console |
| [`@blueagent/skill`](https://npmjs.com/package/@blueagent/skill) | ![npm](https://img.shields.io/npm/v/@blueagent/skill?label=) | MCP server for Blue Agent tools |
| [`@blueagent/reputation`](https://npmjs.com/package/@blueagent/reputation) | ![npm](https://img.shields.io/npm/v/@blueagent/reputation?label=) | Builder Score + Agent Score |
| [`@blueagent/core`](https://npmjs.com/package/@blueagent/core) | ![npm](https://img.shields.io/npm/v/@blueagent/core?label=) | Shared schemas + pricing. Its `runtime.ts` calls `compute.virtuals.io/v1` |
| [`@blueagent/builder`](https://npmjs.com/package/@blueagent/builder) | ![npm](https://img.shields.io/npm/v/@blueagent/builder?label=) | `blue` command implementations |
| [`@blueagent/sdk`](https://npmjs.com/package/@blueagent/sdk) | ![npm](https://img.shields.io/npm/v/@blueagent/sdk?label=) | Unified interface over commands + Hub tools |
| [`@blueagent/agentkit`](https://npmjs.com/package/@blueagent/agentkit) | ![npm](https://img.shields.io/npm/v/@blueagent/agentkit?label=) | Coinbase AgentKit plugin — exposes Hub tools as AgentKit actions |
| [`@blueagent/tasks`](https://npmjs.com/package/@blueagent/tasks) | ![npm](https://img.shields.io/npm/v/@blueagent/tasks?label=) | ⚠️ the microtask marketplace it describes was retired 2026-09-02 |

Four packages were missing from this table entirely. Two of the nine carry a ⚠️ because
what npm serves today does not match what this repo says is true — those are package
*republishes*, not README edits, and are tracked separately. `@blueagent/vercel-ai` is
deliberately absent: it has never been published, and 20 of the 32 tool ids it hardcodes
resolve to nothing.

No description here states how many tools its package exposes. That number is not
derivable from this file, and the two packages that do state one on npm are both wrong
by a wide margin — `@blueagent/cli` hardcodes 35 ids of which 22 don't exist, and
`@blueagent/vercel-ai` hardcodes 32 of which 20 don't. A count nobody can check is
how those got that way.

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15, App Router, Tailwind |
| CLI/TUI | Ink (React for terminals) |
| LLM | Virtuals — `https://compute.virtuals.io/v1` |
| Payments | x402 v2 + USDC on Base, settled via the Coinbase CDP facilitator |
| Chains | Base (8453) — primary · Robinhood Chain (4663) — the `rh-*` tools and RWA registry |
| Registry | ERC-8257 ToolRegistry on Base |

---

## Tokens

- `$BLUEAGENT` — `0xf895783b2931c919955e18b5e3343e7c7c456ba3` (Base, Uniswap v4)

---

## Hard rules

1. **Two live chains — say which one, every time.** Base (8453) is primary; Robinhood
   Chain (4663) carries the `rh-*` tools and the RWA registry. A ticker can exist on
   both, so a ticker string never identifies a token — chain + address does.
2. **All AI calls go through Virtuals.** `apps/web/src/app/api/_lib/llm.ts` → `callLLM()`.
   No handler calls a model provider directly — the gateway is the only egress.
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

Branch: cut a short-lived branch from `main`, PR it back into `main`, delete it on merge.
`dev` is retired (2026-09-05) — do not branch from it or re-create it.
