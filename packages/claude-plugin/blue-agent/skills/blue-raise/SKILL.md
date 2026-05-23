---
name: Blue Agent — Raise
description: Use when user wants to fundraise, write a pitch, or prepare investor materials. Triggers — "blue raise", "help me raise", "write my pitch", "investor deck", "pre-seed", "who should I pitch", "fundraising narrative", "why this wins".
version: 1.0.0
---

# Blue Raise — Pitch Narrative

Generates a fundraising narrative — market framing, why this wins, traction, ask, and target investors.

## What it produces

| Section | Content |
|---------|---------|
| Market framing | How to position the problem for investors |
| Why this wins | Unique insight, unfair advantage, moat |
| Traction | How to present current progress |
| The ask | Raise amount, use of funds, milestones |
| Target investors | Specific funds/angels active in this space |
| Next steps | How to start the fundraise |

## MCP Tool

```
blue_raise(prompt: string)
```

## Prompt format

Include:
- Project description
- Current traction/metrics
- Raise amount and stage (pre-seed, seed, etc.)
- What the raise is for

## Example

```
blue_raise("Building a USDC payroll streaming app on Base. 
500 beta users, $12k MRR. Raising $500k pre-seed to hire 2 engineers 
and expand to 10 enterprise clients.")
```

## Output

Full pitch narrative — ready to adapt into a deck or send as a one-pager.

## Price

$0.20 per call
