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

## How to run it

> Changed 2026-09-26. There is **no `blue_idea` MCP tool any more.** The MCP
> manifest was cut from 85 tools to 18 and the five console commands were not all
> kept; `blue_idea` runs through the paid door instead. The underlying tool did not
> go anywhere — only the always-loaded manifest entry did.

```
blue_call(tool: "blue-idea", input: { prompt: string })
```

Note the id is `blue-idea` with a **hyphen** — that is the catalog id. `blue_idea`
with an underscore was the old MCP tool name and now resolves to nothing.

`blue_call` charges x402. The first call returns HTTP 402 with payment requirements;
sign them with your own wallet and call again with `payment: <base64 X-PAYMENT>`.
Blue Agent never holds your key and authorises one exact amount per call.

## Prompt format

Pass the user's raw concept directly as `prompt`. Include any context they've given:
- What the product does
- Who it's for
- Any existing work or research

## Example

```
blue_call(tool: "blue-idea", input: {
  prompt: "A USDC streaming payroll app for remote teams on Base. Employers set up streams, employees withdraw anytime."
})
```

## Output

Structured brief with all 6 sections. Each section is 2-5 lines — direct and opinionated.

## Price

$0.05 per call
