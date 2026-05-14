# Blue Agent Status

Last updated: 2026-05-12

## What Blue Agent is

Blue Agent is the Base-native founder console for builders on Bankr.
It is a workflow-first product: idea → build → audit → ship → raise.

Not a chatbot. Not a generic assistant. A founder tool.

---

## What is implemented

### Core workflow (P0) ✅
- `blue idea` — Fundable brief from a rough concept
- `blue build` — Architecture, stack, folder structure, test plan
- `blue audit` — Security and product risk review
- `blue ship` — Deployment checklist and release notes
- `blue raise` — Pitch narrative and investor targeting

All backed by Bankr LLM with skill-grounded system context (6 skill files).

### Setup / health (P1) ✅
- `blue new` — Scaffold from 3 templates (base-agent, base-x402, base-token)
- `blue init` — Install skill files to `~/.blue-agent/skills/`
- `blue doctor` — Health check: node, skills, API key, config

### Identity / score (P1) ✅
- `blue score @handle` — Builder Score (0-100), tier, dimension breakdown
- `blue agent-score <input>` — Agent Score, multi-source (npm, GitHub, endpoint, handle)
- `blue compare <a> <b>` — Side-by-side score comparison

### Discovery (P1) ✅
- `blue search "<query>"` — Find builders, agents, projects, tokens on Base
- `blue trending [filter]` — Trending on Base by type
- `blue watch <target>` — Watch config for wallet/handle/token (saved to `~/.blue-agent/watches.json`)
- `blue alert add|list|remove` — Alert configuration (saved to `~/.blue-agent/alerts.json`)
- `blue history <input>` — Activity timeline for a builder or agent

### Launch / market (P1) ✅
- `blue launch [token|agent]` — Interactive wizard: token launch on Base or agent publish on Bankr
- `blue market [filter]` — Browse Bankr marketplace by type
- `blue market publish` — Step-by-step publish guidance

### Work Hub / tasks (P2) ✅
- `blue tasks` — Browse open tasks (in-memory store)
- `blue post-task @handle` — Post a task (interactive)
- `blue accept <taskId>` — Accept a task
- `blue submit <taskId> <proof>` — Submit completed work

### Terminal UI (P2) ✅
- `blue tui` — Opens `@blueagent/cli` TUI
- `blue tui market | watch | launch` — Focused TUI views

---

## What is intentionally scaffolded (not production-grade)

- **Task Hub** uses in-memory store (no DB or onchain persistence)
- **Alert delivery** is config-only (no live listener wired up)
- **Watch monitoring** is config + Bankr command output (no polling service)
- **Score engine** is LLM-grounded estimates, not live onchain data
- **Marketplace browse** is LLM-grounded, not a live API query
- **x402 payment execution** is defined but not actively enforced in CLI flow

---

## Package state

| Package | Status |
|---|---|
| `packages/core` | ✅ runtime, registry, schemas — stable |
| `packages/bankr` | ✅ LLM client — stable |
| `packages/builder` | ✅ CLI with 22 commands — expanded this session |
| `packages/reputation` | ✅ builder/agent score, task hub — stable |
| `packages/skill` | ✅ MCP server with 7 tools |
| `packages/payments` | ⚠️ helpers exist, not enforced in CLI |

---

## Web app state

- Pages exist for all major surfaces: console, chat, launch, market, rewards, tools, docs, profile, agents
- API routes: /api/chat, /api/builder-score, /api/agent-score, /api/tool/[toolId]
- UI is mostly scaffold-level — functional but not polished

---

## Next priorities

See `docs/next-steps.md`.
