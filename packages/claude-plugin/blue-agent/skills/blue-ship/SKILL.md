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

## MCP Tool

```
blue_ship(prompt: string)
```

## Prompt format

Describe what you're shipping:
- Product/feature name
- Stack (Next.js, Solidity, etc.)
- Target environment (Vercel, Base mainnet, etc.)
- Any special requirements

## Example

```
blue_ship("Shipping a Next.js app to Vercel + ERC-20 token to Base mainnet. 
First production deploy. Using Hardhat for contract deployment.")
```

## Output

Step-by-step deployment checklist — copy and run in order.

## Price

$0.10 per call
