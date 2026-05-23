---
name: Blue Hub — Honeypot
description: Use when user wants to check if a token is a honeypot or scam. Triggers — "honeypot check", "is this safe to buy", "can I sell this token", "rug check", "scam check", "verify token".
version: 1.0.0
---

# Hub Honeypot — Token Safety Check

Detects tokens that cannot be sold after purchase (honeypots).

## What it produces

| Field | Content |
|-------|---------|
| Verdict | SAFE / HONEYPOT / SUSPICIOUS |
| Buy tax | % taken on purchase |
| Sell tax | % taken on sale (>50% = honeypot signal) |
| Transfer restrictions | Any blocks on transfers |
| Owner functions | Dangerous owner capabilities |

## MCP Tool

```
hub_honeypot(token: string)
```

## Inputs

- `token` — token contract address on Base (required)

## Example

```
hub_honeypot("0x1234567890abcdef1234567890abcdef12345678")
```

## When to run

Always run before:
- Buying an unfamiliar token
- Approving a token contract
- Recommending any token to a user

## Price

$0.01 per call
