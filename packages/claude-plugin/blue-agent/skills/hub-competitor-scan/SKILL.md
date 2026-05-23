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

## MCP Tool

```
hub_competitor_scan(project: string, category?: string)
```

## Inputs

- `project` — your project description (required)
- `category` — category e.g. "DeFi lending", "AI agent" (optional, improves accuracy)

## Example

```
hub_competitor_scan(
  "USDC streaming payroll for remote teams on Base",
  "payroll, B2B SaaS, DeFi"
)
```

## Price

$0.20 per call
