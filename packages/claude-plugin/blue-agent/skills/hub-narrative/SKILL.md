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

## How to run it

> Changed 2026-09-26. There is **no `hub_narrative` MCP tool any more.** The MCP
> manifest was cut from 85 tools to 18 to keep agent context small. The tool itself
> is unchanged and still live — it is now reached through the paid door.

```
blue_call(tool: "narrative-position", input: { focus?: string })
```

`blue_call` charges x402. The first call returns HTTP 402 with payment requirements;
sign them with your own wallet and call again with `payment: <base64 X-PAYMENT>`.
Blue Agent never holds your key and authorises one exact amount per call.

## Inputs

- `focus` (optional) — specific narratives to track (e.g., "AI agents, DeFi, RWA")

## Example

```
blue_call(tool: "narrative-position", input: {
  focus: "Focus on AI agent tokens and onchain gaming"
})
```

## Output

Narrative map table + Blue verdict with specific action.

## Price

$0.15 per call
