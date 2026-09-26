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

## How to run it

> Changed 2026-09-26. There is **no `blue_raise` MCP tool any more.** The MCP
> manifest was cut from 85 tools to 18 and the five console commands were not all
> kept; `blue_raise` runs through the paid door instead. The underlying tool did not
> go anywhere — only the always-loaded manifest entry did.

```
blue_call(tool: "blue-raise", input: { prompt: string })
```

Note the id is `blue-raise` with a **hyphen** — that is the catalog id. `blue_raise`
with an underscore was the old MCP tool name and now resolves to nothing.

`blue_call` charges x402. The first call returns HTTP 402 with payment requirements;
sign them with your own wallet and call again with `payment: <base64 X-PAYMENT>`.
Blue Agent never holds your key and authorises one exact amount per call.

## Prompt format

Include:
- Project description
- Current traction/metrics
- Raise amount and stage (pre-seed, seed, etc.)
- What the raise is for

## Example

```
blue_call(tool: "blue-raise", input: {
  prompt: "Building a USDC payroll streaming app on Base. 500 beta users, $12k MRR. Raising $500k pre-seed to hire 2 engineers and expand to 10 enterprise clients."
})
```

## Output

Full pitch narrative — ready to adapt into a deck or send as a one-pager.

## Price

$0.20 per call
