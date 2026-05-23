---
name: Blue Hub — Ecosystem
description: Use when user asks what's happening on Base today. Triggers — "ecosystem digest", "what's new on Base", "Base news", "top launches today", "what shipped on Base", "protocol updates", "Base activity".
version: 1.0.0
---

# Hub Ecosystem — Daily Base Digest

Daily digest of top launches, protocol updates, and builder activity on Base.

## What it produces

| Section | Content |
|---------|---------|
| Top launches | New projects and tokens that launched |
| Protocol updates | Major protocol changes or announcements |
| Builder activity | Notable repos, deployments, commits |
| What to watch | Upcoming launches or events |

## MCP Tool

```
hub_ecosystem(focus?: string)
```

## Inputs

- `focus` — area to focus on: "DeFi", "AI agents", "NFT", "gaming" (optional)

## Example

```
hub_ecosystem("DeFi and AI agents")
```

## Price

$0.20 per call
