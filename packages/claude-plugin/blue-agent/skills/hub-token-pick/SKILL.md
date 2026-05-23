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

## MCP Tool

```
hub_token_pick(context?: string)
```

## Inputs

- `context` (optional) — market context, narratives to consider, or constraints

## Example

```
hub_token_pick("Focus on AI agent tokens and DeFi. Avoid memes.")
```

## Output

One structured token pick, or `NO_PICK` with explanation.

## Important

This is not financial advice. Always verify addresses on Basescan before any transaction. Run `hub_honeypot` on any unfamiliar token.

## Price

$0.20 per call
