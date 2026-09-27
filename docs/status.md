# Blue Agent Status

Last updated: 2026-09-27

> This file describes the **CLI** (`packages/builder`, binary `blue`) and the packages
> around it. The live x402/Hub surface is `apps/web` and is **not** inventoried here —
> see `CLAUDE.md` for that, and treat the catalog itself as the source of truth.

## What Blue Agent is

Blue Agent is the Base-native founder console for builders on Base.
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

All backed by Virtuals inference (`compute.virtuals.io/v1`, `VIRTUALS_API_KEY`) with
skill-grounded system context (6 skill files).

### Setup / health (P1) ✅
- `blue new` — Scaffold from 3 templates (base-agent, base-x402, base-token)
- `blue init` — Install skill files to `~/.blue-agent/skills/`
- `blue doctor` — Health check: node, skills, API key, config

### Identity / score (P1) ✅
- `blue score @handle` — Builder Score (0-100), tier, dimension breakdown
- `blue agent-score <input>` — Agent Score, multi-source (npm, GitHub, endpoint, handle)
- `blue compare <a> <b>` — Side-by-side score comparison

### Alerts (P1) ✅
- `blue alert add|list|remove` — Alert configuration (saved to `~/.blue-agent/alerts.json`)

### Work Hub / tasks (P2) ⚠️ commands exist, state does not survive
- `blue tasks` — Browse open tasks
- `blue post-task @handle` — Post a task (interactive)
- `blue accept <taskId>` — Accept a task
- `blue submit <taskId> <proof>` — Submit completed work
- **These four share one `Map` in `packages/reputation/src/taskHub.ts` and nothing else.**
  A CLI invocation is a process, so the Map is empty at startup and discarded at exit:
  `blue tasks` can only ever print nothing, and a task posted in one command is gone by
  the next. Treat this as a stub with a CLI attached, not a working task hub.
  (`blue micro`, below, is the one that actually persists.)

### Microtasks (P2) ✅ — local ledger only
- `blue micro post | list | tasks | accept | submit | approve | profile`
- Persists to `~/.blue-agent/microtasks.json`, `microclaims.json`, `microreputation.json`.
- **Settles nothing.** No server, no RPC, no chain call — the dollar amounts are
  bookkeeping and paying them is the operator's job, which the commands say out loud.
  The server half of this marketplace was retired 2026-09-02; this CLI half is kept
  deliberately.

### Terminal UI (P2) ✅
- `blue tui` — Opens `@blueagent/cli` TUI
- `blue tui open | market | watch | launch` — each spawns the TUI at that view

### Removed (do not re-document as live)
- `blue search`, `blue trending`, `blue history` — gone, no command file and no registration.
- Top-level `blue launch` / `blue market` / `blue watch` — gone. `market`, `watch` and
  `launch` now exist **only** as `blue tui` subcommands, and each one just spawns the TUI.
  The Bankr token-launch and marketplace paths behind the originals were removed with
  Bankr itself (2026-09-06 / 09-07).

---

## What is intentionally scaffolded (not production-grade)

- **Task Hub** is a process-lifetime `Map` — no file, no DB, no chain (see above)
- **Alert delivery** is config-only; the command itself tells you to wire your own
  listener against `~/.blue-agent/alerts.json`
- **Microtask settlement** is bookkeeping in local JSON — approving releases nothing
- **Score engine** is LLM-grounded estimates, not live onchain data
- **x402 payment execution** is defined but not actively enforced in CLI flow

---

## Package state

| Package | Status |
|---|---|
| `packages/core` | ✅ runtime, registry, schemas — reads `VIRTUALS_API_KEY` |
| ~~`packages/bankr`~~ | 🗑️ **DELETED 2026-09-18** — was a private Bankr LLM client with zero importers. Do not recreate. |
| `packages/builder` | ✅ CLI with 20 top-level commands |
| `packages/reputation` | ⚠️ builder/agent score work; `taskHub.ts` is a process-lifetime `Map` |
| `packages/skill` | ✅ MCP server, registers 49 tools (15 `blue_` + 34 `hub_`) — pinned by `dead-tool-check.ts`. A **separate product** from remote `/api/mcp` and from the Hub catalog, not a subset of either: it overlaps `/api/mcp` by only 6 names. For those two counts read the catalog and the manifest, not this table — they move, and nothing pins a number written here. |
| `packages/payments` | ⚠️ **unfinished stub** — zero call sites, `private: true`, never published. Speaks x402 v1 while the live server speaks v2. |

---

## Web app state

`apps/web` is the live product and moves far faster than this file. **Do not inventory its
routes here** — the previous version of this section listed nine pages, six of which
(`console`, `market`, `rewards`, `tools`, `profile`, `agents`) no longer exist, and one API
route that no longer exists either. `ls apps/web/src/app` is the answer, and
`link-liveness-check.ts` is what actually enforces that published URLs resolve.

---

## Next priorities

See `docs/next-steps.md`.
