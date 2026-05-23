---
name: Blue Hub — Risk Gate
description: Use when user wants to verify a transaction or contract before executing. Triggers — "risk gate", "is this transaction safe", "check this address", "AML check", "pre-transaction screen", "rug check", "verify contract", "safe to interact with".
version: 1.0.0
---

# Hub Risk Gate — Pre-Transaction Screen

Screen any transaction before execution — rug check, AML patterns, malicious contract detection.

## What it produces

| Field | Content |
|-------|---------|
| Verdict | CONTINUE / CAUTION / HALT |
| Risk score | 0-100 (0 = safe, 100 = dangerous) |
| Flags | Specific risk signals found |
| AML | Known bad actor patterns |
| Recommendation | Specific action to take |

## MCP Tool

```
hub_risk_gate(action: string, to: string, value?: string)
```

## Inputs

- `action` — `transfer` | `swap` | `approve` | `call`
- `to` — target address `0x...` (required)
- `value` — amount in Wei (optional)

## Example

```
hub_risk_gate("approve", "0x1234567890abcdef1234567890abcdef12345678", "1000000000000000000")
```

## When to run

Run before any transaction involving:
- Approving a new contract
- Sending funds to an unknown address
- Interacting with a new protocol

## Price

$0.05 per call
