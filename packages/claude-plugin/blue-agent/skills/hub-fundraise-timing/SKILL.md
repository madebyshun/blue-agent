---
name: Blue Hub — Fundraise Timing
description: Use when user wants to know if now is the right time to raise. Triggers — "should I raise now", "fundraise timing", "is the market good for raising", "when to raise", "investor appetite", "ready to raise?".
version: 1.0.0
---

# Hub Fundraise Timing — Raise Readiness

Assesses if now is the right time to raise — market conditions, stage readiness, investor appetite.

## What it produces

| Section | Content |
|---------|---------|
| Market conditions | Current fundraising climate |
| Stage readiness | Are your metrics investor-ready? |
| Investor appetite | Active investors in your space |
| Verdict | RAISE NOW / WAIT / BOOTSTRAP |
| What to hit first | If WAIT — metrics to reach before raising |

## MCP Tool

```
hub_fundraise_timing(project: string, stage?: string)
```

## Inputs

- `project` — project description (required)
- `stage` — current stage and key metrics (optional but improves accuracy)

## Example

```
hub_fundraise_timing(
  "USDC streaming payroll on Base",
  "Pre-seed. 500 users, $12k MRR, 3 pilots. Raising $500k."
)
```

## Price

$0.20 per call
