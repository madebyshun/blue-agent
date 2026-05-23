---
name: Blue Hub — Whale Signal
description: Use when user wants to track whale wallet moves or get copy-trade signals for a token. Triggers — "whale signal", "smart money", "what are whales buying", "copy trade", "large wallet moves", "track whales".
version: 1.0.0
---

# Hub Whale Signal — Copy-Trade Intelligence

Tracks large wallet moves for a token and generates copy-trade signals.

## What it produces

| Field | Content |
|-------|---------|
| Whale wallets | Addresses with large positions |
| Recent moves | Buy/sell transactions above threshold |
| Signal | BUY / SELL / HOLD with size context |
| Conviction | Based on number of whales moving together |

## MCP Tool

```
hub_whale_signal(token: string, min_usd?: number)
```

## Inputs

- `token` — token contract address on Base (required)
- `min_usd` — minimum trade size to track in USD (default: 10000)

## Example

```
hub_whale_signal("0xf895783b2931c919955e18b5e3343e7c7c456ba3", 5000)
```

## Important

Always verify the token address is correct on Basescan before using. Run `hub_honeypot` first on unfamiliar tokens.

## Price

$0.005 per call
