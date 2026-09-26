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

## How to run it

> Changed 2026-09-26. There is **no `hub_investor_memo` MCP tool any more.** The MCP
> manifest was cut from 85 tools to 18 to keep agent context small. The tool itself
> is unchanged and still live — it is now reached through the paid door.

```
blue_call(tool: "investor-memo", input: { project: string, description: string, ask?: string })
```

`blue_call` charges x402. The first call returns HTTP 402 with payment requirements;
sign them with your own wallet and call again with `payment: <base64 X-PAYMENT>`.
Blue Agent never holds your key and authorises one exact amount per call.

## Inputs

- `project` — project name (required)
- `description` — description + current traction/metrics (required)
- `ask` — raise amount and stage e.g. "$500k pre-seed" (optional)

## Example

```
blue_call(tool: "investor-memo", input: {
  project: "StreamPay",
  description: "USDC streaming payroll on Base. 500 beta users, $12k MRR, 3 enterprise pilots.",
  ask: "$500k pre-seed to hire 2 engineers"
})
```

## Price

$0.35 per call
