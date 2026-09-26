---
name: Blue Hub — Competitor Scan
description: Use when user wants to understand the competitive landscape for their project. Triggers — "competitor analysis", "who are my competitors", "competitive landscape", "defensible edge", "differentiation", "what else exists".
version: 1.0.0
---

# Hub Competitor Scan — Competitive Analysis

Direct/indirect competitor mapping and defensible edge analysis.

## What it produces

| Section | Content |
|---------|---------|
| Direct competitors | Same problem, same audience |
| Indirect competitors | Alternative solutions |
| Your edge | Specific defensible advantages |
| Gaps | What competitors are missing |
| Positioning | How to position vs. competition |

## How to run it

> Changed 2026-09-26. There is **no `hub_competitor_scan` MCP tool any more.** The MCP
> manifest was cut from 85 tools to 18 to keep agent context small. The tool itself
> is unchanged and still live — it is now reached through the paid door.

```
blue_call(tool: "competitor-scan", input: { project: string, category?: string })
```

`blue_call` charges x402. The first call returns HTTP 402 with payment requirements;
sign them with your own wallet and call again with `payment: <base64 X-PAYMENT>`.
Blue Agent never holds your key and authorises one exact amount per call.

## Inputs

- `project` — your project description (required)
- `category` — category e.g. "DeFi lending", "AI agent" (optional, improves accuracy)

## Example

```
blue_call(tool: "competitor-scan", input: {
  project: "USDC streaming payroll for remote teams on Base",
  category: "payroll, B2B SaaS, DeFi"
})
```

## Price

$0.20 per call
