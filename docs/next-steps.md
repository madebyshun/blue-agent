# Blue Agent — Next Steps

Last updated: 2026-09-27

> ⚠️ **This file is a 2026-05 plan, refreshed only where it had gone factually wrong.**
> The dated items below were written before Bankr was removed, before the microtask
> server half was retired, and before `/market` was culled. Read it as a historical
> backlog, not as today's priorities — several entries are dead and are marked so.

---

## Immediate (can ship now)

### 1. Make `@blueagent/cli` the public-facing install path
Blue Agent users should install the single package:

```bash
npm install -g @blueagent/cli
```

Keep `packages/builder` as the internal command engine behind the CLI.

### 2. ~~Set BANKR_API_KEY in .env~~ — DEAD, do not do this
Bankr is fully removed (account 403-banned 2026-07-20, last code removed 2026-09-25) and
`BANKR_API_KEY` has zero readers. Inference is **Virtuals**: set `VIRTUALS_API_KEY` and call
`callLLM` from `apps/web/src/app/api/_lib/llm.ts`. `blue doctor` should check that var.

---

## Short-term (1-2 weeks)

### Live score data
- Replace LLM-grounded builder/agent scores with real data (X API, GitHub API, npm stats)
- Cache scores locally in `~/.blue-agent/score-cache.json` with TTL

### Watch/alert delivery
- Lightweight polling service (`blue watch start` — runs in background)
- Connect alert config to actual delivery: Telegram bot or webhook POST

### Task Hub persistence
- Replace in-memory task store with file-based persistence (`~/.blue-agent/tasks.json`)
- Consider Supabase or onchain attestations for v2

### Web app — ⚠️ all three targets are gone
- ~~`/console` page~~ — the route no longer exists.
- ~~`/launch` page: connect to `blue launch` wizard~~ — the top-level `blue launch` command
  is gone and the Bankr deploy path behind it returned 403 before removal.
- ~~`/market` page: connect to real Bankr marketplace API~~ — `/market` was culled and now
  301s; it 404'd in production for a while, which is why `link-liveness-check.ts` exists.

---

## Medium-term (1 month)

### x402 payment enforcement
- Gate CLI commands with x402 payment flow
- Add `--credits` flag for credits-based usage
- Support $BLUEAGENT discount tier

### Agent Score — live data
- Fetch real npm download counts and GitHub stars/forks
- Ping x402 endpoints to verify liveness
- Cache results with 1h TTL

### `blue tui` — extend TUI
- Add watch feed view with real-time updates
- Add market browse with pagination
- Add score card with share-to-X integration

---

## Risks / watch items

- **`VIRTUALS_API_KEY` required** — `blue doctor` already checks it (env, then
  `~/.blue-agent/config.toml`). `BANKR_API_KEY` is dead and must not come back.
- **Task Hub is in-memory** — a process-lifetime `Map`, so `blue tasks` always prints nothing.
  `blue micro` already solved this with JSON files under `~/.blue-agent/`; copy that shape.
- **Score estimates are LLM-based** — not live onchain data; caveat in output and docs
- **Watch/alert config is saved but not executed** — monitoring is not live until connected to listener
- **`blue tui` requires separate install** — will fail gracefully with install instructions if missing

## Product direction to preserve
- Blue Agent = founder console, not generic chatbot
- Base-first, x402-native, artifact-first, workflow-first
- Business logic in packages; web/UI stays thin
- Never invent contract addresses; never suggest Ethereum mainnet
