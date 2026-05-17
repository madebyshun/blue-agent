# MiroShark × Blue Agent Bridge

> Updated 2026-05-18 — based on actual MiroShark architecture (github.com/aaronjmars/MiroShark)

---

## What MiroShark actually is

MiroShark is an **open-source swarm intelligence simulation engine**. It spawns hundreds of AI agent personas that interact on simulated platforms (Twitter, Reddit, prediction markets) hour-by-hour. Input any scenario, get back consensus splits, transcripts, and belief trajectories.

**Key facts:**
- Backend: Python + Neo4j graph database (agent memory + interaction networks)
- Frontend: Node.js/React on port 3000
- LLM: OpenRouter (Mimo V2 Flash + Gemini 3 Flash by default)
- Persona archetypes: analyst, influencer, retail trader, observer
- REST API at `/api/simulation/`
- Async delivery via **webhooks** (Slack, Discord, Zapier, custom endpoints)
- HMAC signature verification via `WEBHOOK_SECRET`
- Reproducible: bytewise-stable config at `/reproduce.json`

---

## How MiroShark and Blue Agent actually connect

**Async webhook pattern** — Blue Agent submits a scenario, MiroShark runs simulation, POSTs result back when done.

```
Blue Agent builds scenario
  → POST MiroShark /api/simulation/ { scenario, webhook_url }
  → MiroShark simulates (minutes, not seconds)
  → MiroShark POST blueagent.dev/api/webhook/miroshark { consensus_split, transcript_url }
  → Blue Agent receives result → decides: execute / alert / skip
```

This is **async**, not synchronous. Blue Agent should not wait for a response — it receives results via webhook callback.

---

## MiroShark REST API

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/simulation/` | POST | Submit scenario, get simulation_id |
| `/api/simulation/{id}/transcript` | GET | Per-round posts with stance labels |
| `/api/simulation/{id}/trajectory.csv` | GET | Time-series belief data |
| `/api/simulation/{id}/reproduce.json` | GET | Bytewise reproducibility config |
| `/api/simulation/{id}/thread.txt` | GET | Auto-formatted Twitter thread export |

---

## Division of responsibilities

**Blue Agent owns:**
- Building the scenario from Aeon output or internal trigger
- Submitting to MiroShark `/api/simulation/`
- Running `/api/webhook/miroshark` endpoint to receive results
- Decision logic: consensus_split → execute / alert_human / skip
- Onchain execution on Base (USDC/token distribution)

**MiroShark owns:**
- Spawning agent personas and running simulation
- Generating Bull/Bear/Neutral consensus split
- Delivering results via webhook POST
- Providing transcript + trajectory for analysis

**What NOT to do:**
- Do not wait synchronously for MiroShark — simulation takes minutes
- Do not let MiroShark trigger onchain actions directly — Blue Agent is the only executor
- Do not skip webhook verification (use HMAC `WEBHOOK_SECRET`)

---

## Decision logic (Blue Agent)

Blue Agent maps MiroShark `consensus_split` to action:

| Consensus | Decision | Who acts |
|---|---|---|
| Bull > 60% | Execute | Blue Agent auto-executes onchain |
| Bull 40–60% or Bear > 40% | Alert human | Telegram alert to blueagent_hub |
| Neutral > 60% or quality low | Skip | Log and discard |

---

## What Blue Agent needs to build

```
/api/webhook/miroshark   — receive MiroShark simulation results
```

Input: `webhook_result` schema (see shared-schemas.yml)
Logic:
1. Verify HMAC signature
2. Map consensus_split → decision
3. If execute: run onchain action
4. If alert_human: POST to Telegram
5. If skip: log

---

## Data flow (full)

```
Aeon output / internal trigger
  │
  ▼
Blue Agent builds scenario
  │  POST /api/simulation/ { scenario, webhook_url, context }
  ▼
MiroShark simulates
  │  personas react on Twitter/Reddit/prediction markets
  │  hour-by-hour belief evolution
  │
  │  POST blueagent.dev/api/webhook/miroshark
  │  { consensus_split, transcript_url, simulation_id }
  ▼
Blue Agent decides
  │  bull > 60% → execute onchain (Base)
  │  mixed      → Telegram alert
  │  neutral    → skip
  ▼
Result recorded → Aeon quality loop
```

---

## Rollout order

1. **Now:** Align with @aaronjmars on webhook format + WEBHOOK_SECRET setup
2. **Short term:** Build `/api/webhook/miroshark` endpoint on Blue Agent
3. **Short term:** Submit first real scenario (small, low-stakes)
4. **Medium term:** Wire Aeon output → scenario builder → MiroShark
5. **Long term:** Feed predicted vs actual back into MiroShark for calibration

---

## Success criteria

- Blue Agent submits 1 real scenario to MiroShark
- MiroShark webhook delivers result to Blue Agent within 15 minutes
- Blue Agent executes 1 onchain action based on MiroShark consensus
- Predicted vs actual tracked over 4+ weeks for calibration
