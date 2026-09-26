---
name: Blue Hub — Token Pick
description: Use when user asks for a token pick, what to buy, or a trade signal on Base. Triggers — "token pick", "what should I buy", "best token today", "give me a signal", "asymmetric setup", "what's pumping", "trade idea".
version: 1.0.0
---

# Hub Token Pick

AI token pick — falsifiable thesis, entry, sizing, and kill criterion.
Returns NO_PICK when nothing clears the bar.

## What it produces

| Field | Content |
|-------|---------|
| Token | Name, ticker, contract address on Base |
| Thesis | 1-2 sentence falsifiable reason to buy |
| Entry | Price level or condition to enter |
| Sizing | Suggested position size (% of portfolio) |
| Kill criterion | Specific condition that invalidates the thesis |
| Conviction | HIGH / MEDIUM / LOW |

## How to run it

> Changed 2026-09-26. There is **no `hub_token_pick` MCP tool any more.** The MCP
> manifest was cut from 85 tools to 18 to keep agent context small. The tool itself
> is unchanged and still live — it is now reached through the paid door.

```
blue_call(tool: "token-pick-signal", input: { context?: string })
```

`blue_call` charges x402. The first call returns HTTP 402 with payment requirements;
sign them with your own wallet and call again with `payment: <base64 X-PAYMENT>`.
Blue Agent never holds your key and authorises one exact amount per call.

## Inputs

- `context` (optional) — market context, narratives to consider, or constraints

## Example

```
blue_call(tool: "token-pick-signal", input: {
  context: "Focus on AI agent tokens and DeFi. Avoid memes."
})
```

## Output

One structured token pick, or `NO_PICK` with explanation.

## Important

This is not financial advice. Always verify addresses on Basescan before any transaction. Run `hub_honeypot` on any unfamiliar token.

## Price

$0.20 per call
