---
name: Blue Hub — Narrative
description: Use when user asks about market narratives, what's trending on CT, or wants a narrative map. Triggers — "what's running", "narrative positions", "what's hot", "mindshare", "FRONT-RUN", "narrative tracker", "what should I focus on".
version: 1.0.0
---

# Hub Narrative — Narrative Map

Mindshare scores, velocity arrows, phase labels, and position calls across Base narratives.

## What it produces

| Field | Content |
|-------|---------|
| Narratives | Active narratives with mindshare score (0-100) |
| Velocity | ↑↑ rising fast / ↑ rising / → flat / ↓ fading |
| Phase | Emerging / Rising / Peak / Fading |
| Position call | FRONT-RUN / RIDE / FADE / WATCH |
| Blue verdict | Which narrative to act on and why |

## MCP Tool

```
hub_narrative(focus?: string)
```

## Inputs

- `focus` (optional) — specific narratives to track (e.g., "AI agents, DeFi, RWA")

## Example

```
hub_narrative("Focus on AI agent tokens and onchain gaming")
```

## Output

Narrative map table + Blue verdict with specific action.

## Price

$0.15 per call
