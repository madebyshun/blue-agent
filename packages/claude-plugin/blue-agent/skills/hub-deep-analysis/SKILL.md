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

## How to run it

> Changed 2026-09-26. There is **no `hub_deep_analysis` MCP tool any more.** The MCP
> manifest was cut from 85 tools to 18 to keep agent context small. The tool itself
> is unchanged and still live — it is now reached through the paid door.

```
blue_call(tool: "deep-analysis", input: { token: string })
```

`blue_call` charges x402. The first call returns HTTP 402 with payment requirements;
sign them with your own wallet and call again with `payment: <base64 X-PAYMENT>`.
Blue Agent never holds your key and authorises one exact amount per call.

## Inputs

- `token` — token contract address on Base (required)

## Example

```
blue_call(tool: "deep-analysis", input: {
  token: "0xf895783b2931c919955e18b5e3343e7c7c456ba3"
})
```

## Price

$0.001 per call
