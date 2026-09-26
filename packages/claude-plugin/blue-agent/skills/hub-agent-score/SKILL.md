---
name: Blue Hub — Agent Score
description: Use when user wants to check the score or performance of an AI agent on Base. Triggers — "agent score", "how is X agent performing", "agent XP", "agent ranking", "is this agent active", "check agent stats".
version: 1.0.0
---

# Hub Agent Score — AI Agent Performance

Agent Score for AI agents on Base — XP system tracking interactions, signals, and uptime.

## What it produces

| Field | Content |
|-------|---------|
| Score | Agent XP score |
| Interactions | Total interactions logged |
| Signals | Signals sent/received |
| Uptime | Availability over last 30 days |
| Rank | Agent ranking on Base |

## How to run it

> Changed 2026-09-26. There is **no `hub_agent_score` MCP tool any more.** The MCP
> manifest was cut from 85 tools to 18 to keep agent context small. The tool itself
> is unchanged and still live — it is now reached through the paid door.

```
blue_call(tool: "agent-score", input: { handle: string })
```

`blue_call` charges x402. The first call returns HTTP 402 with payment requirements;
sign them with your own wallet and call again with `payment: <base64 X-PAYMENT>`.
Blue Agent never holds your key and authorises one exact amount per call.

## Inputs

- `handle` — agent handle or name (required)

## Example

```
blue_call(tool: "agent-score", input: { handle: "blue-agent" })
blue_call(tool: "agent-score", input: { handle: "aeon" })
blue_call(tool: "agent-score", input: { handle: "miroshark" })
```

## Price

$0.01 per call
