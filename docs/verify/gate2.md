# Gate 2 — Semantic smoke CI

Status: **PASS (local mode)** · CI wired · Awaiting first two green production cron runs.

## Assertions implemented (`apps/web/scripts/semantic-smoke.ts`)

Both modes share the same assertion set:
- `TARGET` env → HTTP mode (used by CI against prod, requires `INTERNAL_SERVICE_KEY` matching prod)
- no `TARGET` → local mode (imports `HANDLERS` directly, no HTTP)

### Assertions per reviewer spec

- **M5**: `verdict ∈ {ALIGNED, LONG_DEX, SHORT_DEX, FROZEN_ALIGNED, PREMARKET_DRIFT, AFTERHOURS_DRIFT, INSUFFICIENT_DATA}` + `market.is_open` matches computed NY clock.
- **X1**: `min_out < expected_after_impact ≤ expected_out`, `spot_source === "pool"` (with 1× retry to survive GT rate-limit).
- **M4**: every ranked entry passes dust floor ($5k TVL + $500 24h volume); gainers/losers disjoint.
- **M2**: `candles_returned ≥ 1` OR one of the "honesty" warnings (`insufficient_history`, `ohlc_unavailable`, `single_candle`, `no_pool`).
- **L4**: MSTR (`0xec262a75…`) → `CANONICAL`; random address → non-CANONICAL.
- **A4**: `llm.provider` non-null; if `web_search_used=false`, `no_web_search_this_run` warning required.

## Local run result (2026-07-17)

```
── SUMMARY ── 22/22 pass
```

Output verified on main branch, no code changes needed to reach 22/22.

## CI workflow (`.github/workflows/rh-rwa-semantic-smoke.yml`)

- Triggers: PR (paths-filtered to RH RWA files), 6h cron, `workflow_dispatch`.
- Runs against `TARGET=https://blueagent.dev` with `INTERNAL_SERVICE_KEY` GitHub secret.
- Exit 1 on any assertion mismatch — blocks PR merge / marks cron red.
- Reviewer requirement: **2 consecutive green cron runs on prod** before promoting to PASS.

## Action item

- Add GitHub secret `INTERNAL_SERVICE_KEY` (matching the Vercel `blueagent-web-new` production value) to the repo. Without it, the CI job exits 2 with a clear error.
- After secret set + first cron fires, watch the Actions tab for 2 consecutive greens.

## Gate 2 verdict

- Local: ✅ 22/22 assertions pass
- CI workflow: ✅ committed and ready
- Prod cron: ⏸ awaiting secret + 2 consecutive greens
