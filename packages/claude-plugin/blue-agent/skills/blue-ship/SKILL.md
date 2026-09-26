---
name: Blue Agent — Ship
description: Use when user is ready to deploy or launch something. Triggers — "blue ship", "ready to deploy", "launch checklist", "how do I ship", "deployment steps", "release notes", "monitoring setup", "mainnet deploy".
version: 1.0.0
---

# Blue Ship — Deployment Checklist

Generates a production deployment checklist, verification steps, and monitoring plan.

## What it produces

| Section | Content |
|---------|---------|
| Pre-deploy | Checklist before pushing to mainnet |
| Deploy steps | Ordered sequence of deployment commands |
| Verification | How to verify everything worked correctly |
| Release notes | User-facing changelog template |
| Monitoring | Metrics, alerts, and dashboards to set up |
| Rollback plan | How to revert if something goes wrong |

## How to run it

> Changed 2026-09-26. There is **no `blue_ship` MCP tool any more.** The MCP
> manifest was cut from 85 tools to 18 and the five console commands were not all
> kept; `blue_ship` runs through the paid door instead. The underlying tool did not
> go anywhere — only the always-loaded manifest entry did.

```
blue_call(tool: "blue-ship", input: { prompt: string })
```

Note the id is `blue-ship` with a **hyphen** — that is the catalog id. `blue_ship`
with an underscore was the old MCP tool name and now resolves to nothing.

`blue_call` charges x402. The first call returns HTTP 402 with payment requirements;
sign them with your own wallet and call again with `payment: <base64 X-PAYMENT>`.
Blue Agent never holds your key and authorises one exact amount per call.

## Prompt format

Describe what you're shipping:
- Product/feature name
- Stack (Next.js, Solidity, etc.)
- Target environment (Vercel, Base mainnet, etc.)
- Any special requirements

## Example

```
blue_call(tool: "blue-ship", input: {
  prompt: "Shipping a Next.js app to Vercel + ERC-20 token to Base mainnet. First production deploy. Using Hardhat for contract deployment."
})
```

## Output

Step-by-step deployment checklist — copy and run in order.

## Price

$0.10 per call
