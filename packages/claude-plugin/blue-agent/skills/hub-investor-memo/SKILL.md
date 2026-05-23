---
name: Blue Hub — Investor Memo
description: Use when user wants to write an investor memo or pitch document. Triggers — "investor memo", "write my pitch", "pitch doc", "one-pager", "investment thesis", "send to investors", "fundraising doc".
version: 1.0.0
---

# Hub Investor Memo — Full Pitch Document

Generates a full investor memo — thesis, market, moat, risks, ask. Ready to send.

## What it produces

| Section | Content |
|---------|---------|
| Executive summary | 3-sentence hook |
| Thesis | Why this wins, key insight |
| Market | TAM/SAM/SOM, growth vectors |
| Product | What it does, traction so far |
| Moat | Defensibility, unfair advantages |
| Risks | Top 3 + mitigation |
| The ask | Amount, use of funds, milestones |
| Team | How to present founder background |

## MCP Tool

```
hub_investor_memo(project: string, description: string, ask?: string)
```

## Inputs

- `project` — project name (required)
- `description` — description + current traction/metrics (required)
- `ask` — raise amount and stage e.g. "$500k pre-seed" (optional)

## Example

```
hub_investor_memo(
  "StreamPay",
  "USDC streaming payroll on Base. 500 beta users, $12k MRR, 3 enterprise pilots.",
  "$500k pre-seed to hire 2 engineers"
)
```

## Price

$0.35 per call
