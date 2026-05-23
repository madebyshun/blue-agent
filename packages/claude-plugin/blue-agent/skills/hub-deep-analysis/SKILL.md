---
name: Blue Hub — Deep Analysis
description: Use when user wants comprehensive due diligence on a token. Triggers — "deep analysis", "DD on", "due diligence", "token fundamentals", "on-chain analysis", "holder distribution", "is this legit", "research X token".
version: 1.0.0
---

# Hub Deep Analysis — Token Fundamentals

Comprehensive token analysis — on-chain activity, holder distribution, risk signals.

## What it produces

| Section | Content |
|---------|---------|
| On-chain activity | Transaction volume, unique wallets, growth |
| Holder distribution | Top holders %, concentration risk |
| Liquidity | Pool depth, locked/unlocked |
| Risk signals | Red flags (bundled supply, dev wallet, etc.) |
| Verdict | SAFE / CAUTION / HIGH RISK |

## MCP Tool

```
hub_deep_analysis(token: string)
```

## Inputs

- `token` — token contract address on Base (required)

## Example

```
hub_deep_analysis("0xf895783b2931c919955e18b5e3343e7c7c456ba3")
```

## Price

$0.001 per call
