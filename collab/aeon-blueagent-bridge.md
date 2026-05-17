# Aeon × Blue Agent Bridge

> Updated 2026-05-18 — based on actual Aeon architecture (github.com/aaronjmars/aeon)

---

## What Aeon actually is

Aeon is an **autonomous agent framework** running on GitHub Actions. It is NOT a real-time signal broadcaster — it runs skills on cron schedules and outputs results. It does not POST HTTP signals to Blue Agent in real-time.

**Key facts:**
- Runtime: GitHub Actions (no infrastructure required)
- 117 pre-built skills: research, crypto, dev, social, meta
- Memory: JSON files + markdown logs in `/memory`
- Notification: Telegram, Discord, Slack, Email natively
- Integration: MCP server + A2A protocol gateway
- LLM: Claude (Opus/Sonnet/Haiku) — optionally via Bankr LLM Gateway

---

## How Aeon and Blue Agent actually connect

### Option 1 — A2A gateway (recommended for structured output)

Aeon exposes an `a2a-server/` that any agent framework can call. Aeon delivers skill outputs to Blue Agent's webhook endpoint.

```
Aeon skill runs (cron)
  → output produced
  → A2A gateway POSTs to blueagent.dev/api/webhook/aeon
  → Blue Agent decides: act / notify / ignore
```

### Option 2 — Aeon invokes Blue Agent MCP tools

Aeon has an MCP server. Blue Agent has MCP tools (`npx skills add blueagent`). Aeon can call `blue_audit` directly during a skill run.

```
Aeon detects code issue in blue-agent repo (github-monitor skill)
  → invokes blue_audit via MCP
  → gets structured audit result
  → formats + sends to Telegram blueagent_hub
```

### Option 3 — Telegram as shared bus (simplest, no code needed)

Both Aeon and Blue Agent already push to Telegram. Aeon can watch `madebyshun/blue-agent` and post digest to `blueagent_hub` with no new endpoints.

---

## Division of responsibilities

**Aeon owns:**
- Scheduled monitoring (repo changes, token movements, DeFi activity)
- Quality scoring of its own outputs (1–5 scale, self-healing loop)
- Notification delivery (Telegram, Discord)
- Invoking `blue_audit` via MCP when code issues detected

**Blue Agent owns:**
- Receiving Aeon outputs and deciding what to do
- Onchain execution (USDC distribution, token ops on Base)
- Running commands (blue_idea, blue_build, blue_audit, blue_ship, blue_raise)
- Routing scenarios to MiroShark for simulation
- Publishing results back as quality feedback

**What NOT to do:**
- Do not expect Aeon to POST real-time signals — it runs on cron schedule
- Do not make Blue Agent own Aeon's scheduling logic
- Do not share secrets between repos

---

## Aeon skills relevant to Blue Agent

| Skill | What it does | How Blue Agent uses it |
|---|---|---|
| `github-monitor` | Watch repo for changes, digest | Digest of blue-agent repo → Telegram |
| `token-movers` | $BLUEAGENT price/volume alert | Trigger MiroShark simulation |
| `defi-monitor` | Onchain $BLUEAGENT activity | Feed into distribution decisions |
| `digest` | Weekly ecosystem summary | Push to blueagent_hub |
| `code-health` | Repo quality signals | Trigger blue_audit via MCP |

---

## What Blue Agent needs to build

```
/api/webhook/aeon   — receive Aeon skill outputs (A2A)
```

Input: `aeon_output` schema (see shared-schemas.yml)
Logic: parse → quality_score ≥ 3 + flag = actionable → decide → execute or notify

---

## Rollout order

1. **Now (no code):** Configure Aeon to watch blue-agent repo → Telegram digest
2. **Short term:** Aeon invokes `blue_audit` via MCP on code changes
3. **Medium term:** Build `/api/webhook/aeon` — structured A2A outputs
4. **Long term:** Blue Agent feeds results back to Aeon quality loop

---

## Success criteria

- Aeon posts blue-agent repo digest to `blueagent_hub` weekly
- Aeon catches a real code issue and triggers `blue_audit` automatically
- Blue Agent receives Aeon output and executes 1 real onchain action
