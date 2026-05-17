# Blue Agent × MiroShark Bridge

This document defines how Blue Agent and MiroShark collaborate in the agent loop.

## Roles

- **Blue Agent** = coordinator — receives signals, builds scenarios, executes onchain actions
- **MiroShark** = simulator — takes a scenario, spawns agents, returns a forecast

## Shared loop

1. Aeon detects a signal and sends it to Blue Agent via `/api/signal`
2. Blue Agent translates the signal into a scenario
3. Blue Agent sends the scenario to MiroShark via `/api/simulate`
4. MiroShark returns a forecast with a confidence score and recommendation
5. Blue Agent decides: execute / alert human / skip — based on confidence threshold
6. Blue Agent acts onchain and records the result
7. Blue Agent sends predicted vs actual back to Aeon to close the loop

## Division of responsibilities

**Blue Agent owns**
- Signal ingestion and interpretation
- Scenario construction from raw signal data
- Decision logic (confidence threshold, action routing)
- Onchain execution (distribution, rewards, transactions)
- Result recording and feedback to Aeon

**MiroShark owns**
- Agent spawning and simulation runtime
- Hour-by-hour reaction modeling
- Confidence scoring
- Risk factor identification
- Forecast narrative generation

## Data flow

```
Aeon
  │
  │  POST /api/signal
  │  { type, data, confidence, timestamp }
  ▼
Blue Agent
  │  builds scenario from signal + context
  │
  │  POST MiroShark /api/simulate
  │  { scenario, context, horizon_hours }
  ▼
MiroShark
  │  spawns 200 agents
  │  simulates 6h of reactions
  │
  │  returns forecast
  │  { confidence, recommendation, risk_factors, track_metric }
  ▼
Blue Agent
  │  confidence >= 0.70 → execute
  │  confidence 0.40–0.69 → alert human
  │  confidence < 0.40 → skip
  │
  │  if execute: act onchain, record tx_hash
  │
  │  POST result back to Aeon
  │  { predicted, actual, delta_pct, lesson }
  ▼
Aeon (monitors outcome, improves next signal quality)
```

## Schema reference

All data exchanged between agents uses `shared-schemas.yml`:
- `signal` — Aeon → Blue Agent
- `scenario` — Blue Agent → MiroShark
- `forecast` — MiroShark → Blue Agent
- `action` — Blue Agent → onchain
- `result` — Blue Agent → Aeon

## Confidence thresholds

| Score | Decision | Who acts |
|---|---|---|
| ≥ 0.70 | Execute | Blue Agent auto-executes |
| 0.40 – 0.69 | Alert human | Telegram alert to blueagent_hub |
| < 0.40 | Skip | Log and discard |

## What not to do

- Do not let MiroShark trigger onchain actions directly — Blue Agent is the only executor.
- Do not skip the forecast step for high-value actions (> $50 USDC distribution).
- Do not invent confidence scores — if MiroShark is unavailable, default to alert_human.
- Do not expose private keys or wallet secrets in scenario payloads.

## Rollout order

1. Build `/api/signal` endpoint on Blue Agent
2. Build scenario builder (signal → scenario translation)
3. Self-host MiroShark or connect to MiroShark API when available
4. Build decision engine (confidence → execute/alert/skip)
5. Build onchain executor for USDC/token distribution on Base
6. Wire result feedback to Aeon

## Success criteria

The bridge is working when:
- Blue Agent acts on a real Aeon signal within 10 minutes of detection
- MiroShark forecast accuracy (predicted vs actual) improves over 4+ weeks
- Onchain distribution transactions are traceable and match forecast recommendations
- Telegram alerts fire only when confidence is genuinely uncertain
