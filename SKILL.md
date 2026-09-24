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

Blue Hub exposes **110 paid tools** across 11 categories.

Categories: on-chain · security · intelligence · builder · trading · content · agent-economy · base-ecosystem · earn · signal · portfolio

`POST https://blueagent.dev/api/x402/{id}` · x402 v2 · `eip155:8453` ·
USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`. Fields marked `*` are required;
every other field has a server-side default. Machine-readable equivalent, with
full JSON Schema per tool: https://blueagent.dev/api/catalog

### on-chain (27)

| id | price | body | what it does |
|---|---|---|---|
| `agent-readiness` | $0.10 | `url`* | x402 + MCP readiness probe for an agent endpoint. |
| `airdrop-check` | $0.10 | `address`* | Base airdrop eligibility check — which protocols, activity score, estimated value. |
| `aml-screen` | $0.25 | `address`* | AML compliance screening for any wallet — transaction patterns, risk flags, clean/suspicious verdict. |
| `base-activity-score` | $0.05 | `address`* | Onchain activity score + tier for a Base wallet (Moralis). |
| `base-pulse` | $0.05 | _(no body)_ | Base chain market pulse — TVL, DEX volume, sentiment, pulse score. |
| `blue-stream` | $0.05 | `feed` `chain` | Live snapshot feed of onchain activity on Base or Robinhood Chain — trending & new pools, TVL, real price/volume/liquidity. Pure real data, poll for a near-real-time feed. |
| `cross-protocol-yield` | $0.15 | `token`* `risk_tolerance` | Best Base yield for a token across protocols (DefiLlama). |
| `dex-flow` | $0.15 | `token`* | DEX volume, buy/sell pressure and liquidity flow for any Base token — live DexScreener data. |
| `gas-tracker` | $0.01 | _(no body)_ | Live Base gas price + USD cost estimates for common actions. |
| `new-pools` | $0.02 | `hours` | Freshly-created Base pools with thin-liquidity honeypot flags. |
| `pool-scan` | $0.02 | `limit` | Trending + newly-active Base pools with the chain TVL snapshot. |
| `protocol-risk-monitor` | $0.35 | `protocol`* `position` | Real-time risk assessment for your DeFi positions — exit signals, risk scores. |
| `rh-bridge-route` | $0.05 | `from_chain` `to_chain` `asset` | Bridge routes Base ↔ Robinhood Chain: the canonical Orbit bridge plus known third-party aggregators (Across, LI.FI, Squid) with their live-quote endpoints. |
| `rh-rwa-index` | $0.02 | _(no body)_ | Full canonical Robinhood Chain RWA catalog — every token the RHJ factory has deployed (180+ tokenized stocks, 20+ ETFs), plus Chainlink-only feeds. Zero-input. A listing proves RHJ issued the token; it does not imply the token is tradable. For portfolio dashboards + sector basket builders. |
| `rh-stock-correlations` | $0.10 | `tickers`* `days` | Pairwise Pearson correlation matrix over daily closes from GT pool OHLC for 2–10 tickers. Correlation null when overlap < 3 candles — honest about nascent history. |
| `rh-stock-holders` | $0.05 | `ticker` `contract` `limit` | Top holders + concentration score for a RH RWA token. Real Blockscout data. Returns top-N shares + HHI (0 = flat / 10 000 = single holder). |
| `rh-stock-liquidity` | $0.05 | `ticker`* | Live DEX pool + TVL + slippage estimate for a Robinhood Chain tokenized stock. First-order xy=k slippage on ONE-side USD depth (reserve_usd / 2) — the total-TVL version under-estimates by ~2×. V4 concentrated-liquidity caveat included. All pools sorted by depth. |
| `rh-stock-new-listings` | $0.05 | `since_days` `limit` | Reads every `Deployed` event from the canonical RHJ token factory and diffs it against our registry. Provenance is structural — an impersonator cannot emit the real factory's events — so anything listed here is a genuine RH stock token, and anything missing from the registry is a real new listing. |
| `rh-stock-ohlc` | $0.05 | `ticker`* `timeframe` `limit` | OHLC candle history for a Robinhood Chain tokenized stock. Timeframes: minute / hour / day. Backed by GeckoTerminal pool history — deepest-liquidity pool auto-selected. Returns candles + summary (high, low, total volume, % change). |
| `rh-stock-quote` | $0.03 | `ticker`* | Deterministic live quote for Robinhood Chain tokenized stocks. On-chain Chainlink AggregatorV3 latestRoundData → raw answer + decimals + updatedAt + staleness. Falls back to DEX spot only if no feed exists. The one embed-friendly price tool. |
| `rh-stock-search` | $0.02 | `query`* `limit` | Fuzzy search across the canonical Robinhood Chain RWA registry. Typo-tolerant (Levenshtein + prefix). Returns top-N ranked matches. Never fabricates a contract address. |
| `rh-stock-token` | $0.05 | `query`* | Canonical Robinhood Chain (4663) tokenized-stock lookup. Input a ticker (MSTR, AAPL, TSLA) or company name → contract address, decimals, Chainlink oracle price + DEX spot cross-check + Blockscout link. Real data only (docs.robinhood.com + Chainlink AggregatorV3 + GeckoTerminal). |
| `rh-usdg-route` | $0.05 | `from_asset` `amount` | Cheapest USDG (Global Dollar) acquisition on Robinhood Chain given a starting asset. Returns WETH-swap path, sell-RWA path, and bridge-first path with real GT + on-chain pool data. |
| `scam-detector` | $0.10 | `contract`* | Detect honeypot / rug / fake-token patterns on a Base contract. |
| `token-price` | $0.01 | `token`* | Live price, mcap, volume and liquidity for any Base token (DexScreener). |
| `wallet-holdings` | $0.02 | `address`* | Live ERC-20 + ETH holdings and USD value for a Base wallet (Moralis). |
| `whale-tracker` | $0.10 | `address`* | Smart money and whale flow analysis — accumulation vs distribution signal for any token. |

### security (15)

| id | price | body | what it does |
|---|---|---|---|
| `b20-analyze` | $0.05 | `action` `address` `context` | B20 (Base Native Token Standard) guide — variants, roles, policies, integration tips. Powered by Beryl upgrade docs. |
| `b20-check` | $0.05 | `contract`* | ERC-20 compliance (B20) role + policy detection from verified source. |
| `b20-inspect` | $0.005 | `address`* `network` | Live on-chain B20 token inspector — reads real state from Base RPC via multicall. Returns isB20 flag, name/symbol/decimals, totalSupply, supplyCap, variant (ASSET/STABLECOIN), pause status per feature, and policy IDs per transfer/mint scope. Zero LLM. |
| `blue-monitor` | $0.20 | `target`* `focus` | On-demand health + risk snapshot for a Base token/contract — live price, liquidity, verification, risk signals, and a watch plan with alert thresholds. |
| `contract-trust` | $0.15 | `address`* `context` | Audit any Base contract before swapping or interacting. Basescan verification + security scan + community signal. Verdict: SAFE / CAUTION / RED_FLAG. |
| `deep-analysis` | $0.50 | `token`* `context` | Full due diligence on any Base token — security score, market fundamentals, on-chain activity, and composite verdict. |
| `honeypot-check` | $0.10 | `token`* | Detect honeypot tokens that can be bought but not sold. Transfer tax analysis + rug pattern detection on Base. |
| `key-exposure` | $0.50 | `address`* | Check if a wallet's public key is exposed on-chain (quantum vulnerability). Verdict computed from the real Base RPC nonce — never fabricated. EXPOSED means the key is visible, not that funds are at immediate risk. |
| `liquidity-depth` | $0.03 | `token`* `trade_size_usd` | Liquidity depth, slippage estimate and exit risk for a Base token. |
| `quick-safety` | $0.05 | `contract`* | Fast contract safety check — liquidity, verification, risk verdict. |
| `rh-rwa-verify` | $0.00 | `contract`* `expected_ticker` | Given a contract address on Robinhood Chain, is it a canonical RHJ-issued stock token or an impersonator? Cross-checks registry + live ERC-20 metadata. Surfaces the real contract when a fake claims a matching ticker. Free — safety checks should never be gated. |
| `rh-stock-beacon-check` | $0.05 | `ticker` `contract` | EIP-1967 beacon slot + implementation + admin/owner read for a RWA token proxy. Governance-risk snapshot — compare across runs to detect implementation upgrades. Real on-chain storage reads. |
| `risk-gate` | $0.20 | `to`* `action` `value` | Pre-transaction risk assessment — screen any address or swap for drainer patterns, AML signals, and malicious contracts. |
| `token-distribution` | $0.05 | `contract`* | Holder concentration + rug-risk distribution score (Moralis holders). |
| `wallet-risk` | $0.05 | `address`* | AML / risk screen for a Base wallet from real on-chain flow (Moralis). |

### intelligence (12)

| id | price | body | what it does |
|---|---|---|---|
| `base-alpha` | $0.10 | _(no body)_ | Base market alpha — narratives, momentum picks, divergence signals. |
| `blue-analytics` | $0.25 | `target`* `focus` | Performance/metrics read on a Base token — live price, momentum, liquidity health, volume/liquidity ratio, growth signals. Real DexScreener data. |
| `blue-research` | $1.00 | `topic`* `target` | Deep DD memo on a Base project, narrative, or token — thesis, bull/bear, risks, contrarian take, verdict. Grounds in live market data when a token address is given. |
| `ecosystem-digest` | $0.20 | _(no body)_ | Weekly Base ecosystem intelligence: top builders, protocols, and narratives. |
| `founder-check` | $0.10 | `handle`* | GitHub-based founder trust score — repos, stars, activity. |
| `market-fit` | $0.25 | `description`* `name` `stage` | Score your product's market fit with swarm intelligence across three personas. |
| `narrative-position` | $0.15 | `topic` `focus` | Which narratives are building vs peaking on CT — and where to position. |
| `narrative-pulse` | $0.10 | `focus` | Live Base narrative phases, velocity and entry windows. |
| `protocol-health` | $0.10 | `protocol`* | Protocol TVL health, trend and risk signals (DefiLlama). |
| `token-alpha` | $0.15 | `token`* | Token trade signal — entry, whale confirmation, momentum and risk. |
| `token-launch-readiness` | $0.30 | `name`* `project`* `description` | Go/no-go signal on whether your project is ready to launch a token. |
| `token-pick-signal` | $0.20 | `chain` `context` | AI consensus on the highest-conviction asymmetric token setup on Base right now. |

### builder (29)

| id | price | body | what it does |
|---|---|---|---|
| `agent-collab-match` | $0.20 | `agent_a`* `agent_b`* `collab_goal` | Find agents that complement your tool and surface collab opportunities. |
| `agent-performance` | $0.25 | `handle`* `repo` | Benchmark your AI agent's revenue, engagement, and retention metrics. |
| `agent-score` | $0.35 | `handle`* | Performance score for AI agents on Base — XP, interaction volume, uptime, ecosystem impact. |
| `blue-audit` | $1.00 | `prompt`* | Security + product risk review. Reentrancy, oracle, MEV, x402, Coinbase Smart Wallet. Go/no-go. |
| `blue-build` | $0.50 | `prompt`* | Architecture, stack, folder structure, integrations, test plan. Verified Base patterns, no hallucinations. |
| `blue-compose` | $0.10 | `goal`* | Turn a goal into a runnable chain of Blue Hub tools — picks from the real catalog, orders them, suggests inputs, and estimates cost. |
| `blue-deploy` | $0.10 | `project`* `stack` | Technical deploy mechanics for Base mainnet — deploy scripts, Basescan verify commands, env vars, gas notes, post-deploy checks. Never invents addresses. |
| `blue-idea` | $0.05 | `prompt`* | Turn a rough concept into a fundable brief — problem, why now, why Base, MVP scope, risks, 24h plan. |
| `blue-raise` | $0.20 | `prompt`* | Fundraising narrative, investor deck outline, smart money map, competitive landscape for your Base niche. |
| `blue-registry` | $0.05 | `query` `category` | Discover the Blue Hub tool catalog — every callable x402 tool (first-party + community), filterable by query/category, with prices and how-to-call. |
| `blue-ship` | $0.10 | `prompt`* | Deployment checklist, verification, release notes, monitoring. Everything you forget when excited to launch. |
| `blue-simulate` | $0.15 | `scenario`* `params` | Bull/base/bear scenario modeling for a Base decision — tokenomics, fee model, growth, runway — with assumptions, projections, and sensitivities. |
| `builder-deep-dd` | $0.35 | `target`* `type` | Full due diligence on a Base builder: onchain activity, shipped products, credibility. |
| `community-sentiment` | $0.20 | `project`* `description` | Real-time sentiment analysis across your community channels. |
| `competitor-scan` | $0.20 | `project`* `description`* `competitors` | Identify direct/indirect competitors and surface your defensible edge. |
| `defi-opportunity` | $0.25 | `strategy` `risk_tolerance` | Scan Base DeFi for emerging yield, liquidity, and protocol opportunities. |
| `fundraise-timing` | $0.20 | `project`* `stage` | Is now the right time to raise? Market conditions, stage readiness, investor appetite. |
| `grant-evaluator` | $5.00 | `projectName`* `description`* `teamBackground` `requestedAmount` `milestones` `githubUrl` | Base ecosystem grant scoring — innovation, feasibility, impact, team quality. |
| `gtm-brief` | $0.25 | `project`* `description`* `target` | Go-to-market playbook: channels, timing, messaging, and early adopter strategy. |
| `investor-memo` | $0.35 | `project`* `description`* `ask` `stage` `traction`* | Full investor memo: thesis, market, moat, risks, and ask — ready to send. |
| `launch-simulator-1` | $0.10 | `project`* `description` `ticker` | Quick Signal — baseline ecosystem read + 3-agent verdict. Fast pre-launch gut-check. |
| `launch-simulator-2` | $0.35 | `project`* `description` `ticker` `contract` | Deep Signal launch simulation with live DexScreener market data — price, volume, liquidity. |
| `launch-simulator-3` | $0.50 | `project`* `description` `ticker` `contract` | Full Simulation — complete multi-agent report with risk matrix and timeline recommendation. |
| `pitch-intelligence` | $0.30 | `project`* `description`* | Transform your deck into investor-grade pitch intelligence with narrative scoring. |
| `repo-health` | $0.20 | `repo`* `description`* | Audit your GitHub repo health: code quality, docs, CI, contributor signals. |
| `rh-rwa-embed-kit` | $0.05 | `ticker`* `framework` `theme` | Copy-paste 'Buy $TICKER' button kit: chain config, live-price hook, and wagmi buy button wired to the RH swap prepare endpoint. Non-custodial. The Vlad-Tenev-builder-tweet-answering tool. |
| `rh-rwa-pricing-kit` | $0.05 | `ticker`* | Standalone read-only React hook for a live Chainlink RH RWA price: ABI + viem client + hook + demo badge component. No wallet required, no cost per read. |
| `roadmap-validator` | $0.25 | `project`* `roadmap`* | Validate your roadmap against market timing, execution risk, and narrative fit. |
| `stack-recommender` | $0.20 | `project`* `description`* `team_size` `timeline` | Optimal tech stack for Base builders — infra, tooling, protocols, integrations. |

### trading (5)

| id | price | body | what it does |
|---|---|---|---|
| `rh-stock-swap-prepare` | $0.05 | `ticker`* `side`* `amount`* `recipient`* `denom` `slippage_bps` | Non-custodial: returns the unsigned tx sequence (approve + swap, or 2 approves + 2 swaps for multi-hop) the caller's wallet must sign to swap a Robinhood Chain tokenized stock. Router = verified RobinhoodSwapRouter. Client signs, tool never holds funds. |
| `rh-stock-swap-quote` | $0.05 | `ticker`* `side`* `amount`* `denom` `slippage_bps` | Quote a buy/sell for a Robinhood Chain tokenized stock. Route + best-pool from on-chain V3 factory, spot from Chainlink (fallback DEX), expected & min out at your slippage, plus a first-order liquidity upper bound. Denom USDG (default) or WETH. |
| `rh-stock-swap-route` | $0.10 | `token_in`* `token_out`* | Full V3 route map for any Robinhood Chain pair. Probes all 4 fee tiers for a direct pool and both legs of a WETH-hopped route. Returns liquidity per tier so a client can pick / split its own path. Accepts 0x addresses or RWA tickers. |
| `token-momentum-scanner` | $0.20 | `min_mcap` | Real-time momentum scan for Base tokens — breakouts, volume spikes, narrative alignment. |
| `whale-copy-signal` | $0.25 | `wallet` `token` | Track and copy high-alpha whale wallets on Base — entry, size, and timing. |

### content (4)

| id | price | body | what it does |
|---|---|---|---|
| `community-growth-playbook` | $0.25 | `project`* `current_size` `goal` | Proven growth tactics for Base builder communities — from 0 to 1000 members. |
| `rh-rwa-readme` | $0.05 | `ticker`* | Markdown README section for embedding a Robinhood RWA in another repo. Includes chain config, live oracle usage, buy-button integration, safety notes. Live numbers embedded. |
| `rh-stock-report` | $0.20 | `ticker`* `horizon` | Concise Markdown research brief for a Robinhood Chain RWA: verified on-chain facts (Chainlink oracle + DEX depth) + Venice web-searched news headlines with source URLs. Temperature 0.3, LLM never invents numbers. |
| `thread-intelligence` | $0.20 | `topic`* `audience` `goal` | Turn your alpha or project update into a high-engagement X thread. |

### agent-economy (1)

| id | price | body | what it does |
|---|---|---|---|
| `multi-agent-workflow` | $0.25 | `goal`* `agents` | Design an automated workflow combining multiple agents for complex tasks. |

### base-ecosystem (2)

| id | price | body | what it does |
|---|---|---|---|
| `base-grant-finder` | $0.20 | `project`* `stage` `sector` | Find active grants, hackathons, and funding programs for Base builders. |
| `base-protocol-comparison` | $0.25 | `protocol_a`* `protocol_b`* `category` `use_case` | Side-by-side comparison of Base protocols for integrations and partnerships. |

### earn (2)

| id | price | body | what it does |
|---|---|---|---|
| `defi-yield-scan` | $0.05 | _(no body)_ | Hard-filter DeFi yield scan on Base — deduped by protocol, APY ≥ 4%, TVL ≥ $500K. Returns top 5 live opportunities. No LLM. |
| `lp-analyzer` | $0.25 | `token0`* `token1` `entryPrice` `investedAmount` | LP position analysis — impermanent loss, fee income, rebalance recommendation. |

### signal (8)

| id | price | body | what it does |
|---|---|---|---|
| `base-token-scan` | $0.05 | _(no body)_ | Hard-filter token scan on Base — 5 quality gates (vol, liquidity, depth ratio, momentum, scam filter). Returns ≤ 3 grounded signals only. No LLM. |
| `narrative-scan` | $0.10 | _(no body)_ | Detects active Base narratives from real trending token data. Tracks Emerging → Rising → Peak → Fading lifecycle in KV. Venice LLM grounded by GeckoTerminal. |
| `picks-check` | $0.00 | _(no body)_ | RETIRED — Blue Feed stopped writing the signal queue on 2026-06-27 and was retired on 2026-09-02, so this returns an EMPTY record, not a measured one, and will not resume. Free. When it ran it measured base-token-scan filter accuracy 22h after detection; WIN/LOSS = filter direction correct, not trading profit. Not financial advice. |
| `rh-stock-agent-brief` | $0.20 | `ticker`* | Agent-consumable JSON brief for a Robinhood Chain RWA. Deterministic market-hours-aware verdict: WATCH / ARB_LONG_DEX / ARB_SHORT_DEX (market OPEN) · FROZEN_ALIGNED / PREMARKET_DRIFT / AFTERHOURS_DRIFT (CLOSED) · THIN_LIQUIDITY / NO_ORACLE / INSUFFICIENT_DATA. Uses shared resolvePrimaryPool for cross-tool consistency. Web-search-grounded context + risk flags. |
| `rh-stock-alert` | $0.10 | `ticker`* `threshold_usd`* `direction` `recipient` `webhook_url` `persist` `ttl_hours` | Register a Chainlink-price threshold alert for a RH RWA. Polls Chainlink once at registration for immediate met/pending status; optionally persists to KV for a poller to watch. Above / below direction, USD threshold. |
| `rh-stock-arb` | $0.05 | `ticker`* | Chainlink oracle vs deepest DEX pool spot for a Robinhood Chain tokenized stock. Market-hours-aware verdict: OPEN → ALIGNED / LONG_DEX / SHORT_DEX (real arb); CLOSED → FROZEN_ALIGNED / PREMARKET_DRIFT / AFTERHOURS_DRIFT (Chainlink is frozen, DEX drift ≠ arb). Warnings for feed-abnormally-stale + thin pool. |
| `rh-stock-flow` | $0.10 | `ticker`* | Buy vs sell pressure over 24h from GeckoTerminal trades feed. Hard-mapped verdict (BUY_HEAVY / SELL_HEAVY / BALANCED) at 10% net-of-total threshold. Never fabricates flow. |
| `rh-stock-movers` | $0.05 | `limit` `min_tvl_usd` `min_volume_24h_usd` | Top gainers / losers 24h among Robinhood Chain tokenized stocks & ETFs. Dust-pool filter (default min $5k TVL + $500 24h volume) drops noise pools that would otherwise quote AAPL at $868 via a $453-TVL pool. Sign-filtered so a token with -1.56% never lands in gainers. Filtered pools surface as filtered_out for transparency. |

### portfolio (5)

| id | price | body | what it does |
|---|---|---|---|
| `rh-portfolio-rebalance` | $0.20 | `wallet`* `targets`* `min_swap_usd` | Target-allocation rebalance planner. Given a wallet + target weights map (e.g. {AAPL: 0.5, TSLA: 0.5}), returns an ordered swap plan (sell → buy pairs, USD-denominated) to move from current to target. Real math. Feeds into rh-stock-swap-prepare. |
| `rh-rwa-dca` | $0.20 | `wallet`* `ticker`* `amount_usd`* `cadence` `total_periods` `denom` `slippage_bps` `persist` | Recurring buy schedule for a Robinhood Chain RWA. Returns config (cadence, periods, next_run) + the first-run unsigned tx calldata. Optionally persists to Vercel KV for the DCA cron worker to execute per period. |
| `rh-sector-basket` | $0.10 | `sector` `tickers` `total_usd`* `weighting` `max_constituents` | Multi-buy plan for a sector or explicit ticker list. Input total USD + weighting (equal / market-cap-tvl proxy). Returns per-ticker allocation, live spot, expected units. Feeds each leg into rh-stock-swap-prepare for atomic-ish execution. |
| `rh-stock-holdings` | $0.05 | `wallet`* | Full RH RWA portfolio for a wallet: reads balanceOf for every canonical tokenized stock/ETF in the registry, prices non-zero balances via Chainlink (fallback DEX). Real on-chain reads. Never fabricates — value_usd is null when no price source exists, and any balance read that failed is reported in unread_count rather than counted as a zero. |
| `rh-stock-pnl` | $0.20 | `wallet`* `ticker` | Wallet position + trade activity per RH RWA token from Blockscout Transfer logs: transfer counts, cumulative in/out, first/last activity. Cost-basis PnL requires historical Chainlink reads and is deferred to v2 rather than fabricated. |

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

MCP serves 85 tools — 15 `blue_` + 63 `hub_` + 7 `b20_`.

Only the 64 `hub_` tools are drawn from the 111-tool catalog; `blue_` are the console commands
and `b20_` are MCP-only calldata builders that take no x402 payment. So **none of these
numbers is interchangeable with another** — a count always belongs to the one surface it was
measured on. If you need a total, measure the surface you are actually calling.

## Skills (grounding files)

36 grounding files live in `skills/` and are loaded before LLM calls. The frequently-used core:

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
