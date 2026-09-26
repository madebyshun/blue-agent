---
name: Blue Hub — Repo Health
description: Use when user wants to check a GitHub repo's health and quality metrics. Triggers — "repo health", "check my repo", "code quality", "commit velocity", "test coverage", "dependency risk", "is this codebase healthy".
version: 1.0.0
---

# Hub Repo Health — GitHub Analysis

Commit velocity, test coverage, dependency risk, and bus factor for any GitHub repo.

## What it produces

| Section | Content |
|---------|---------|
| Velocity | Commits/week, PR merge time |
| Coverage | Test coverage % estimate |
| Dependencies | Outdated/vulnerable packages |
| Bus factor | How many people know the codebase |
| Health score | 0-100 overall |
| Recommendations | Top 3 improvements |

## How to run it

> Changed 2026-09-26. There is **no `hub_repo_health` MCP tool any more.** The MCP
> manifest was cut from 85 tools to 18 to keep agent context small. The tool itself
> is unchanged and still live — it is now reached through the paid door.

```
blue_call(tool: "repo-health", input: { url: string })
```

`blue_call` charges x402. The first call returns HTTP 402 with payment requirements;
sign them with your own wallet and call again with `payment: <base64 X-PAYMENT>`.
Blue Agent never holds your key and authorises one exact amount per call.

## Inputs

- `url` — GitHub repository URL (required)

## Example

```
blue_call(tool: "repo-health", input: {
  url: "https://github.com/madebyshun/blue-agent"
})
```

## Price

$0.005 per call
