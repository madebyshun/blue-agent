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
| `base-agent` | AI agent with Virtuals inference + wallet |
| `base-x402` | HTTP server with x402 micropayments |
| `base-token` | ERC-20 token on Base with Solidity |

> Corrected 2026-09-26: this table said `base-agent` was "AI agent with Bankr LLM
> + wallet". Bankr was fully removed from this project (account 403-banned
> 2026-07-20), and the template itself was repointed to Virtuals on 2026-09-18 —
> it had required `@blue-agent/bankr`, a scope that does not exist on npm, so
> `npm install` failed for every project it ever generated. The doc was a week
> behind the code and named a vendor the repo forbids reintroducing.

## How to run it

> Changed 2026-09-26. `blue_new` is **no longer served by the remote MCP server**
> at `https://blueagent.dev/api/mcp` — the manifest was cut from 85 tools to 18 and
> scaffolding was not kept. Remote previously answered with CLI instructions rather
> than files; it now does not answer at all.
>
> This is the one skill here with **no `blue_call` fallback**, and that is inherent
> rather than an oversight: scaffolding writes files to your disk, so it can only
> run somewhere that has your disk. A hosted endpoint cannot do it.

Use either local path:

```bash
# Local MCP server — exposes blue_new as a real tool
npm i -g @blueagent/skill

# Or the CLI, no MCP needed
npm i -g @blueagent/cli
blue new my-defi-agent --template base-agent
```

With the local MCP server running:

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
- `package.json` — TypeScript + tsx only, no SDK (Virtuals is OpenAI-compatible,
  so a plain `fetch` needs none and cannot rot against our publish state)
- `.env.example` with `VIRTUALS_API_KEY`, `VIRTUALS_MODEL`, `WALLET_PRIVATE_KEY`
- `src/index.ts` — agent starter calling `compute.virtuals.io/v1/chat/completions`

`VIRTUALS_MODEL` is deliberately left blank rather than defaulted: a model id baked
into a scaffold goes stale the moment the gateway de-lists it. Pick one from the
live Virtuals catalog.

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

`blue_new` creates files locally, so it requires the local `@blueagent/skill` MCP
server or the CLI. The remote MCP server does not serve it — see "How to run it".
