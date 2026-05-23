---
name: Blue Agent — Build
description: Use when user wants architecture, stack, or technical plan for a Base project. Triggers — "blue build", "help me architect", "what stack should I use", "folder structure", "how do I build", "system design", "integrations", "test plan".
version: 1.0.0
---

# Blue Build — Architecture + Stack

Generates a full technical plan grounded in Base ecosystem standards.

## What it produces

| Section | Content |
|---------|---------|
| Architecture | System diagram in text, component breakdown |
| Stack | Languages, frameworks, libraries — specific versions |
| Folder structure | Full project tree with file descriptions |
| Integrations | APIs, contracts, services to connect |
| Test plan | Unit, integration, E2E test strategy |
| Open questions | Things to decide before writing code |

## MCP Tool

```
blue_build(prompt: string)
```

## Prompt format

Pass the user's build requirements. Include:
- What to build (product description)
- Any constraints (budget, timeline, team size)
- Existing stack if relevant
- Target: new project or adding to existing

## Example

```
blue_build("An ERC-4337 smart account wallet with x402 micropayment 
support. TypeScript, deploys to Base mainnet. Solo developer, 2 weeks.")
```

## Output

Full technical spec — ready to hand to a developer or start coding from.

## Price

$0.50 per call
