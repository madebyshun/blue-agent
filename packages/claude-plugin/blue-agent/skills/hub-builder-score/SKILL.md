---
name: Blue Hub — Builder Score
description: Use when user wants to check a builder's score or reputation. Triggers — "builder score", "check my score", "how active is X on Base", "onchain reputation", "shipping score", "who is this builder".
version: 1.0.0
---

# Hub Builder Score — Onchain Reputation

Builder Score for an X/Twitter handle — on-chain activity, shipping history, community (0-100).

## What it produces

| Field | Content |
|-------|---------|
| Score | 0-100 overall Builder Score |
| On-chain activity | Transactions, contracts deployed |
| Shipping | Projects shipped, repos, releases |
| Community | Followers, engagement, influence |
| Tier | Explorer / Builder / Founder / Legend |

## MCP Tool

```
hub_builder_score(handle: string)
```

## Inputs

- `handle` — X/Twitter handle without @ (required)

## Example

```
hub_builder_score("madebyshun")
```

## Price

$0.001 per call
