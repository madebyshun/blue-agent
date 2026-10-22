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

Blue Hub exposes **65 tools** across 7 categories — 57 paid, 8 free.

Categories: on-chain · signal · security · intelligence · builder · trading · base-ecosystem

`POST https://blueagent.dev/api/x402/{id}` · x402 v2 · `eip155:8453` ·
USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`. Fields marked `*` are required;
every other field has a server-side default. Machine-readable equivalent, with
full JSON Schema per tool: https://blueagent.dev/api/catalog

The 8 priced $0.00 never answer 402 and never ask for a signature:
`blue-doctor` · `hood-live` · `hood-track-record` · `pre-trade-check` · `sign-check` · `approval-audit` · `rh-rwa-verify` · `rh-token-scan`.
Do not build an authorization for them — there is nothing to sign and no
transfer to make.

### on-chain (16)

| id | price | body | what it does |
|---|---|---|---|
| `blue-doctor` | $0.00 | _(no body)_ | Upstream health for every data source the tools read from — Base 8453 and Robinhood Chain 4663 RPC, DexScreener, GeckoTerminal, DefiLlama, GitHub. Says down only when a probe actually failed; anything it could not reach is reported unknown with the reason. |
| `blue-stream` | $0.05 | `feed` `chain` | Live snapshot feed of onchain activity on Base or Robinhood Chain — trending & new pools, TVL, real price/volume/liquidity. Pure real data, poll for a near-real-time feed. |
| `dex-flow` | $0.15 | `token`* | DEX volume, buy/sell pressure and liquidity flow for any Base token — live DexScreener data. |
| `gas-tracker` | $0.01 | _(no body)_ | Live Base gas price + USD cost estimates for common actions. |
| `pool-scan` | $0.02 | `limit` | Trending + newly-active Base pools with the chain TVL snapshot. |
| `protocol-risk-monitor` | $0.35 | `protocol`* `position` | Real-time risk assessment for your DeFi positions — exit signals, risk scores. |
| `rh-rwa-index` | $0.02 | _(no body)_ | Full canonical Robinhood Chain RWA catalog — every token the RHJ factory has deployed (180+ tokenized stocks, 20+ ETFs), plus Chainlink-only feeds. Zero-input. A listing proves RHJ issued the token; it does not imply the token is tradable. For portfolio dashboards + sector basket builders. |
| `rh-stock-holders` | $0.05 | `ticker` `contract` `limit` | Top holders + concentration score for a RH RWA token. Real Blockscout data. Returns top-N shares + HHI (0 = flat / 10 000 = single holder). |
| `rh-stock-liquidity` | $0.05 | `ticker`* | Live DEX pool + TVL + slippage estimate for a Robinhood Chain tokenized stock. First-order xy=k slippage on ONE-side USD depth (reserve_usd / 2) — the total-TVL version under-estimates by ~2×. V4 concentrated-liquidity caveat included. All pools sorted by depth. |
| `rh-stock-new-listings` | $0.05 | `since_days` `limit` | Reads every `Deployed` event from the canonical RHJ token factory and diffs it against our registry. Provenance is structural — an impersonator cannot emit the real factory's events — so anything listed here is a genuine RH stock token, and anything missing from the registry is a real new listing. |
| `rh-stock-ohlc` | $0.05 | `ticker`* `timeframe` `limit` | OHLC candle history for a Robinhood Chain tokenized stock. Timeframes: minute / hour / day. Backed by GeckoTerminal pool history — deepest-liquidity pool auto-selected. Returns candles + summary (high, low, total volume, % change). |
| `rh-stock-quote` | $0.03 | `ticker`* | Deterministic live quote for Robinhood Chain tokenized stocks. On-chain Chainlink AggregatorV3 latestRoundData → raw answer + decimals + updatedAt + staleness. Falls back to DEX spot only if no feed exists. The one embed-friendly price tool. |
| `rh-stock-search` | $0.02 | `query`* `limit` | Fuzzy search across the canonical Robinhood Chain RWA registry. Typo-tolerant (Levenshtein + prefix). Returns top-N ranked matches. Never fabricates a contract address. |
| `safe-trending` | $0.15 | `min_liquidity_usd` `limit` | Trending Base tokens, each with its buy/sell tax read from the contract and its exit depth. SAFE here = tradeable with verified tax. A clean scan is not a buy signal. |
| `token-price` | $0.01 | `token`* | Live price, mcap, volume and liquidity for any Base token (DexScreener). |
| `wallet-holdings` | $0.02 | `address`* | Live ERC-20 + ETH holdings and USD value for a Base wallet (Moralis). |

### signal (5)

| id | price | body | what it does |
|---|---|---|---|
| `hood-live` | $0.00 | `chain` | Every tokenized stock Blue Hood is watching right now, on both live venues: Chainlink oracle price, deepest-pool DEX spot, and the drift between them. Each row carries its own chain, chain_id and explorer link, because NVDA/META/GOOGL/AAPL exist on Base 8453 AND Robinhood Chain 4663 as different tokens in different pools. Rows come from the last completed 5-minute poll cycle, not a fresh quote — data_age_seconds and is_stale are part of the answer. Ungraded by construction; for the graded record use Blue Hood Track Record. Free. |
| `hood-track-record` | $0.00 | `limit` | Blue Hood's own scoreboard — every public arrow with its graded outcome (HIT / MISS / VOID, VOID included), the raw counts, and the hit-rate we are allowed to publish. The headline passes a sample gate: below the published threshold you get ready:false with graded + needed and no percentage at all, plus a Wilson 95% interval once it clears. Receipts are returned freely so you can recompute it yourself — the window block tells you whether you were handed the whole record or the newest N of a longer one. An unreadable feed answers 503, never an empty record. Free. |
| `rh-stock-agent-brief` | $0.20 | `ticker`* | Agent-consumable JSON brief for a Robinhood Chain RWA. Deterministic market-hours-aware verdict: WATCH / ARB_LONG_DEX / ARB_SHORT_DEX (market OPEN) · FROZEN_ALIGNED / PREMARKET_DRIFT / AFTERHOURS_DRIFT (CLOSED) · THIN_LIQUIDITY / NO_ORACLE / INSUFFICIENT_DATA. Uses shared resolvePrimaryPool for cross-tool consistency. Model-recall context (no web search on this gateway) + risk flags. |
| `rh-stock-arb` | $0.05 | `ticker`* | Chainlink oracle vs deepest DEX pool spot for a Robinhood Chain tokenized stock. Market-hours-aware verdict: OPEN → ALIGNED / LONG_DEX / SHORT_DEX (real arb); CLOSED → FROZEN_ALIGNED / PREMARKET_DRIFT / AFTERHOURS_DRIFT (Chainlink is frozen, DEX drift ≠ arb). Warnings for feed-abnormally-stale + thin pool. |
| `rh-stock-movers` | $0.05 | `limit` `min_tvl_usd` `min_volume_24h_usd` | Top gainers / losers 24h among Robinhood Chain tokenized stocks & ETFs. Dust-pool filter (default min $5k TVL + $500 24h volume) drops noise pools that would otherwise quote AAPL at $868 via a $453-TVL pool. Sign-filtered so a token with -1.56% never lands in gainers. Filtered pools surface as filtered_out for transparency. |

### security (15)

| id | price | body | what it does |
|---|---|---|---|
| `approval-audit` | $0.00 | `wallet`* `chain` | Everything a wallet has granted that is still live: ERC-20 allowances, NFT operator-for-all and Permit2 grants, each re-read from chain state so spent or revoked grants are not reported. For each: the amount exposed (min of allowance and balance), whether the spender is a contract or a plain wallet, GoPlus flags, a level picked in code (BLOCK = flagged spender, revoke now; WARN = unlimited, plain-wallet spender, operator-for-all, Permit2 valid >30 days; INFO = bounded to a contract), and an UNSIGNED revoke transaction the owner signs. An unread source is listed in `unread`, never shown as 'no approvals'. Base 8453 or Robinhood Chain 4663. No LLM. Free — safety checks should never be gated. |
| `b20-analyze` | $0.05 | `action` `address` `context` | B20 (Base Native Token Standard) guide — variants, roles, policies, integration tips. Powered by Beryl upgrade docs. |
| `b20-inspect` | $0.005 | `address`* `network` | Live on-chain B20 token inspector — reads real state from Base RPC via multicall. Returns isB20 flag, name/symbol/decimals, totalSupply, supplyCap, variant (ASSET/STABLECOIN), pause status per feature, and policy IDs per transfer/mint scope. Zero LLM. |
| `blue-monitor` | $0.20 | `target`* `focus` | On-demand health + risk snapshot for a Base token/contract — live price, liquidity, verification, risk signals, and a watch plan with alert thresholds. |
| `contract-trust` | $0.15 | `address`* `context` | Audit any Base contract before swapping or interacting. Basescan verification + security scan + community signal. Verdict: SAFE / CAUTION / RED_FLAG. |
| `deep-analysis` | $0.50 | `token`* `context` | Full due diligence on any Base token — security score, market fundamentals, on-chain activity, and composite verdict. |
| `honeypot-check` | $0.10 | `token`* | Detect honeypot tokens that can be bought but not sold. Transfer tax analysis + rug pattern detection on Base. |
| `key-exposure` | $0.50 | `address`* | Check if a wallet's public key is exposed on-chain (quantum vulnerability). Verdict computed from the real Base RPC nonce — never fabricated. EXPOSED means the key is visible, not that funds are at immediate risk. |
| `liquidity-depth` | $0.03 | `token`* `trade_size_usd` | Liquidity depth, slippage estimate and exit risk for a Base token. |
| `pre-trade-check` | $0.00 | `token`* `chain` `kind` `recipient` `sender` | Call before signing. Is this address a real token or a pool, an impostor of a canonical stock token (Base B20 desk, Robinhood registry), a honeypot or a taxed token (tax read by eth_call), and is a stock token's DEX price adrift from its Chainlink oracle? Returns PASS / WARN / BLOCK plus machine-readable reason codes; the verdict is picked in code, no LLM. BLOCK only on evidence; an unread tax is a WARN that says so. For a send, pass recipient (and sender) and the address is checked too: zero address, the token's own contract, flagged for theft or sanctions (GoPlus), a contract, or a look-alike of an address the sender paid before (address poisoning). Base 8453 or Robinhood Chain 4663. The same check Blue Agent's own swap, send and bridge builders gate on. Free — safety checks should never be gated. |
| `rh-rwa-verify` | $0.00 | `contract`* `expected_ticker` | Given a contract address on Robinhood Chain, is it a canonical RHJ-issued stock token or an impersonator? Cross-checks registry + live ERC-20 metadata. Surfaces the real contract when a fake claims a matching ticker. Free — safety checks should never be gated. |
| `rh-token-scan` | $0.00 | `contract`* | What can the owner still do to this token? Reads a Virtuals AgentToken / AgentTokenV4 on Robinhood Chain 4663 straight off the bytecode: buy/sell tax in basis points, projectTaxRecipient, vault, owner and pendingOwner, the blacklists(address) lever, and the bot-protection window. Selector probes, not contract names — a deployer picks the name, not the bytecode. Every unread field stays null and is listed in `unread`, because on this template a zero owner, a zero pendingOwner and a zero bot window are all the reassuring answer. No LLM. Free — safety checks should never be gated. |
| `risk-gate` | $0.20 | `to`* `action` `value` | Pre-transaction risk assessment — screen any address or swap for drainer patterns, AML signals, and malicious contracts. |
| `sign-check` | $0.00 | `chain` `from` `tx` `typed_data` | Call before a wallet signs anything. A transaction is decoded (approve, permit, Permit2, setApprovalForAll, transfer) and simulated with eth_simulateV1, so the answer lists the assets that would leave and arrive. EIP-712 typed data is decoded — ERC-2612 and DAI permits, Permit2 single/batch/transfer-from/witness, Seaport orders — because an off-chain signature moves nothing until the spender uses it. An EIP-7702 authorization names who would run code as the account. Returns PASS / WARN / BLOCK with plain-language summary lines and reason codes, picked in code (no LLM). BLOCK only on evidence: a spender, operator or delegate flagged for theft or sanctions (GoPlus), or a Seaport order that gives items away for nothing. Unlimited or long-lived grants, grants to plain wallets, any 7702 delegation, reverting or out-only simulations, and anything unreadable are WARN. Base 8453 or Robinhood Chain 4663. Free — safety checks should never be gated. |
| `wallet-risk` | $0.05 | `address`* | Is this address known to be dangerous? GoPlus flags (theft, phishing, sanctions, laundering, mixer) with their sources, the explorer's scam mark, and chain facts (wallet / contract / EIP-7702 account, nonce, balance). Verdict in code: FLAGGED, CAUTION or NO_KNOWN_FLAGS — never CLEAN. Feed unread → 502, not charged. Base 8453 or Robinhood Chain 4663. No LLM. |

### intelligence (8)

| id | price | body | what it does |
|---|---|---|---|
| `blue-analytics` | $0.25 | `target`* `focus` | Performance/metrics read on a Base token — live price, momentum, liquidity health, volume/liquidity ratio, growth signals. Real DexScreener data. |
| `blue-research` | $1.00 | `topic`* `target` | Deep DD memo on a Base project, narrative, or token — thesis, bull/bear, risks, contrarian take, verdict. Grounds in live market data when a token address is given. |
| `ecosystem-digest` | $0.20 | _(no body)_ | Weekly Base ecosystem intelligence: top builders, protocols, and narratives. |
| `market-fit` | $0.25 | `description`* `name` `stage` | Score your product's market fit against live Base market context — verdict, gaps, and what to fix first. |
| `narrative-position` | $0.15 | `topic` `focus` | Which narratives are building vs peaking on CT — and where to position. |
| `narrative-pulse` | $0.10 | `focus` | Live Base narrative phases, velocity and entry windows. |
| `token-launch-readiness` | $0.30 | `name`* `project`* `description` | Go/no-go signal on whether your project is ready to launch a token. |
| `token-pick-signal` | $0.20 | `chain` `context` | The top Base token by an on-chain quality score (liquidity, turnover, momentum) — facts from live pools, no buy/sell call. |

### builder (16)

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
| `competitor-scan` | $0.20 | `project`* `description`* `competitors` | Identify direct/indirect competitors and surface your defensible edge. |
| `defi-opportunity` | $0.25 | `strategy` `risk_tolerance` | Scan Base DeFi for emerging yield, liquidity, and protocol opportunities. |
| `repo-health` | $0.20 | `repo`* `description`* | Audit your GitHub repo health: code quality, docs, CI, contributor signals. |

### trading (3)

| id | price | body | what it does |
|---|---|---|---|
| `rh-stock-swap-prepare` | $0.05 | `ticker`* `side`* `amount`* `recipient`* `denom` `slippage_bps` | Non-custodial: returns the unsigned tx sequence (approve + swap, or 2 approves + 2 swaps for multi-hop) the caller's wallet must sign to swap a Robinhood Chain tokenized stock. Router = verified RobinhoodSwapRouter. Client signs, tool never holds funds. |
| `rh-stock-swap-quote` | $0.05 | `ticker`* `side`* `amount`* `denom` `slippage_bps` | Quote a buy/sell for a Robinhood Chain tokenized stock. Route + best-pool from on-chain V3 factory, spot from Chainlink (fallback DEX), expected & min out at your slippage, plus a first-order liquidity upper bound. Denom USDG (default) or WETH. |
| `token-momentum-scanner` | $0.20 | `min_mcap` | Real-time momentum scan for Base tokens — breakouts, volume spikes, narrative alignment. |

### base-ecosystem (2)

| id | price | body | what it does |
|---|---|---|---|
| `base-grant-finder` | $0.20 | `project`* `stage` `sector` | Find active grants, hackathons, and funding programs for Base builders. |
| `base-protocol-comparison` | $0.25 | `protocol_a`* `protocol_b`* `category` `use_case` | Side-by-side comparison of Base protocols for integrations and partnerships. |

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

MCP serves 13 tools — 5 paid + 8 free.

Since MCP v2 (2026-10-22) five tools are paid per call over the x402 MCP transport
(`swap_prepare`, `token_verdict`, `stock_signal`, `trending_safe`, `wallet_risk`);
the free ones are the transaction builders, the safety checks nobody pays for, the
door to the catalog (`blue_registry`, `blue_call`) and `blue_doctor`. So **none of these numbers is interchangeable with another** —
a count always belongs to the one surface it was measured on. If you need a total, measure the
surface you are actually calling.

**Cut from 85 to 18 on 2026-09-26, and the cut removed no capability.** The 85-tool manifest
was 32,160 bytes — roughly 8,000 tokens spent before the agent read a single word of the user's
question — and published MCP research finds tool-selection accuracy degrades sharply past
~40 always-loaded entries. All 65 catalog tools remain live at `/api/x402/<id>`; `blue_registry`
lists them and `blue_call` runs any of them, so the rest moved from "always in context" to
"one lookup away". A manifest is a context budget, not an inventory.

`blue_call` is the one tool here that **charges**. It forwards no internal bypass header, so an
unpaid call returns a real HTTP 402 with payment requirements the agent settles from its own
wallet. The other 17 run free.

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
