# Blue Agent — Next Steps

Last updated: 2026-05-12

---

## Immediate (can ship now)

### 1. Publish `@blueagent/builder` v0.1.9
The package now has 22 commands (was 14). Bump version and publish.

```bash
cd packages/builder && npm version patch && npm publish --access public
```

### 2. Set BANKR_API_KEY in .env
All commands that call Bankr LLM require this env var. Catch missing key in `blue doctor`.

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

### Web app
- `/console` page: wire up `blue idea/build/audit/ship/raise` with streaming
- `/launch` page: connect to `blue launch` wizard flow
- `/market` page: connect to real Bankr marketplace API when available

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

- **BANKR_API_KEY required** — setup.sh and `blue doctor` must catch missing key early
- **Task Hub is in-memory** — data lost on restart; add file persistence before real usage
- **Score estimates are LLM-based** — not live onchain data; caveat in output and docs
- **Watch/alert config is saved but not executed** — monitoring is not live until connected to listener
- **`blue tui` requires separate install** — will fail gracefully with install instructions if missing

## Product direction to preserve
- Blue Agent = founder console, not generic chatbot
- Base-first, Bankr-native, artifact-first, workflow-first
- Business logic in packages; web/UI stays thin
- Never invent contract addresses; never suggest Ethereum mainnet
