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

## How to run it

> Changed 2026-09-26. There is **no `hub_ecosystem` MCP tool any more.** The MCP
> manifest was cut from 85 tools to 18 to keep agent context small. The tool itself
> is unchanged and still live — it is now reached through the paid door.

```
blue_call(tool: "ecosystem-digest", input: { focus?: string })
```

`blue_call` charges x402. The first call returns HTTP 402 with payment requirements;
sign them with your own wallet and call again with `payment: <base64 X-PAYMENT>`.
Blue Agent never holds your key and authorises one exact amount per call.

## Inputs

- `focus` — area to focus on: "DeFi", "AI agents", "NFT", "gaming" (optional)

## Example

```
blue_call(tool: "ecosystem-digest", input: {
  focus: "DeFi and AI agents"
})
```

## Price

$0.20 per call
