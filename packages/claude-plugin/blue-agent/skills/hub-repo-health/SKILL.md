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

## MCP Tool

```
hub_repo_health(url: string)
```

## Inputs

- `url` — GitHub repository URL (required)

## Example

```
hub_repo_health("https://github.com/madebyshun/blue-agent")
```

## Price

$0.005 per call
