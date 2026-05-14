# base-4337-aa

## What it covers
Account abstraction on Base:
- ERC-4337 smart accounts
- paymasters
- session keys
- gas sponsorship
- wallet UX patterns

## When to use
Use this skill when a task involves:
- smart wallet architecture
- gasless UX
- permissioned agent actions
- onboarding builders without forcing them to manage gas directly

## Core guidance
- Keep wallet UX simple
- Separate user auth from execution authority
- Prefer session-scoped permissions for agents
- Make sponsorship rules explicit
- Think about revocation and recovery from the start

## Common mistakes
- assuming every action should be fully permissionless
- ignoring gas sponsorship economics
- skipping revocation or expiry logic
- designing flows that are too complex for users

## Checklist
- [ ] smart account flow explained
- [ ] paymaster/sponsorship considered
- [ ] session key or scoped permission considered
- [ ] recovery/revocation noted
- [ ] Base-only context
