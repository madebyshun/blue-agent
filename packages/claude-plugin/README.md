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

> Rewritten 2026-10-22 for **Blue Agent MCP v2**: 13 tools, five of them paid
> per call in USDC on Base over the x402 MCP transport. The v1 names still
> answer until 2026-11-22 with a note naming their replacement. The rest of the x402 catalog is still reached
> through `blue_registry` → `blue_call`.

### Paid — x402, you sign from your own wallet
| Tool | What it does | Price |
|------|-------------|-------|
| `swap_prepare` | Unsigned swap on Base or Robinhood Chain, token checked first | $0.01 |
| `token_verdict` | no_issues_found / caution / avoid, with reasons, price and liquidity | $0.01 |
| `stock_signal` | Tokenized stock vs the real stock, or Base vs Robinhood Chain | $0.01 |
| `trending_safe` | Trending Base tokens with contract tax and exit depth | $0.05 |
| `wallet_risk` | Is this address flagged (theft, phishing, sanctions) | $0.01 |

Bad input is refused before any price is quoted, and a call that fails is not charged.

### Free
| Tool | What it does |
|------|-------------|
| `token_price` | Live price, mcap, volume on Base |
| `send_prepare` | Unsigned ERC-20 / native transfer, recipient checked |
| `bridge_prepare` | Unsigned bridge, Base ⇄ Robinhood Chain |
| `sign_check` | What signing this transaction or signature will do |
| `approvals_audit` | Open approvals and which to revoke |
| `blue_registry` | Search the rest of the x402 catalog |
| `blue_call` | Run any catalog id (x402 — you sign) |
| `blue_doctor` | Is a failure an outage or your input |

Every builder returns **unsigned calldata**. Blue Agent never holds a key,
never broadcasts, and cannot pull funds — you sign in your own wallet.

`blue_idea`, `blue_ship` and `blue_raise` are Skills in this plugin; build and
audit run as the catalog ids `blue-build` / `blue-audit` through `blue_call`.

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
