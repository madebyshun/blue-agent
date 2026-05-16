# agent-wallet-security — sample export

## What it covers

Safety rules for agent-controlled wallets, signing, and spend authorization.

## When to use it

Use this skill when the agent may sign, spend, approve, or otherwise move value.

## Core concepts

- Private keys stay scoped and controlled.
- Signing should be explicit.
- High-risk actions need limits.
- Wallet actions should be auditable.

## Patterns

- Use allowlists for supported actions.
- Require approval gates for large or unusual transfers.
- Keep signing surfaces small.

## Pitfalls

- Broad key exposure.
- Unbounded automation.
- Missing audit trails.

## Checklist

- [ ] Keys scoped
- [ ] Limits defined
- [ ] Approvals documented
- [ ] Audit trail preserved
