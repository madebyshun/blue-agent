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
| `blue doctor` | Health check — node version, skills, BANKR_API_KEY, config |

## Identity / score

| Command | Description |
|---|---|
| `blue score @handle` | Builder Score (0–100) with tier + dimension breakdown |
| `blue agent-score npm:pkg` | Agent Score — accepts @handle, npm:pkg, github.com/repo, https://url |
| `blue compare <a> <b>` | Side-by-side comparison of two builders or agents |

## Discovery

| Command | Description |
|---|---|
| `blue search "<query>"` | Search builders, agents, projects, tokens on Base |
| `blue trending [filter]` | Trending on Base — optional filter: builders \| agents \| tokens |
| `blue watch <target>` | Watch a wallet, handle, or token for activity |
| `blue watch --list` | List all configured watches |
| `blue alert` | List configured alerts |
| `blue alert add` | Interactive alert setup (Telegram / webhook / log) |
| `blue alert remove <id>` | Remove an alert |
| `blue history <input>` | Activity timeline for a builder or agent |

## Launch / market

| Command | Description |
|---|---|
| `blue launch [token\|agent]` | Launch wizard — token on Base (Clanker) or agent on Bankr |
| `blue market` | Browse top marketplace listings |
| `blue market agents\|skills\|prompts` | Filter marketplace by type |
| `blue market publish "<item>"` | Step-by-step publish guidance |

## Work Hub / tasks

| Command | Description |
|---|---|
| `blue tasks` | Browse open tasks |
| `blue tasks -c <category>` | Filter by category: audit \| content \| art \| data \| dev |
| `blue post-task @handle` | Post a new task (interactive) |
| `blue accept <taskId> @handle` | Accept a task |
| `blue submit <taskId> @handle <proof>` | Submit completed work with proof |

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
