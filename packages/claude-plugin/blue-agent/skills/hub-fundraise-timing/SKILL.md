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

## How to run it

> Changed 2026-09-26. There is **no `hub_fundraise_timing` MCP tool any more.** The MCP
> manifest was cut from 85 tools to 18 to keep agent context small. The tool itself
> is unchanged and still live — it is now reached through the paid door.

```
blue_call(tool: "fundraise-timing", input: { project: string, stage?: string })
```

`blue_call` charges x402. The first call returns HTTP 402 with payment requirements;
sign them with your own wallet and call again with `payment: <base64 X-PAYMENT>`.
Blue Agent never holds your key and authorises one exact amount per call.

## Inputs

- `project` — project description (required)
- `stage` — current stage and key metrics (optional but improves accuracy)

## Example

```
blue_call(tool: "fundraise-timing", input: {
  project: "USDC streaming payroll on Base",
  stage: "Pre-seed. 500 users, $12k MRR, 3 pilots. Raising $500k."
})
```

## Price

$0.20 per call
