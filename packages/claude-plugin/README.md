# Blue Agent — Claude Plugin

Claude Code plugin for Base builders. One install gives you 18 MCP tools plus
the whole 110-tool Blue Hub catalog behind two of them.

## Install

```bash
# Add marketplace
claude plugin marketplace add madebyshun/blue-agent

# Install plugin
claude plugin install blue-agent
```

## What you get

> Rewritten 2026-09-26. These tables listed 21 tools, **17 of which no longer
> resolve**, each with a price — and the prices were wrong twice over: they were
> the x402 catalog prices, while an MCP tool here runs **free**. (`hub_builder_score`
> was listed at $0.001 and has never had a price, because it has never been a
> tool.) The manifest was cut from 85 to 18 that day for context, not scope: all
> 110 catalog tools stay live and are reached through `blue_registry` → `blue_call`.

### Discovery and execution
| Tool | What it does | Cost |
|------|-------------|------|
| `blue_registry` | Search the 110-tool catalog — id, price, input shape | Free |
| `blue_call` | Run any catalog tool by id | **x402** — you sign, from your own wallet |
| `blue_swap_tx` | Unsigned swap calldata, `chain` required | Free |
| `blue_send_tx` | Unsigned ERC-20 / native transfer | Free |
| `blue_bridge_tx` | Unsigned bridge, Base ⇄ Robinhood Chain | Free |
| `b20_encode_payment` | B20 `transferWithMemo` calldata, Base only | Free |

Execution tools return **unsigned calldata**. Blue Agent never holds a key,
never broadcasts, and cannot pull funds — you sign in your own wallet.

### Live reads — Base 8453
| Tool | What it does |
|------|-------------|
| `hub_hood_arrow` | Open a Blue Hood signal (pass `chain` when the user named one) |
| `hub_token_price` | Live price, mcap, volume |
| `hub_wallet_holdings` | Balances with USD values |
| `hub_pool_scan` | Trending pools |
| `hub_gas_tracker` | Live gas, USD cost per action |

### Safety — run before money moves
| Tool | What it does |
|------|-------------|
| `hub_risk_gate` | Screen a pending transaction |
| `hub_honeypot` | Can the token be sold at all |
| `hub_contract_trust` | Source, upgradeability, admin powers |
| `hub_wallet_risk` | AML / sanctions exposure of an address |
| `hub_liquidity_depth` | Can the position be closed, at what cost |

### Console
| Tool | What it does |
|------|-------------|
| `blue_build` | Architecture + stack |
| `blue_audit` | Security review, 500+ checks |

`blue_idea`, `blue_ship` and `blue_raise` are Skills in this plugin rather than
MCP tools — progressive disclosure costs no context until they load.

## Usage examples

After installing, use the `/blue` command or just chat naturally:

```
/blue idea A USDC streaming payroll app for remote teams on Base
/blue build An ERC-4337 agent wallet with x402 payments
/blue audit [paste your Solidity contract]

"token pick on Base today"
"check 0x1234... for honeypot"
"am I ready to raise?"
"what's the market fit for my DeFi app?"
```

## Auth

Tools marked with $ use x402 micropayments — USDC on Base per call.
No subscription, no API key needed.

## Links

- Web: https://blueagent.dev
- API Docs: https://blueagent.dev/api-docs
- GitHub: https://github.com/madebyshun/blue-agent
- X: https://x.com/blueagent_
