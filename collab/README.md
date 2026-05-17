# Blue Agent Collab Hub

This folder is the collaboration entrypoint for Blue Agent — agent bridges, discovery, schemas, and community contributions.

## Structure

```
collab/
├── README.md                          — this file
├── agent-discovery.json               — Blue Agent identity, endpoints, skills, collab config
├── shared-schemas.yml                 — data schemas shared across Aeon × Blue Agent × MiroShark
│
├── aeon-blueagent.yml                — Aeon config: watch Blue Agent repo
├── aeon-blueagent.prompt.md          — Aeon prompt: what to produce from repo changes
├── aeon-blueagent-bridge.md          — Architecture: how Blue Agent × Aeon collaborate
│
├── miroshark-blueagent.yml           — MiroShark config: simulation triggers and thresholds
├── miroshark-blueagent.prompt.md     — MiroShark prompt: what to simulate and how to output
├── miroshark-blueagent-bridge.md     — Architecture: how Blue Agent × MiroShark collaborate
│
└── exports/                           — Sample outputs, skill exports, bounty fixtures
    ├── agent-wallet-security.sample.md
    ├── base-ecosystem.sample.md
    ├── reputation-scoring.sample.md
    ├── wallet-guardrails.sample.md
    └── x402-patterns.sample.md
```

## Agent loop

```
Aeon (detect / watch / alert)
  ↓ signal
Blue Agent (translate / decide / distribute)
  ↓ scenario          ↑ result
MiroShark (simulate / forecast)
  ↓
Community / Base (aligned outcomes, shared value, onchain growth)
```

## Key files

| File | Purpose |
|---|---|
| `agent-discovery.json` | Machine-readable identity — agents use this to find and call Blue Agent |
| `shared-schemas.yml` | Signal, scenario, forecast, action, result — the language all three agents speak |
| `aeon-blueagent.yml` | Tells Aeon what to watch in this repo and when |
| `miroshark-blueagent.yml` | Tells MiroShark what scenarios to simulate and what thresholds to use |
| `*-bridge.md` | Human-readable architecture docs for each collab pair |

## Community contributions

Good contribution types:
- Add a new skill file in `skills/`
- Improve an existing skill with better examples or safety notes
- Add a new starter template in `templates/`
- Add an eval case or sample fixture in `collab/exports/`
- Tighten a command contract in `commands/`

Rules:
- Base-only scope
- No invented addresses, partnerships, or stats
- Keep changes small and shippable
- If something touches payments, security, or signing — keep it explicit and grounded

## Suggested bounty areas

- x402 payment patterns
- agent wallet security
- reputation scoring
- Base ecosystem grounding
- Telegram bot patterns
- Foundry deployment templates

## How to contribute

1. Pick a small issue or bounty.
2. Make the change in the matching layer.
3. Keep it grounded and easy to review.
4. Open a PR or patch with a clear summary.
