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

## MCP Tool

```
hub_market_fit(project: string, url?: string)
```

## Inputs

- `project` — project description (required, 1-5 sentences)
- `url` — project URL if live (optional)

## Example

```
hub_market_fit("USDC streaming payroll for remote teams on Base. 
Employers set up payment streams, employees withdraw anytime. 
No banks, no delays, programmable.")
```

## Output

Structured analysis with GO / WAIT / PIVOT verdict.

## Price

$0.25 per call
