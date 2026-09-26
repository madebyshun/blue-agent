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

## How to run it

> Changed 2026-09-26. There is **no `hub_whale_signal` MCP tool any more.** The MCP
> manifest was cut from 85 tools to 18 to keep agent context small. The tool itself
> is unchanged and still live — it is now reached through the paid door.

```
blue_call(tool: "whale-copy-signal", input: { token: string, min_usd?: number })
```

`blue_call` charges x402. The first call returns HTTP 402 with payment requirements;
sign them with your own wallet and call again with `payment: <base64 X-PAYMENT>`.
Blue Agent never holds your key and authorises one exact amount per call.

## Inputs

- `token` — token contract address on Base (required)
- `min_usd` — minimum trade size to track in USD (default: 10000)

## Example

```
blue_call(tool: "whale-copy-signal", input: {
  token: "0xf895783b2931c919955e18b5e3343e7c7c456ba3",
  min_usd: 5000
})
```

## Important

Always verify the token address is correct on Basescan before using. Run `hub_honeypot` first on unfamiliar tokens.

## Price

$0.005 per call
