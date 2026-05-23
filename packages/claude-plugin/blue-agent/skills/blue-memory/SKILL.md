---
name: Blue Agent — Memory
description: Handles reading and writing of persistent project memory across sessions. Load this skill when initializing a session, after any console command completes, or when the user asks Blue Agent to remember something.
version: 1.0.0
---

# Blue Memory — Persistent Project Context

Blue Agent stores project context in `.blue-agent/memory.md` in the workspace root.

## On session start

1. Check if `.blue-agent/memory.md` exists
2. If yes → read it, greet the user with context:
   > "Welcome back. Continuing on **{project.name}** ({project.stage} stage, last ran `blue {last_command}`)."
3. If no → create `.blue-agent/` directory and copy from template, greet fresh:
   > "New project? Tell me what you're building and I'll remember it going forward."

## Memory file location

```
{workspace}/.blue-agent/memory.md
```

## Schema

```md
## Project
name:        StreamPay
description: USDC payroll streaming on Base
stack:       Next.js, Solidity, Hardhat, Base
stage:       build

## Session
last_command: build
last_run:     2026-05-23T10:30:00Z

## Notes
- Raised concern about reentrancy in Vault.sol
- Targeting SMB payroll market first
```

## Update rules

| Trigger | Fields to update |
|---------|-----------------|
| After `blue_idea` | name, description, stage → idea |
| After `blue_build` | stack, stage → build |
| After `blue_audit` | stage → audit (if issues found, add note) |
| After `blue_ship` | stage → ship or live |
| After `blue_raise` | add note about raise amount/stage |
| User says "remember X" | append to Notes |

## Rules

- **Never delete** user-written notes
- **Only append** to Notes section — never overwrite
- **Update** project fields after each command
- **Stage progression**: idea → build → audit → ship → live
- Keep memory file under 100 lines — summarize old notes if growing too long
