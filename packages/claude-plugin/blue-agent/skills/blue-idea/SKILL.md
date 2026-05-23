---
name: Blue Agent — Idea
description: Use when user has a rough concept and wants to turn it into a structured, fundable brief. Triggers — "blue idea", "validate my idea", "I want to build X", "is this a good idea", "help me think through", "why now", "MVP scope".
version: 1.0.0
---

# Blue Idea — Concept → Fundable Brief

Turns a rough concept into a structured brief grounded in 34 Base skill files.

## What it produces

| Section | Content |
|---------|---------|
| Problem | Crisp problem statement — who has it, how painful |
| Why now | Market timing, catalysts, tailwinds |
| Why Base | Specific reason this belongs on Base (not generic L2) |
| MVP scope | Smallest thing that proves the thesis |
| Risks | Top 3 risks + mitigation |
| 24h plan | What to do in the next 24 hours |

## MCP Tool

```
blue_idea(prompt: string)
```

## Prompt format

Pass the user's raw concept directly as `prompt`. Include any context they've given:
- What the product does
- Who it's for
- Any existing work or research

## Example

```
blue_idea("A USDC streaming payroll app for remote teams on Base. 
Employers set up streams, employees withdraw anytime.")
```

## Output

Structured brief with all 6 sections. Each section is 2-5 lines — direct and opinionated.

## Price

$0.05 per call
