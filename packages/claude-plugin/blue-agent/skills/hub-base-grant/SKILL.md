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

## How to run it

> Changed 2026-09-26. There is **no `hub_base_grant` MCP tool any more.** The MCP
> manifest was cut from 85 tools to 18 to keep agent context small. The tool itself
> is unchanged and still live — it is now reached through the paid door.

```
blue_call(tool: "base-grant-finder", input: { project: string, stage?: string })
```

`blue_call` charges x402. The first call returns HTTP 402 with payment requirements;
sign them with your own wallet and call again with `payment: <base64 X-PAYMENT>`.
Blue Agent never holds your key and authorises one exact amount per call.

## Inputs

- `project` — project description (required)
- `stage` — `idea` | `build` | `live` (optional)

## Example

```
blue_call(tool: "base-grant-finder", input: {
  project: "Open source USDC payroll streaming protocol on Base",
  stage: "build"
})
```

## Price

$0.01 per call
