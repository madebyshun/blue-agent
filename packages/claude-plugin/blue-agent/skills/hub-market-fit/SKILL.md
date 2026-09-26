---
name: Blue Hub — Market Fit
description: Use when user wants to validate their project idea or check market demand. Triggers — "market fit", "validate my idea", "is there demand for", "problem/solution fit", "timing", "GO or WAIT", "should I build this".
version: 1.0.0
---

# Hub Market Fit — Project Validation

Market fit analysis — problem clarity, timing, competition, demand signals.

## What it produces

| Section | Content |
|---------|---------|
| Problem clarity | Is the problem real, specific, painful? |
| Timing | Why now? What's changed? |
| Competition | Direct/indirect, how crowded |
| Demand signals | Evidence of real demand |
| Verdict | GO / WAIT / PIVOT |
| Top risks | 3 biggest risks to address |
| Suggested change | One thing to change to improve fit |

## How to run it

> Changed 2026-09-26. There is **no `hub_market_fit` MCP tool any more.** The MCP
> manifest was cut from 85 tools to 18 to keep agent context small. The tool itself
> is unchanged and still live — it is now reached through the paid door.

```
blue_call(tool: "market-fit", input: { project: string, url?: string })
```

`blue_call` charges x402. The first call returns HTTP 402 with payment requirements;
sign them with your own wallet and call again with `payment: <base64 X-PAYMENT>`.
Blue Agent never holds your key and authorises one exact amount per call.

## Inputs

- `project` — project description (required, 1-5 sentences)
- `url` — project URL if live (optional)

## Example

```
blue_call(tool: "market-fit", input: {
  project: "USDC streaming payroll for remote teams on Base. Employers set up payment streams, employees withdraw anytime. No banks, no delays, programmable."
})
```

## Output

Structured analysis with GO / WAIT / PIVOT verdict.

## Price

$0.25 per call
