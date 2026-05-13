# Blue Agent Roadmap

Last updated: 2026-05-12

---

## Phase 1 — Canonical repo setup ✅
- Repo root workspace
- App/service/package separation
- Shared docs and command specs
- Clean naming and config

## Phase 2 — Core workflow ✅
- `blue idea` → `blue build` → `blue audit` → `blue ship` → `blue raise`
- Bankr LLM with skill-grounded context
- Command contract docs

## Phase 3 — Setup, identity, discovery ✅
- `blue new / init / doctor` — setup and health
- `blue score / agent-score / compare` — identity and scoring
- `blue search / trending / watch / alert / history` — discovery layer
- `blue launch / market` — launch wizard and marketplace browse

## Phase 4 — Task/workflow ops ✅ (scaffold)
- `blue tasks / post-task / accept / submit`
- In-memory task hub — needs DB/onchain persistence

## Phase 5 — Terminal UI ✅ (delegate)
- `blue tui` — delegates to `@blueagent/cli`
- `blue tui market / watch / launch` — focused views

---

## Phase 6 — Live data layer (next)
- Replace LLM-grounded score estimates with live onchain + social data
- Wire watch/alert delivery (Telegram, webhook)
- Task Hub persistence (Supabase or onchain attestation)
- Real marketplace API (not LLM-grounded browse)

## Phase 7 — Payments + monetization
- Enforce x402 payment for AI commands in CLI
- Credits, USDC, $BLUEAGENT discount tiers
- Creator revenue share for marketplace listings

## Phase 8 — Agent identity on-chain
- Builder/agent NFT identity on Base
- Score attestations as onchain records
- Decentralized task escrow

## Phase 9 — Community kit
- Team/org accounts
- Invite flows and builder collabs
- Recurring SaaS revenue via Bankr subscriptions
