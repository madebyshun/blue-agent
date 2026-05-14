# x402-patterns

## What it covers
Payment design for x402-style paid endpoints and pay-per-use flows on Base.

## When to use
Use this skill when a task involves:
- paid API endpoints
- USDC pay-per-use flows
- payment-required HTTP responses
- metering, pricing, or usage billing
- wallet-backed access control

## Core guidance
- Keep payment flow simple and explicit
- Base + USDC only
- Document price, currency, and request body schema clearly
- Make the happy path easy to understand
- Treat payment failures as first-class UX

## Common patterns
- price per call
- price per message
- tiered access
- paid retries for expensive computation
- approval-gated actions when a request looks risky

## Common mistakes
- hiding payment requirements
- mixing currencies or chains
- unclear request/response contracts
- forgetting usage logging

## Checklist
- [ ] price defined
- [ ] USDC on Base
- [ ] request schema clear
- [ ] failure path clear
- [ ] usage can be logged
