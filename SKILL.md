# Blue Agent Skills

> AI-native founder console for Base builders — idea → build → audit → ship → raise.
> Built by Blocky Studio. Source: https://github.com/madebyshun/blue-agent

<!-- Two CI checks own this file, for two different failures.

     apps/web/scripts/docs-truth-check.ts pins the COUNTS and holds out the 20 ids this file
     once sold that had never existed in HANDLERS or AGENT_TOOLS. Change a number here that
     the live catalog disagrees with and the build fails.

     apps/web/scripts/skill-catalog-check.ts owns the tool table below, which is GENERATED.
     The rule used to be "link the catalog; do not retype it" — right about retyping, but it
     left the brief with no tools in it. The rule now is: never retype it, and never edit
     inside the generated block. Regenerate with
       npx tsx apps/web/scripts/skill-catalog-check.ts --write
     That check also proves every body field named below is one the handler actually reads,
     so this file cannot tell an agent to POST something that gets silently dropped. -->

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

The list below is **generated from `AGENT_TOOLS`**, the same source `/api/catalog` and the Hub
render from, and CI fails if it drifts by a single byte. An earlier version of this file hand-typed
32 ids, 20 of which had never existed; the fix after that was to delete the list and link the
catalog, which was honest but left a reading agent needing a second request to answer "which tool,
and what do I send it?". Generating it answers that here, and cannot go stale.

Other views of the same source: [`/api/catalog`](https://blueagent.dev/api/catalog) (JSON, full
JSON Schema per tool) · [`llms.txt`](https://blueagent.dev/llms.txt) (short brief) ·
[the Hub](https://app.blueagent.dev/hub) (human UI).

<!-- BEGIN GENERATED TOOL CATALOG — apps/web/scripts/skill-catalog-check.ts --write
     Do not edit inside this block by hand; CI regenerates and diffs it.
     Source of truth: apps/web/src/lib/agent-tools.ts (AGENT_TOOLS).
     Body fields are the WIRE shape (post-x402Body), not the Hub form. -->

Blue Hub exposes **30 tools** across 5 categories — 23 paid, 7 free.

Categories: on-chain · signal · security · builder · trading

`POST https://blueagent.dev/api/x402/{id}` · x402 v2 · `eip155:8453` ·
USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`. Fields marked `*` are required;
every other field has a server-side default. Machine-readable equivalent, with
full JSON Schema per tool: https://blueagent.dev/api/catalog

The 7 priced $0.00 never answer 402 and never ask for a signature:
`blue-doctor` · `hood-live` · `weekend-scorecard` · `pre-trade-check` · `sign-check` · `approval-audit` · `rh-rwa-verify`.
Do not build an authorization for them — there is nothing to sign and no
transfer to make.

### on-chain (12)

| id | price | body | what it does |
|---|---|---|---|
| `base-stock-movers` | $0.03 | `limit` `min_liquidity_usd` | 24h gainers and losers among all Coinbase Tokenized Stocks on Base, by deepest-pool change, above a liquidity floor. Use when an agent asks for a daily stock screen, the day's stock picks, or which tokenized stocks moved. |
| `base-stock-quote` | $0.02 | `ticker`* | Live quote for one Coinbase Tokenized Stock on Base: deepest-pool price, 24h change, liquidity, volume, oracle share price and the drift between pool and oracle. Use when an agent asks a stock token's price, or wants the premium and buy impact before buying. |
| `blue-doctor` | $0.00 | _(no body)_ | Upstream health for every data source these tools read: Base 8453 and Robinhood Chain 4663 RPC, DexScreener, GeckoTerminal, DefiLlama. Use when another call failed and an agent must know whether the source is down or the request was wrong. Free. |
| `gas-tracker` | $0.01 | _(no body)_ | Live Base gas price and USD cost estimates for common actions. Use when an agent asks what a Base transaction costs, or needs a fee figure before telling a user to sign. |
| `pool-scan` | $0.02 | `limit` | Trending and newly-active Base liquidity pools with the chain TVL snapshot. Use when an agent asks where Base liquidity is moving, or needs a pool list before choosing where to trade. |
| `rh-stock-holders` | $0.05 | `ticker` `contract` `limit` | Top holders and concentration score for a Robinhood Chain RWA token, from Blockscout. Use when an agent asks who holds a tokenized stock, or whether supply is concentrated enough to be a risk. |
| `rh-stock-liquidity` | $0.05 | `ticker`* | Live DEX pool, TVL and slippage estimate for a Robinhood Chain tokenized stock. Use when an agent asks how deep a Robinhood Chain stock trades, or how much it can sell before the price moves. |
| `rh-stock-ohlc` | $0.05 | `ticker`* `timeframe` `limit` | OHLC candle history for a Robinhood Chain stock token. Use when an agent needs price history or a chart series, not just the current quote. |
| `rh-stock-quote` | $0.03 | `ticker`* | Live quote for Robinhood Chain tokenized stocks, read from Chainlink latestRoundData and the deepest pool. Use when an agent asks the price of a tokenized stock on Robinhood Chain, or needs oracle and pool price side by side. |
| `safe-trending` | $0.15 | `min_liquidity_usd` `limit` | Trending Base tokens, each with its buy/sell tax read from the contract and its exit depth. SAFE here = tradeable with verified tax. A clean scan is not a buy signal. Use when an agent asks what is trending on Base, or wants a tax-checked list of moving tokens. |
| `token-price` | $0.01 | `token`* | Live price, market cap, volume and liquidity for any Base token. Use when an agent asks what a Base token costs right now, or needs a spot price before sizing a swap. |
| `wallet-holdings` | $0.02 | `address`* | Live ERC-20 and ETH holdings with USD value for a Base wallet. Use when an agent asks what a Base address holds, or must size a trade against the actual balance instead of assuming one. |

### signal (6)

| id | price | body | what it does |
|---|---|---|---|
| `hood-live` | $0.00 | `chain` | Every tokenized stock Blue Hood watches right now on both venues: Chainlink oracle price, deepest-pool price and the drift between them. Use when an agent asks about tokenized stock prices, or wants the oracle-vs-pool gap before trading one. Free. |
| `rh-stock-agent-brief` | $0.20 | `ticker`* | One JSON brief for a Robinhood Chain stock token: drift, oracle age, holdings, liquidity. Use when an agent wants a stock token's whole picture in a single call. |
| `rh-stock-arb` | $0.05 | `ticker`* | Chainlink oracle versus the deepest DEX pool for a Robinhood Chain stock token: the gap in percent, which side is rich. Use when an agent asks for the oracle-premium or arbitrage gap on a stock token. |
| `rh-stock-movers` | $0.05 | `limit` `min_tvl_usd` `min_volume_24h_usd` | Top gainers and losers over 24h among Robinhood Chain tokenized stocks and ETFs, with a dust-pool filter. Use when an agent asks which Robinhood Chain stocks moved, or needs a screen of that venue. |
| `stock-screen` | $0.02 | `max_abs_drift_pct` `min_liquidity_usd` `max_oracle_age_seconds` `limit` | Screen every Coinbase Tokenized Stock on Base at once against your own thresholds — drift versus the Chainlink oracle, pool liquidity, oracle staleness — and get only the rows that clear them, each with the number that decided it. Use when an agent asks for a daily stock screen or the day's stock picks and needs the filter applied, not nine separate quotes. |
| `weekend-scorecard` | $0.00 | `ticker` `weekends` | Does the price Base trades a stock at over the weekend call Monday's open? Every Base stock on the desk, scored. Use when an agent asks whether tokenized stocks track the real thing, or needs weekend-vs-open accuracy before trusting an off-hours price. Free. |

### security (9)

| id | price | body | what it does |
|---|---|---|---|
| `approval-audit` | $0.00 | `wallet`* `chain` | Everything a wallet has granted that is still live: ERC-20 allowances, NFT operator-for-all and Permit2 grants, each re-checked. Use when an agent asks what a wallet has approved, or whether an old approval can still drain it. Free. |
| `contract-trust` | $0.15 | `address`* `context` | Audit any Base contract before swapping or interacting: Basescan verification plus a security scan and community signal. Use when an agent asks whether a Base contract can be trusted, or why a verified contract still looks wrong. |
| `honeypot-check` | $0.10 | `token`* | Detect honeypot tokens that can be bought but not sold, with transfer tax and rug pattern analysis on Base. Use when an agent asks whether a Base token is a honeypot, a scam, or safe to buy. |
| `liquidity-depth` | $0.03 | `token`* `trade_size_usd` | Liquidity depth, slippage estimate and exit risk for a Base token. Use when an agent asks how much of a Base token it can sell without moving the price, or needs a slippage figure before a trade. |
| `pre-trade-check` | $0.00 | `token`* `chain` `kind` `recipient` `sender` | Call before signing. Is this address a real token or a pool, an impostor of a canonical stock token, or a contract that can take the funds? Use when an agent is about to swap or approve and must check the target first. Free. |
| `rh-rwa-verify` | $0.00 | `contract`* `expected_ticker` | Given a contract address on Robinhood Chain, is it a canonical RHJ-issued stock token or an impersonator? Use when an agent is handed a Robinhood Chain token address and must know whether it is the real stock token before trading. Free. |
| `risk-gate` | $0.20 | `to`* `action` `value` | Pre-transaction risk screen for any address or swap: drainer patterns, AML signals, malicious contracts. Use when an agent must clear a Base address or swap before money moves, and wants one verdict instead of five signals. |
| `sign-check` | $0.00 | `chain` `from` `tx` `typed_data` | Call before a wallet signs anything. A transaction is decoded (approve, permit, Permit2, setApprovalForAll, transfer) and checked against what it actually grants. Use when an agent must tell a user what a signature does before they sign. Free. |
| `wallet-risk` | $0.05 | `address`* | Is this address known to be dangerous? GoPlus flags (theft, phishing, sanctions, laundering, mixer) with their sources. Use when an agent asks whether a Base wallet is safe to pay or copy, or before routing funds to an unfamiliar address. |

### builder (1)

| id | price | body | what it does |
|---|---|---|---|
| `blue-registry` | $0.05 | `query` `category` | Discover this catalog: every callable x402 tool with its price, filterable by query, category or free/paid. Use when an agent asks what tools exist here, or needs the endpoint and price of one before paying for it. |

### trading (2)

| id | price | body | what it does |
|---|---|---|---|
| `rh-stock-swap-prepare` | $0.05 | `ticker`* `side`* `amount`* `recipient`* `denom` `slippage_bps` | Non-custodial: returns the unsigned swap transactions for a Robinhood Chain stock token, for the user to sign. Use when an agent must hand a user a transaction to approve. |
| `rh-stock-swap-quote` | $0.05 | `ticker`* `side`* `amount`* `denom` `slippage_bps` | Quote a buy or sell of a Robinhood Chain stock token: expected fill, price impact, slippage. Use when an agent needs the fill before swapping, not the oracle price. |

<!-- END GENERATED TOOL CATALOG -->

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

MCP serves 15 tools — 7 paid + 8 free.

Since MCP v2 (2026-10-22) seven tools are paid per call over the x402 MCP transport
(`swap_prepare` $0.01, `token_verdict` $0.01, `stock_signal` $0.01, `stock_quote` $0.02,
`stock_movers` $0.03, `trending_safe` $0.05, `wallet_risk` $0.01).
The free ones are the transaction builders, the safety checks nobody pays for, and the
door to the catalog (`blue_registry`) plus `blue_doctor`. So **none of these numbers is interchangeable with another** —
a count always belongs to the one surface it was measured on. If you need a total, measure the
surface you are actually calling.

**Cut from 85 to 18 on 2026-09-26, and the cut removed no capability.** The 85-tool manifest
was 32,160 bytes — roughly 8,000 tokens spent before the agent read a single word of the user's
question — and published MCP research finds tool-selection accuracy degrades sharply past
~40 always-loaded entries. All 30 catalog tools remain live at `/api/x402/<id>`; `blue_registry`
lists them and `blue_call` runs any of them, so the rest moved from "always in context" to
"one lookup away". A manifest is a context budget, not an inventory.

`blue_call` is the one tool here that **charges**. It forwards no internal bypass header, so an
unpaid call returns a real HTTP 402 with payment requirements the agent settles from its own
wallet. The other 14 run free.

## Skills (grounding files)

36 grounding files live in `skills/` (plus its `README.md`) and are loaded before LLM calls. The frequently-used core:

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
