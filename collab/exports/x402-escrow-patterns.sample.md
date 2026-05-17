# x402-escrow-patterns — sample export

## What it covers

Escrow design, lifecycle, idempotency, fee calculation, and failure handling for Blue Agent's marketplace — microtasks and gig tasks on Base.

## When to use it

Use this skill when building or auditing any flow that locks, releases, or refunds USDC on behalf of users — including the Agent Marketplace and Community Flywheel distribution.

## Core concepts

- USDC on Base: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (6 decimals)
- Platform fee: 5% of gross reward on every release
- Escrow is offchain state-tracked — not a smart contract (yet)
- State machine: `hold → active → released | refunded | expired`

## Escrow lifecycle

```
Post task → lock USDC (hold)
Worker accepts → move to active
Worker submits → poster reviews
Approved → release to worker (net of 5% fee)
Rejected → refund to poster
Expired → auto-refund after deadline
```

## Patterns

- Always use idempotency keys — prevent double-release on network retry.
- Never update state after payout call without confirming the call succeeded.
- Partial payouts for multi-slot microtasks: release per slot, not in bulk.
- Fee calculation: `net = gross * 0.95`, `platform = gross * 0.05`.
- If escrow state diverges from actual USDC balance — flag for manual review, never auto-resolve.
- High-value releases (> $50 USDC) require MiroShark confidence check before executing.
