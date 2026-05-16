# x402-patterns — sample export

## What it covers

Practical x402 payment flow patterns for paid commands, APIs, retries, and safe fallback behavior.

## When to use it

Use this skill when a workflow charges USDC for an action or needs to handle 402 payment challenges.

## Core concepts

- Payment challenge
- Retry after settlement
- Idempotent request handling
- Clear price and schema definitions

## Patterns

- Keep paid endpoints narrow.
- Make payment requirements explicit.
- Retry safely after challenge resolution.
- Treat payment state as part of the workflow state.

## Pitfalls

- Non-idempotent retries.
- Hidden pricing.
- Ambiguous failure handling.

## Checklist

- [ ] Pricing is explicit
- [ ] Retry path is safe
- [ ] Challenge handling is documented
- [ ] Fallbacks are defined
