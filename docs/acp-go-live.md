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
| `side` | String | **no** |

`chain` is optional on purpose. `normalizeChain` treats absent as `"robinhood"` —
this offering's only desk — and the field builder has no enum, so the real guard is
the code-level reject, which runs on **both** the `open` and `funded` branches.
Anything that is not RH is rejected with `unsupported_chain` rather than silently
priced against the wrong venue.

`side` is optional the same way and for a different reason: absent means `"buy"`, which
is what every job sold before 2026-09-25 received. Only `buy` and `sell` are accepted —
anything else (`short`, `exit`, …) is rejected with `unsupported_side` rather than
defaulting, because `computeExecutionPlan` coerces any non-`"sell"` value to `"buy"`
(`execution-plan.ts:273`) and a silent default would bill someone for the opposite of
what they asked.

Accepted aliases (`extractRequirement`): `ticker`|`symbol`, `size_usd`|`sizeUsd`|`size`,
`chain`|`chain_id`|`chainId`, `side`|`direction`|`action`.
`robinhood`/`robinhoodchain`/`rh`/`4663` all normalize to `"robinhood"`.

### Step 2 — Deliverables (what we return)

Exactly the outer keys of `buildDeliverable`, snake_case:

`offering` · `version` · `chain` · `chain_id` · `generated_at` · `plan`

**`plan` is declared as an undeclared Object on purpose.** `ExecPlan` has ~20 fields
(39 leaf values once nested) and is already at version 1.2. A strict declared schema
would eventually reject our own submission — which loses the escrow *and* adds an
expiration to the streak. The version field is how a buyer pins the shape.

### Step 4 — Examples

Sample request:

```json
{ "ticker": "NVDA", "size_usd": 25000, "chain": "robinhood" }
```

The sample deliverable was produced by actually running
`computeExecutionPlan({ ticker: "NVDA", size_usd: 25000 })`, not written by hand.

---

## Both sides — and what that does *not* mean

`side` is wired through `extractRequirement` → `computeExecutionPlan` as of 2026-09-25,
and the deliverable version went `1.1` → `1.2` because `plan.side` could previously only
ever be `"buy"`.

🔴 **Read this before writing any listing copy.** MEASURED the same day, NVDA at $25k: a
buy plan and a sell plan differ in **exactly one of 39 leaf fields — `side` itself.**
Route, legs, primary pool, slippage, TVL, mid price: all identical, to the digit.

That is not an oversight to fix later. First-order impact is `size/(one_side + size)`
against the same reserve, which is direction-symmetric under xy=k *by construction*. The
numbers are the same because under this model they genuinely are the same.

So what did wiring `side` actually buy? **A correct receipt, not new analysis.** Before
it, a buyer asking for `"sell"` got a plan stamped `side: "buy"`, and a buyer typing
`"short"` was silently priced as a buy. Now the first is labelled honestly and the second
is rejected. Do not let the Job description imply sell-side modelling — if that ever
becomes real it will be a change in `execution-plan.ts`, not in the seller.

---

## Known limitation: one handler for every offering

`runAcpPollCycle` filters sessions by `roles.includes("provider")` with **no
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

To tick it by hand. Read the key from the env file by **absolute** path and check its
length before spending it:

```sh
SEC=$(grep -m1 '^CRON_SECRET=' ~/projects/blue-agent/apps/web/.env.local | cut -d= -f2- | tr -d '"')
[ ${#SEC} -eq 64 ] && curl -s -H "Authorization: Bearer $SEC" \
  https://blueagent.dev/api/cron/acp-poll | jq || echo "secret unreadable: len=${#SEC}"
unset SEC
```

⚠️ The length guard is not ceremony. The route answers the **same**
`401 {"error":"Unauthorized"}` for a wrong key and for an empty one, so an unguarded
command reports "I could not read the file" as what looks like "the rotation broke
something" — which it did twice on 2026-09-25, once from an emptied clipboard and once
from running a relative path out of the wrong directory.

Header, never `?secret=` — a query string lands in shell history, proxy logs and browser
URLs.

`"configured": true` is the whole signal. `false` means at least one of the three
required vars is missing on the deployment you are hitting.

The public, unauthenticated read is `/api/acp/revenue` — completed jobs, USDC
collected, and the live expire streak, straight from the KV ledger. An empty ledger
returns an honest all-zero summary, never a placeholder.

It also carries `configured`, added 2026-09-25 off the same SDK-free
`isAcpSellerConfigured()` the cron uses. Without it, `total_jobs: 0` looked identical
whether the seller was live and unhired or never wired at all, and only someone holding
`CRON_SECRET` could tell those apart — so "no revenue" read as proof of a dead agent.
It leaks nothing: it reports **whether** the env is set, never what it is set to.

That makes the public read sufficient for the common check, and the authenticated tick
above only necessary when you need the per-tick tally:

```sh
curl -s https://blueagent.dev/api/acp/revenue | jq '{configured, total_jobs, expire_streak}'
```

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
does nothing.**

Old deployments keep the old value baked in, so rotation alone never invalidates
it. What closes them is **Deployment Protection, which is already on for this
project** — measured 2026-09-25: `…-1sytz9ane-….vercel.app/api/acp/revenue`
returned `302 → vercel.com/sso-api`, not the route. So the old secret is inert:
every build that still honours it is unreachable without a Vercel session on the
team, and no deployment had to be deleted. Turn protection off and every one of
those URLs goes live again holding the old value.

Verified end to end with `GET /api/usage/daily` (read-only, same gate) → 200,
then `GET /api/cron/acp-poll` → `configured: true`, `errors: 0`.

---

## Open items

- **Dashboard is behind the code.** `side` is live in the seller but the Job's Step-2
  Requirements still list three fields, and the description still says buy side. Until
  someone edits the wizard, sell works for a buyer who reads this doc and not for one
  who reads the listing. Add `side` (String, not required) and drop the buy-side claim.
- Fix the ACP agent profile description — it still carries a Blue Chat line that does
  not belong on an agent-facing listing.
