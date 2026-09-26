---
name: Blue Agent — Score
description: Use when user wants to look up an onchain builder score by GitHub handle, Farcaster handle, or wallet address. Triggers — "blue score", "check my score", "builder score", "onchain score", "how active am I on Base", "score for 0x...".
version: 1.0.0
---

# Blue Score — Onchain Builder Score

Builder Score (0-100) for any GitHub handle, Farcaster handle, or wallet address on Base.

## What it produces

| Field | Content |
|-------|---------|
| Score | 0-100 overall Builder Score |
| On-chain activity | Transactions, contracts, volume |
| Contributions | GitHub commits, open source activity |
| Farcaster | Social presence and engagement |
| Tier | Explorer / Builder / Founder / Legend |

## How to run it

> Changed 2026-09-26. There is **no `blue_score` MCP tool any more** — the MCP
> manifest was cut from 85 tools to 18 to keep agent context small.
>
> ⚠️ Unlike the other cut tools, this one **cannot** be reached through
> `blue_call`. `blue_call` posts to `/api/x402/<id>`, and `builder-score` is
> deliberately absent from both `HANDLERS` and `AGENT_TOOLS` — that endpoint
> answers **501**, and there is no price to pay. The working compute is a plain
> free HTTP route. Call it directly:

```
GET https://blueagent.dev/api/builder-score?handle=<handle>
```

Accepts `handle`, `repo`, or `address`, as query params or JSON body, by GET or POST.
The handler self-degrades rather than throwing, so a partial answer comes back with
`degraded: true` and `score: null` — read those two fields before quoting a number.

**This route is first-party only.** A cross-site *browser* request gets
`403 FIRST_PARTY_ONLY`. Server-to-server calls (no `Sec-Fetch-Site` header) pass,
which is the case for an MCP client or agent runtime.

## Inputs

- `handle` — GitHub handle, Farcaster handle, or wallet address `0x...` (required)

## Examples

```
GET https://blueagent.dev/api/builder-score?handle=madebyshun      # GitHub handle
GET https://blueagent.dev/api/builder-score?handle=shun.eth        # ENS / Farcaster
GET https://blueagent.dev/api/builder-score?address=0xf895783b...  # wallet address
```

This skill is the canonical builder-score path. The old `hub_builder_score` split
was not real — see `hub-builder-score/SKILL.md`; both names always resolved to this
same route.

## Price

**Free.** No x402, no payment header, no API key. It has never had a price — any doc
claiming otherwise was wrong.
