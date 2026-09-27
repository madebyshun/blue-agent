# Blue Agent Command Map

Last updated: 2026-05-12

## Core workflow — idea → build → audit → ship → raise

| Command | Description | Price |
|---|---|---|
| `blue idea "<prompt>"` | Fundable brief — problem, why now, why Base, MVP scope, risks, 24h plan | $0.05 |
| `blue build "<prompt>"` | Architecture, stack, folder structure, integrations, test plan | $0.50 |
| `blue audit "<prompt>"` | Security + product risk review — critical issues, fixes, go/no-go | $1.00 |
| `blue ship "<prompt>"` | Deploy checklist, verification, release notes, monitoring plan | $0.10 |
| `blue raise "<prompt>"` | Pitch narrative — market framing, traction, ask, investor targets | $0.20 |

## Setup / health

| Command | Description |
|---|---|
| `blue new <name>` | Scaffold a Base project from template (base-agent \| base-x402 \| base-token) |
| `blue init` | Install skill files to `~/.blue-agent/skills/` for local grounding |
| `blue doctor` | Health check — node version, skills, `VIRTUALS_API_KEY`, config |

## Identity / score

| Command | Description |
|---|---|
| `blue score @handle` | Builder Score (0–100) with tier + dimension breakdown |
| `blue agent-score npm:pkg` | Agent Score — accepts @handle, npm:pkg, github.com/repo, https://url |
| `blue compare <a> <b>` | Side-by-side comparison of two builders or agents |

## Discovery

| Command | Description |
|---|---|
| `blue alert` | List configured alerts |
| `blue alert add` | Interactive alert setup (Telegram / webhook / log) |
| `blue alert remove <id>` | Remove an alert |

**Removed — `blue search`, `blue trending`, `blue watch`, `blue history`.** No command file,
no registration. `watch` survives only as `blue tui watch`, which spawns the TUI.

## Launch / market — REMOVED

`blue launch` and `blue market` no longer exist as top-level commands. `market` / `watch` /
`launch` are now `blue tui` subcommands that each just spawn the TUI. The Bankr token-launch
and marketplace paths they fronted were removed with Bankr itself (2026-09-06 / 09-07); the
deploy endpoint had been 403-ing at the account level before that.

## Work Hub / tasks — ⚠️ state does not survive the process

| Command | Description |
|---|---|
| `blue tasks` | Browse open tasks |
| `blue tasks -c <category>` | Filter by category: audit \| content \| art \| data \| dev |
| `blue post-task @handle` | Post a new task (interactive) |
| `blue accept <taskId> @handle` | Accept a task |
| `blue submit <taskId> @handle <proof>` | Submit completed work with proof |

These four share one `Map` in `packages/reputation/src/taskHub.ts` and nothing else. Each CLI
invocation is a fresh process, so the Map starts empty and is discarded on exit: `blue tasks`
can only ever print nothing, and a task posted by one command is gone by the next. Use
`blue micro` if you want state that persists.

## Microtasks — local ledger, settles nothing

| Command | Description |
|---|---|
| `blue micro post [description]` | Post a microtask |
| `blue micro list [id]` | List, or show one by id |
| `blue micro tasks` | Browse open microtasks |
| `blue micro accept <taskId> [handle]` | Accept one |
| `blue micro submit <taskId> <proof>` | Submit proof |
| `blue micro approve <taskId>` | Approve — **updates the local ledger only** |
| `blue micro profile [handle]` | Reputation view |

Persists to `~/.blue-agent/microtasks.json`, `microclaims.json`, `microreputation.json`. No
server, no RPC, no chain call: the amounts are bookkeeping and settling them is the operator's
job, which `approve` says out loud. The server half of this marketplace was retired 2026-09-02.

## Terminal UI

| Command | Description |
|---|---|
| `blue tui` | Open full terminal UI (requires `@blueagent/cli` globally) |
| `blue tui market\|watch\|launch` | Same as `blue tui` — in-menu deep-links not yet implemented |

---

## Command implementations

All commands are in `packages/builder/src/commands/`.

| Command file | Status |
|---|---|
| `idea.ts` | ✅ implemented |
| `build.ts` | ✅ implemented |
| `audit.ts` | ✅ implemented |
| `ship.ts` | ✅ implemented |
| `raise.ts` | ✅ implemented |
| `new.ts` | ✅ implemented |
| `init.ts` | ✅ implemented |
| `doctor.ts` | ✅ implemented |
| `score.ts` | ✅ implemented |
| `agent-score.ts` | ✅ implemented |
| `compare.ts` | ✅ implemented |
| `search.ts` | ✅ implemented |
| `trending.ts` | ✅ implemented |
| `watch.ts` | ✅ implemented |
| `alert.ts` | ✅ implemented |
| `history.ts` | ✅ implemented |
| `launch.ts` | ✅ implemented |
| `market.ts` | ✅ implemented |
| `tasks.ts` | ✅ implemented |
| `post-task.ts` | ✅ implemented |
| `accept.ts` | ✅ implemented |
| `submit.ts` | ✅ implemented |
| `tui` (via cli.ts) | ✅ wired (delegates to @blueagent/cli) |

---

## Contract docs

All command contracts are in `commands/*.md`.

| File | Status |
|---|---|
| `idea.md` | ✅ |
| `build.md` | ✅ |
| `audit.md` | ✅ |
| `ship.md` | ✅ |
| `raise.md` | ✅ |
| `new.md` | ✅ |
| `search.md` | ✅ |
| `trending.md` | ✅ |
| `watch.md` | ✅ |
| `alert.md` | ✅ |
| `history.md` | ✅ |
| `compare.md` | ✅ |
| `launch.md` | ✅ |
| `market.md` | ✅ |
| `marketplace.md` | ✅ (legacy — superseded by market.md) |
| `tui.md` | ✅ |
