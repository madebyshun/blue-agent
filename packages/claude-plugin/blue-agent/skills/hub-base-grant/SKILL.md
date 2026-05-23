---
name: Blue Hub — Base Grant
description: Use when user asks about grants or funding opportunities on Base. Triggers — "base grant", "how to get funded", "grants for Base", "funding opportunities", "apply for grant", "Optimism grant", "Coinbase grant".
version: 1.0.0
---

# Hub Base Grant — Grant Finder

Finds active grants and funding opportunities for Base projects.

## What it produces

| Section | Content |
|---------|---------|
| Active grants | Name, org, amount range, deadline |
| Eligibility | Stage, type, requirements |
| Match score | How well your project fits each grant |
| Application tips | What reviewers look for |
| Next steps | Direct links + how to apply |

## MCP Tool

```
hub_base_grant(project: string, stage?: string)
```

## Inputs

- `project` — project description (required)
- `stage` — `idea` | `build` | `live` (optional)

## Example

```
hub_base_grant(
  "Open source USDC payroll streaming protocol on Base",
  "build"
)
```

## Price

$0.01 per call
