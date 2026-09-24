# Blue Hood on Virtuals ACP — go-live record

Last updated: 2026-09-25

## What this is

The operator runbook for **Offering #1 — `execution-plan`**, Blue Hood's paid seller
on Virtuals ACP. It records what was actually wired, why each value is what it is,
and how to prove the seller is alive.

Every value below was read out of the code, not out of a PR body. The file paths are
the source of truth; if this doc and the code disagree, the code wins and this doc is
the bug.

---

## Two chains, two meanings — do not conflate

This is the single easiest way to break the offering.

| Thing | Chain | Where it comes from |
|---|---|---|
| ACP escrow + USDC settlement | **Base 8453** | `ACP_CHAIN_ID`, default `8453` (`acp-seller.ts:113`) |
| The *subject* being priced | **Robinhood Chain 4663** | hardcoded in `buildDeliverable` (`chain_id: 4663`) |

⚠️ **Never set `ACP_CHAIN_ID=4663`.** That variable selects the chain the escrow
contract lives on. Pointing it at RH Chain does not move the desk — it breaks
settlement. The offering *talks about* RH Chain and *gets paid on* Base. Both numbers
are correct at the same time.

---

## Environment variables

Set on Vercel project `blueagent-web-new`, Production.

### Required — all three, or the seller is inert

Missing any one makes `readConfig()` return `null`, and the cron becomes a cheap no-op
that never even imports the ACP SDK (`acp-seller.ts:108-127`).

- `ACP_WALLET_ADDRESS` — the agent wallet (`0x…`)
- `ACP_WALLET_ID` — Privy wallet id from the ACP dashboard
- `ACP_SIGNER_PRIVATE_KEY` — from **Signers → + Add Signer → Copy Key**

🔴 `ACP_SIGNER_PRIVATE_KEY` controls a funded wallet. It is pasted straight into
Vercel by a human and never read, echoed, or logged anywhere else.

### Optional — every one has a working in-code default

| Var | Default | Notes |
|---|---|---|
| `ACP_CHAIN_ID` | `8453` | Base. See the warning above. |
| `ACP_OFFERING_PRICE_USDC` | `0.5` | Non-finite or ≤ 0 falls back to `0.5` |
| `ACP_OFFERING_NAME` | `"execution-plan"` | Must match the Job name in the dashboard |
| `ACP_BUILDER_CODE` | `undefined` | `bc-…`, from the **Base** builder dashboard under Settings. Optional but recommended. |

---

## The Job, as filled in the dashboard

What the SDK calls an *Offering*, the dashboard calls a **Job**, under *Jobs Offered*.
Four-step wizard.

### Step 1 — Job Details

- **Name:** `execution-plan` — must equal `ACP_OFFERING_NAME`
- **Description:** 481 chars (the field caps at 500)
- **Require Funds:** **OFF** — the code never calls `setBudgetWithFundRequest`
- **Price:** **Fixed**, `0.50` — the code always proposes a fixed `setBudget`, so
  Percentage would desync from what we actually charge
- **SLA:** `0h 30m`

### Step 2 — Requirements (what the buyer sends)

| Field | Type | Required |
|---|---|---|
| `ticker` | String | yes |
| `size_usd` | Number | yes |
| `chain` | String | **no** |

`chain` is optional on purpose. `normalizeChain` treats absent as `"robinhood"` —
this offering's only desk — and the field builder has no enum, so the real guard is
the code-level reject, which runs on **both** the `open` and `funded` branches.
Anything that is not RH is rejected with `unsupported_chain` rather than silently
priced against the wrong venue.

Accepted aliases (`extractRequirement`): `ticker`|`symbol`, `size_usd`|`sizeUsd`|`size`,
`chain`|`chain_id`|`chainId`. `robinhood`/`robinhoodchain`/`rh`/`4663` all normalize to
`"robinhood"`.

### Step 2 — Deliverables (what we return)

Exactly the outer keys of `buildDeliverable`, snake_case:

`offering` · `version` · `chain` · `chain_id` · `generated_at` · `plan`

**`plan` is declared as an undeclared Object on purpose.** `ExecPlan` has ~20 fields
and is already at version 1.1. A strict declared schema would eventually reject our
own submission — which loses the escrow *and* adds an expiration to the streak. The
version field is how a buyer pins the shape.

### Step 4 — Examples

Sample request:

```json
{ "ticker": "NVDA", "size_usd": 25000, "chain": "robinhood" }
```

The sample deliverable was produced by actually running
`computeExecutionPlan({ ticker: "NVDA", size_usd: 25000 })`, not written by hand.

---

## Known limitation: buy side only

`acp-seller.ts:348` calls:

```ts
computeExecutionPlan({ ticker: req.ticker, size_usd: req.size_usd })
```

`side` is not passed, so it defaults to `"buy"` (`execution-plan.ts:273`). The listing
says buy side. Wiring sell through is ~4 lines (`extractRequirement` → the call site)
but it touches the payment path, so it needs the full gate and ideally a preview.

Related: `runAcpPollCycle` filters sessions by `roles.includes("provider")` with **no
offering filter**. Today that is fine — there is one offering. The moment a second one
is listed, every job will still route into the RH execution-plan handler.

---

## Anti-ungraduation — the existential rule

ACP auto-ungraduates an agent after **10 consecutive job expirations**. A hung job is
the worst possible outcome; a fast reject or decline is safe and costs nothing.

Thresholds from `lib/blue-hood/kv-keys.ts`:

- warn at **6** (`ACP_EXPIRE_STREAK_WARN`)
- danger at **10** (`ACP_EXPIRE_STREAK_DANGER`)

The code defends this at three layers: an internal deadline strictly under the SLA, a
reject-on-incomplete-input path, and an exactly-once submit lock so two ticks can never
both submit the same job.

---

## Verification

The poll cron runs `*/2 * * * *` (`apps/web/vercel.json`).

To tick it by hand — use the header, never `?secret=`, so the value stays out of shell
history, proxy logs and browser URLs:

```
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  https://blueagent.dev/api/cron/acp-poll | jq
```

`"configured": true` is the whole signal. `false` means at least one of the three
required vars is missing on the deployment you are hitting.

The public, unauthenticated read is `/api/acp/revenue` — completed jobs, USDC
collected, and the live expire streak, straight from the KV ledger. An empty ledger
returns an honest all-zero summary, never a placeholder.

⚠️ `/api/acp/revenue` does **not** expose `configured`, so `total_jobs: 0` looks
identical whether the seller is wired or not wired at all. Today only someone holding
`CRON_SECRET` can tell those two apart. Adding a `configured` boolean there leaks
nothing — it reports whether env is set, not what it is set to.

---

## Go-live record

| | |
|---|---|
| Commit | `032b63f4` — *chore: remove the last live Bankr code paths* |
| Deployment | `dpl_8eQRjZhbwDMKmJZEX4wafkegQNpe`, READY 2026-09-24T19:40:21Z |
| Baseline (pre-go-live) | 2026-09-24T19:17:56Z — every counter `0` |
| First `configured: true` tick | ~2026-09-24T19:46Z, `duration_ms: 5629` |

Baseline captured deliberately so the first real job is unambiguous:

```json
{ "completed_jobs": 0, "usdc_collected": 0, "rejected_jobs": 0,
  "expired_jobs": 0, "in_flight_jobs": 0, "total_jobs": 0, "expire_streak": 0 }
```

First live tick:

```json
{ "ok": true, "configured": true, "provider_sessions": 0, "budget_proposed": 0,
  "delivered": 0, "rejected_input": 0, "declined": 0, "lock_skipped": 0,
  "completed": 0, "expired": 0, "noop": 0, "errors": 0, "duration_ms": 5629 }
```

5.6s against `maxDuration = 60` and `START_DEADLINE_MS = 30_000` — ample headroom.

✅ Seller connected to ACP, awaiting jobs.

---

## `CRON_SECRET` rotation — 2026-09-25

Rotated after the value was exposed during ACP setup. Recorded because the
previous rotation was marked done without being done: the GitHub Actions copy
still carried its `2026-06-18` timestamp three months later.

It lives in **five** places, and a rotation that misses one is a rotation that
did not happen:

1. Vercel Production env on `blueagent-web-new`
2. **GitHub Actions repo secret** — `.github/workflows/blue-hood-poll.yml:37`
   reads `${{ secrets.CRON_SECRET }}`. No job declares `environment:`, so an
   *environment* secret is invisible to it; it must be a **repository** secret.
3. `apps/web/.env.local`
4. `apps/web/.env.production`
5. `apps/web/.env.local.bak` — deleted rather than updated. It was mode `644`.

`.env` and `.env.production.local` do not hold it. Do not add it.

Vercel bakes env into a deployment and injects `Authorization: Bearer
$CRON_SECRET` into its own cron calls from that same deployment's env, so
invoker and route always agree — **and changing the env without redeploying
does nothing.** Old deployment URLs keep the old value and still reach
production KV; rotation alone does not close them.

Verified end to end with `GET /api/usage/daily` (read-only, same gate) → 200,
then `GET /api/cron/acp-poll` → `configured: true`, `errors: 0`.

---

## Open items

- Fix the ACP agent profile description — it still carries a Blue Chat line that does
  not belong on an agent-facing listing.
- Decide: expose `configured` on `/api/acp/revenue`.
- Decide: wire `side` through, or keep the offering buy-side only.
