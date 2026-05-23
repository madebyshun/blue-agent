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

## MCP Tool

```
hub_agent_score(handle: string)
```

## Inputs

- `handle` — agent handle or name (required)

## Example

```
hub_agent_score("blue-agent")
hub_agent_score("aeon")
hub_agent_score("miroshark")
```

## Price

$0.01 per call
