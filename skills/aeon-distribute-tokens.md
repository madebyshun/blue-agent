---
name: aeon-distribute-tokens
description: |
  ⚠️ CANNOT RUN — the transfer rail this skill depends on is banned. Batch token payouts via
  the Bankr Wallet API with per-recipient idempotency, two-phase resolve→execute, dry-run
  preview, and recovery from partial runs. The design below is sound and is kept as a
  specification, but every Bankr endpoint it calls answers 403, so it must NOT be offered as
  an executable capability. If asked to "distribute tokens", "pay contributors", "run the
  weekly payout", "send USDC to this list" or "tip these handles": say the payout rail is
  unavailable and that reinstating it needs a different transfer rail. Do not attempt the
  calls, and do not report a payout as sent.
source: BankrBot/skills
---

# aeon-distribute-tokens

> 🔴 **THIS SKILL CANNOT EXECUTE. Do not run it, and do not tell anyone a payout went out.**
>
> Every endpoint below lives on `api.bankr.bot`, and Blue Agent's Bankr account is suspended:
>
> ```
> POST /token-launches/deploy  → 403
> {"error":"Account suspended","banned":true,"banType":"restricted","reasonCode":"fraud"}
> ```
>
> Measured 2026-09-06 on both `?chain=base` and `?chain=robinhood`; re-measured 2026-09-18.
> The suspension is on the **account**, not on one hostname or one key — so a different
> `BANKR_API_KEY` does not help, and neither does a different endpoint. Reads were carved
> out as still-working on 2026-09-06 (`GET /token-launches` → 200); that carve-out **expired**
> — `GET /v1/usage` answered 403 on 2026-09-18. A carve-out earned by one measurement is not
> permanent, and `POST /wallet/transfer` was never in it.
>
> This file is retained as a **specification**, not as an instruction: the idempotency design
> (state keyed on `(list, recipient, utc_date)`, persist-after-every-line) is the part worth
> keeping for whatever rail replaces Bankr. Everything below describes how the payout *would*
> work, in the past-conditional. Reinstating it is a rail change, not a config change.
>
> ⚠️ This matters more than a normal stale doc because `skills/` is concatenated into the
> **system prompt** of the grounded `blue` commands. Left unmarked, a model reads the sections
> below as a live runbook and will confidently narrate a payout that never happened — the
> failure mode where absent execution is reported as a completed transfer.

Batch payout design. State is keyed on `(list, recipient, utc_date)` so any re-run within the same day skips already-completed rows.

## Phases

1. **RESOLVE** — load config, check `BANKR_API_KEY` scope (read-write required), preflight portfolio balance, resolve every `@handle` to an EVM address via Bankr Agent, build the plan. Aborts before any transfer if balance < `total × 1.05`.
2. **EXECUTE** — for each `READY` row, call `POST /wallet/transfer`. Persist state to disk **after every line**, not at the end.

Dry-run runs RESOLVE only and prints the plan with no transfers.

## Config

```yaml
defaults:
  token: USDC
  amount: "5"
  chain: base

lists:
  contributors:
    description: "Weekly contributor rewards"
    token: USDC
    amount: "10"
    recipients:
      - handle: "@alice"
        amount: "15"
      - handle: "@bob"
      - address: "0x742d...5678"
        label: "Charlie"
        amount: "20"
```

Token addresses on Base:
- USDC: `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913`
- Native ETH: `tokenAddress: 0x000...000`, `isNativeToken: true`

## API surface

| Endpoint | Purpose |
|---|---|
| `GET /wallet/me` | Preflight: identity + scope check. 403 → key is read-only, abort. |
| `GET /wallet/portfolio?chain=base` | Balance check vs total × 1.05. |
| `POST /agent/prompt` + `GET /agent/job/{id}` | `@handle` → address resolution. Never used for transfers. |
| `POST /wallet/transfer` | The only sanctioned transfer endpoint. |

```bash
curl -fsS -X POST "https://api.bankr.bot/wallet/transfer" \
  -H "X-API-Key: ${BANKR_API_KEY}" -H "Content-Type: application/json" \
  -d '{"recipientAddress":"0x...","tokenAddress":"0x8335...","amount":"15","isNativeToken":false}'
```

## State file

```json
{
  "contributors|@alice|2026-05-16": {
    "list": "contributors", "recipient": "@alice", "address": "0x...",
    "amount": "15", "token": "USDC",
    "status": "completed", "txHash": "0x...",
    "timestamp": "2026-05-16T12:34:56Z"
  }
}
```

Read before sending; persist after every line.

## Outcome handling

| Response | Action |
|---|---|
| `200` + `success: true` | Mark completed, store txHash, persist immediately. |
| `200` + `success: false` | Mark failed with error reason. |
| `403` | Key lost write scope — abort remaining rows. |
| `429` | Sleep 60s, retry once; if still 429 abort remaining. |
| `5xx` / network | Retry once after 10s; mark failed if still bad. |

## Output

Verdict line first: `COMPLETE` / `PARTIAL` / `FAILED` / `DRY_RUN` / `NOTHING_TO_SEND`. Then per-row breakdown with basescan tx links for successes and reason codes for failures.

## Rules

- Idempotency is non-negotiable. Read state before sending, persist after every line.
- Preflight balance with 5% headroom — never start a partial run.
- Wallet API only for transfers. Agent API resolves handles; it does not move tokens.
- Bankr rate limit (100/day standard) is a hard ceiling — split lists of > 50.
- Unresolvable handles are skipped with `RESOLVE_FAILED`, not loudly failed — the rest of the plan runs.

## Required scope

`BANKR_API_KEY` with **Wallet API** enabled and **read-write** access. Read-only keys 403 at preflight.

⚠️ This scope requirement is now unsatisfiable. The 403 at preflight no longer discriminates
between a read-only key and a read-write one — the **account** is restricted, so every key
returns the same 403 regardless of its scope. Do not read a 403 here as "wrong key" and go
looking for a better one; there isn't one.

## Blue Agent usage

Weekly $BLUEAGENT rewards distribution to top community builders was the intended use, paired
with leaderboard data from `users.json` to generate the recipients list.

**It has never run on this rail and cannot be scheduled.** Do not promise a payout date, do not
queue a run, and if a distribution is genuinely wanted, escalate to ShunTr as a rail decision —
choosing a replacement transfer path moves real money and is not Claude's call. The leaderboard
half still works; only the sending half is blocked.
