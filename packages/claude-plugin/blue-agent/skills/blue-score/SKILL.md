---
name: Blue Agent — Score
description: Use when user wants to look up an onchain builder score by GitHub handle, Farcaster handle, or wallet address. Triggers — "blue score", "check my score", "builder score", "onchain score", "how active am I on Base", "score for 0x...".
version: 1.0.0
---

# Blue Score — Onchain Builder Score

Builder Score (0-100) for any GitHub handle, Farcaster handle, or wallet address on Base.

## What it produces

| Field | Content |
|-------|---------|
| Score | 0-100 overall Builder Score |
| On-chain activity | Transactions, contracts, volume |
| Contributions | GitHub commits, open source activity |
| Farcaster | Social presence and engagement |
| Tier | Explorer / Builder / Founder / Legend |

## MCP Tool

```
blue_score(handle: string)
```

## Inputs

- `handle` — GitHub handle, Farcaster handle, or wallet address `0x...` (required)

## Examples

```
blue_score("madebyshun")          // GitHub handle
blue_score("shun.eth")             // ENS / Farcaster
blue_score("0xf895783b...")        // wallet address
```

## Difference from hub_builder_score

- `blue_score` — takes GitHub/Farcaster/wallet, broader input types
- `hub_builder_score` — takes X/Twitter handle specifically

## Price

Free (no x402 required)
