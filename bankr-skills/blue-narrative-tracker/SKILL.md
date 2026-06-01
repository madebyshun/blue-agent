---
name: blue-narrative-tracker
description: Track live CT narratives on Base — what's running, what's fading, where to position. x402 pay-per-call.
triggers: "what narratives are running", "what's hot on CT", "narrative position", "what's pumping", "Base meta"
payment: x402
price_usdc: "0.20"
network: base
---

# blue-narrative-tracker — CT Narrative Intelligence for Base

Tracks live narratives on Crypto Twitter relevant to the Base ecosystem — what's gaining momentum, what's fading, where conviction is building. Returns positioning guidance per narrative.

## Trigger Conditions

Activate on:
- "What narratives are running on CT"
- "What's the Base meta right now"
- "What's pumping / what's fading"
- "Where should I position narratively"
- Any request for CT sentiment or narrative momentum

## How to Call

```
POST https://blueagent.dev/api/x402/narrative-position
X-Payment: <EIP-3009 USDC, amount: 200000 (0.20 USDC)>
Content-Type: application/json

{
  "focus": "optional: specific sector (defi, nft, meme, infra...)"
}
```

**Price:** $0.20 USDC  
**Pay to:** `0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f`  
**Manifest:** `https://blueagent.dev/.well-known/ai-tool/narrative-position.json`

## Output Structure

- **Top narratives** (3–5): name, momentum (RISING/PEAK/FADING), conviction score
- **Position guidance** per narrative: ENTER / HOLD / AVOID
- **Crowding signal**: how consensus is the narrative
- **Contrarian take**: what the market is missing
- **Catalyst watch**: upcoming events that could shift momentum

## Key Rules

- Narratives must be grounded in observable CT signal — not invented
- Flag if a narrative is consensus (reduces asymmetry)
- Contrarian take is mandatory even when consensus looks sound
- Base ecosystem focus — cross-chain narratives only if relevant to Base tokens

## Integration

Pairs with: `blue-token-pick` (find tokens riding the narrative), `aeon-narrative-tracker` (cross-check), `ecosystem-digest` (broader Base news context)
