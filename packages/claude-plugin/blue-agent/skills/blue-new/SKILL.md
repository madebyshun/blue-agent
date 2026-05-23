---
name: Blue Agent — New Project
description: Use when user wants to scaffold a new Base project. Triggers — "blue new", "scaffold a project", "create project", "start a new Base project", "template", "boilerplate", "new agent project", "new x402 project".
version: 1.0.0
---

# Blue New — Project Scaffolding

Scaffolds a new Base project from a template. Creates all files locally.

## Templates

| Template | Description |
|----------|-------------|
| `base-agent` | AI agent with Bankr LLM + wallet |
| `base-x402` | HTTP server with x402 micropayments |
| `base-token` | ERC-20 token on Base with Solidity |

## MCP Tool

```
blue_new(name: string, type: "base-agent" | "base-x402" | "base-token")
```

## Inputs

- `name` — project directory name, e.g. `my-agent` (required)
- `type` — template type (required)

## Example

```
blue_new("my-defi-agent", "base-agent")
```

## What gets created

**base-agent:**
- `package.json` with Bankr + x402 deps
- `.env.example` with required keys
- `src/index.ts` with agent starter

**base-x402:**
- `package.json` with server deps
- `.env.example`
- `src/index.ts` with x402 payment gate

**base-token:**
- `package.json`
- `contracts/Token.sol` (ERC-20, 1B supply)
- `.env.example` with deployer key

## After scaffolding

```bash
cd <project-name>
cp .env.example .env
npm install
```

## Note

`blue_new` creates files locally — requires the local `@blueagent/skill` MCP server.
Via remote MCP, it returns CLI instructions instead.
