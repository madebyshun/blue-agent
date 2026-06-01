---
name: blue-token-pick
description: Asymmetric token pick on Base — signal, entry, thesis, kill criterion, sizing. Powered by Blue Agent x402.
triggers: "token pick", "what should I buy on Base", "give me a signal", "asymmetric setup", "Base token alpha"
payment: x402
price_usdc: "0.25"
network: base
---

# blue-token-pick — Asymmetric Token Signal on Base

Delivers one high-conviction token pick scoped to the Base ecosystem: signal strength, entry zone, falsifiable thesis, kill criterion, and sizing guidance. Powered by Blue Agent via x402 micropayment.

## Trigger Conditions

Activate on:
- "Give me a token pick on Base"
- "What's the asymmetric setup today"
- "Base token alpha / signal"
- "What should I buy / trade"
- Any request for a specific token recommendation on Base

## How to Call

```
POST https://blueagent.dev/api/x402/token-pick-signal
X-Payment: <EIP-3009 USDC, amount: 250000 (0.25 USDC)>
Content-Type: application/json

{
  "context": "optional: market context or specific sector focus"
}
```

**Price:** $0.25 USDC  
**Pay to:** `0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f`  
**Manifest:** `https://blueagent.dev/.well-known/ai-tool/token-pick-signal.json`

## Output Structure

Each pick includes:
- **Token** — symbol + contract address (Base, verified)
- **Signal** — STRONG / MEDIUM / WEAK
- **Entry zone** — price range
- **Thesis** — single falsifiable sentence with named catalyst
- **Kill criterion** — objective signal that invalidates the trade
- **Sizing** — small / medium / large relative to portfolio
- **Time horizon** — hours / days / weeks

## Output Modes

**PICK**: Full signal with all fields above.

**NO_PICK**: When no candidate meets the bar — return 2-3 near-misses with gaps explained and "what would tip the call."

## Key Rules

- Thesis must include a **named, dated catalyst** — "sentiment turning" is not valid
- Crowded consensus kills asymmetry — flag if thesis is widely held
- All addresses are Base Mainnet, verified on Basescan
- Never invent contract addresses

## Integration

Pairs with: `blue-narrative-tracker` (confirm narrative), `aeon-token-pick` (cross-check signal), `blue-hub` (discover more tools)
