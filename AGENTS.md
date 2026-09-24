# AGENTS.md — Blue Agent

## What is Blue Agent

**Blue Agent** is an AI agent layer built on Base — it interacts with users, automates tasks, and generates onchain activity.

Blue Agent is the flagship AI agent of the Base ecosystem. It is not just a chatbot — it is a full economic actor: it holds a wallet, executes onchain transactions, earns and distributes tokens, and powers a growing ecosystem of tools and services.

**Two surfaces:**
- **Founder console** (this repo) — AI-native workflow for Base builders: idea → build → audit → ship → raise. MCP-native — runs inside Codex Desktop, Cursor & Codex (`https://blueagent.dev/api/mcp`). *Not a tool you open. A layer you build on.*
- **x402 API services** — pay-per-use AI tools (USDC on Base, EIP-3009) for agents and developers. Each of the 5 commands is backed by a cluster of hub tools (e.g. audit → risk_gate · honeypot · phishing_scan · key_exposure · protocol_risk).

> Note: the Telegram bot surface is **no longer in active development** (as of 2026-06). Focus is the 5 commands + their hub tool clusters.

**Tokens:**
- `$BLUEAGENT` — `0xf895783b2931c919955e18b5e3343e7c7c456ba3` (Base, Uniswap v4)

**Links:**
- X/Twitter: [@blueagent_](https://x.com/blueagent_)
- Telegram community: [t.me/blueagent_hub](https://t.me/blueagent_hub)
- Bankr profile: [bankr.bot/agent/blue-agent](https://bankr.bot/agent/blue-agent)

---

## This repo — Founder Console

The `blue-agent` repo is the **AI-native founder console for Base builders**. It is a workflow-first product for thinking, building, auditing, shipping, and raising on Base — powered by Virtuals inference and monetized via self-hosted x402 micropayments.

---

## Tech stack

| Layer | What it is |
|---|---|
| `apps/web` | Next.js 15 frontend + **the entire live x402 surface** — founder console UI, `AGENT_TOOLS` catalog, all tool compute, self-hosted x402 settled via the Coinbase CDP facilitator (payTo `0x0295…` — see Hard rule 6) |
| ~~`apps/api`~~ ~~`apps/portal`~~ | 🗑️ **DELETED 2026-08-18.** The Bankr x402 storefront and the `api.blueagent.dev` portal. Both dead before removal — no Vercel project, no importers, `api.blueagent.dev` 404s. Do not recreate; `git log --all -- apps/api apps/portal` has the old text. |
| ~~`packages/bankr`~~ | 🗑️ **DELETED 2026-09-18.** Was a `private: true` Bankr LLM client (`llm.bankr.bot`, `BANKR_API_KEY`) with zero importers. Bankr 403-banned 2026-07-20. Inference is Virtuals via `apps/web/src/app/api/_lib/llm.ts` — do not recreate. |
| `packages/core` | Shared schemas, command pricing, and tool input definitions |
| `packages/payments` | x402 payment helpers |
| Chains | **Base (8453)** — primary tokenized-stock venue (Coinbase B20) + every non-RH tool. **Robinhood Chain (4663)** — second live venue; the ~30 `rh-*` tools and the RWA registry are RH-specific. Never assume which; state it. |

---

## Repo structure

```
blue-agent/
├── apps/
│   ├── web/              # Next.js app + ALL live x402 tool handlers + compute
│   └── docs/             # Mintlify docs source (no package.json — not an npm workspace)
├── packages/
│   ├── core/             # Shared types, schemas, pricing, tool-input specs
│   └── payments/         # UNFINISHED STUB — private, unpublished, zero call sites
├── agents/
│   └── blue-agent/       # Agent runtime config (agent.json, tasks.json)
├── commands/             # Command contract docs (idea.md, build.md, etc.)
├── skills/               # Bundled grounding knowledge (Base addresses, standards, tools)
├── docs/                 # Product brief, roadmap, status, quickstart
├── features/             # Feature folders
└── AGENTS.md             # This file
```

---

## Bankr is fully removed — do not reintroduce any part of it

**Completed 2026-09-25.** Nothing in this repo calls, imports, credentials, or
advertises Bankr. The five `skills/aeon-*.md` files that used to be documented
here — vendored from BankrBot/skills — are deleted, along with `bankr-skills/`,
`collab/bankr-*`, the `/docs/aeon-skills` page, and `_handlers/b20-tracker.ts`.

**The measurement behind it:** `POST api.bankr.bot/token-launches/deploy` →
`403 {"error":"Account suspended","banned":true,"reasonCode":"fraud"}`
(2026-09-06, with a valid key, identical on `?chain=base` and `?chain=robinhood`),
and `GET llm.bankr.bot/v1/usage` → `403` (2026-09-18). The ban is on the
**ACCOUNT**, not one hostname, so **no key anyone could obtain for us changes
it.** One of the deleted skills, `aeon-distribute-tokens`, settled payouts
through Bankr's Wallet API — do not schedule, promise, or narrate such a payout;
reinstating it means a different transfer rail, not a new credential.

**A read carve-out was true on 09-06 and false twelve days later.** It is gone
rather than re-hedged: a carve-out earned by one measurement expires. **Measure
the specific verb before declaring either direction dead.**

🔴 **`b20-tracker` was not removed because of the ban** — its upstream is public,
keyless, and answered 200 on 2026-09-24. It went because ShunTr asked for a
clean break, and the $0.05 payment path died in the same commit as the product
it sold. `BANKR_API_KEY` has zero readers and is a dead env var.

⚠️ **The Aeon KV pipeline is a DIFFERENT THING and was not touched** —
`aeon:<skill>` keys in `api/_lib/aeon-kv.ts`, read by 15 paid x402 handlers. It
shares only a word with the deleted skill files. See the Bankr section in
`CLAUDE.md` for the full record.

---

## Hard rules

1. **Two live stock venues — Base (8453) leads, Robinhood Chain (4663) is also covered. Never assume either; state which one, every time.** Base is the primary tokenized-stock venue (Coinbase B20 — the `*c` share tokens Blue Hood polls) and all product copy is Base-first. RH Chain is a real second venue, not a fallback or a legacy shim: the ~30 `rh-*` tools and the RWA registry are RH-specific and stay that way. **A ticker can exist on BOTH chains** (NVDA / META / GOOGL currently do), so a ticker string alone never identifies a token — chain + address does. Never suggest Ethereum mainnet. An address, RPC call, or explorer link is meaningless without its chain, and RH and Base share neither.
   *(Corrected 2026-08-24: this rule previously called Base "legacy — older non-RH tools", which was true before the Base desk went live and is now wrong in the direction that matters.)*

2. **All contract addresses must be verified on the explorer for their own chain** — Basescan for Base (8453), `robinhoodchain.blockscout.com` for RH Chain (4663). The two chains share no state: an RH contract does not exist on Basescan and a Base B20 does not exist on RH's explorer, so an explorer check only counts on the token's own chain. **Never resolve a stock token by ticker string** — for a Base B20, cross-check the address against the official `base.org/stocks` table and assert it on-chain (`isB20`, `decimals == 8`, `symbol == "<TICKER>c"`); name-matching a ticker is exactly how an impostor gets in (real bug, #280). Never invent or guess a contract address. If an address is needed and not already in the codebase, flag it for the user to supply. Format: `0x…` — always full checksum address.

3. **Use Virtuals for all AI calls.** Import `callLLM` from `apps/web/src/app/api/_lib/llm.ts`. Do NOT call OpenAI, Anthropic, Bankr, or Venice directly. The endpoint is `https://compute.virtuals.io/v1`, key `process.env.VIRTUALS_API_KEY`. **Do not write new `callBankrLLM` / `callVeniceLLM` calls** — those are compatibility shims that delegate to Virtuals, kept only so ~46 legacy importers compile; their names describe providers this repo no longer uses (Bankr 403-banned 2026-07-20, Venice removed from the fallback chain 2026-07-25). `packages/bankr` was deleted 2026-09-18.

4. **No hallucinated addresses, ever.** If you don't have a verified address, say so. Do not fill in placeholders that look like real addresses.

5. **Business logic lives in packages, not in the app.** Keep `apps/web` thin. Schemas, pricing, and tool definitions belong in `packages/core`.

6. **payTo is `0x02950ad38ada1d599375bd447e080cd404809205` (Base 8453) — changed 2026-08-18.** Every off-chain payee is this wallet, the same one that receives Blue Chat credit top-ups. The old `0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f` (Bankr Club wallet) is **retired** — do not reintroduce it. Server `PAY_TO` (`api/_lib/x402-cdp.ts`) and client `PAY_TO_WALLET` (`hub/HubView.tsx`) **must change in lockstep**: the browser signs `authorization.to` against the client value, so divergence fails CDP verification on *every* Hub payment.
   ⚠️ **Two deployed contracts still pay the old wallet and cannot be redirected** — the **live** B20HUB pair: `B20HUB_HOOK`.`TREASURY()` and `B20HUB_BUYBACK`.`payoutRecipient()` (both names as exported from `lib/b20hub/constants.ts`), Base 8453, each set once in the constructor. The buyback one has **no setter by deliberate design** so a hostile owner can't redirect staker yield. Only a redeploy changes them, and redeploying the V4 hook changes its address (permission bits) and would require a new pool. Editing the `.sol` source changes nothing — the deployed bytecode is what pays. **Re-measured 2026-09-18** via `cast call` against `mainnet.base.org`: hook `0xACbBD784…d200` → `0xB058A1E3…3b5f`; buyback `0xe389AcfA…A1c9` → `0xB058A1E3…3b5f`. Both still the retired wallet.
   🔴 **This paragraph used to name `0xe3B801…0061200` and `0xBCF026…005175B4` — both SUPERSEDED deployments.** `constants.ts` labels the first one `B20HUB_HOOK_V3_BROKEN` in so many words. The *fact* was right and the *addresses* were wrong, which is the worse of the two: the exemption read as on-chain-verified while pointing at contracts that collect nothing. **Record an exception by the name the code exports, never by a bare hex literal.**

---

## The 5 core commands

Each has a contract doc in `commands/`.

| Command | What it does | Price |
|---|---|---|
| `blue idea` | Turns a rough concept into a fundable brief — problem, why now, why Base, MVP scope, risks, 24h plan | $0.05 |
| `blue build` | Architecture, stack, folder structure, files, integrations, and test plan | $0.50 |
| `blue audit` | Security and product risk review — critical issues, suggested fixes, go/no-go | $1.00 |
| `blue ship` | Deployment checklist, verification steps, release notes, monitoring plan | $0.10 |
| `blue raise` | Pitch narrative — market framing, why this wins, traction, ask, target investors | $0.20 |

Pricing is defined in `packages/core/src/schemas.ts` → `BLUE_AGENT_PRICING`.

---

## Commit convention

```
feat:     new feature
fix:      bug fix
skill:    new skill or grounding file added
cmd:      changes to a command contract (commands/*.md)
docs:     documentation only
refactor: code restructure, no behavior change
chore:    tooling, deps, config
```

---

## Branch policy

**Commit and push straight to `main`, behind the local gate** (`npx tsc --noEmit && npm test &&
npm run verify:build`, from `apps/web/`). Changed 2026-09-24: `main` has no branch protection and no
rulesets, so nothing server-side enforces this — the gate is local discipline, and skipping it means
production finds the bug.

**Branch + PR is optional, not forbidden.** Use it when you want a Vercel preview URL before the change
is live, or on anything touching payments, wallet/credit metering, or on-chain writes.

**`dev` is retired (2026-09-05) — do not branch from it or re-create it**; see
Git discipline in `CLAUDE.md` for the two measured reasons (61-file drift, and `dev` silently lacking
the CI workflow so `verify` never ran on any `dev` commit).

---

## Build & deploy workflow

**Build locally first, then deploy.** Pushing to `main` auto-deploys to production, so the
local gate is the only thing between a bad diff and a live site. It also catches errors
before they burn a Vercel deploy slot — the free plan caps at **100 deployments/day**, and
a failed build wastes one.

Pipeline for every change, in order:

```
1. Edit code
2. cd apps/web
3. npx tsc --noEmit && npm test && npm run verify:build     # the gate — all three, in one go
4. Manual runtime test at localhost                         # logic/UX bugs a build can't catch
5. Only when 3–4 PASS → git pull && git commit && git push origin main
```

Notes:
- **Step 3 is the whole policy.** `tsc --noEmit` + `npm test` is exactly what CI's `verify`
  job runs; `verify:build` is the part CI deliberately skips (the workflow header explains
  that the Vercel preview already builds every PR). Green locally means the CI run that
  fires on your push is a formality.
- **`npm run verify:build`, never `npm run build`.** verify:build sets
  `NEXT_DIST_DIR=.next-verify`, so a running `next dev` keeps its own `.next/`. Plain
  `next build` shares `.next/` with the dev server and corrupts it into a
  fullscreen-logomark page (seen 4 times).
- `tsc --noEmit` only catches **types**. `next build` additionally catches
  **ESLint errors, prerender failures, and server/client boundary mistakes** —
  exactly the class of error that makes a Vercel build fail.
- `npm test` discovers every `scripts/*-test.ts` and `*-check.ts` by opt-out, including the
  truth-checks pinning doc counts, link liveness and the skill catalog. Do not skip them
  because "it's only a docs change" — those are precisely the drift they exist to catch.
- Step 4 is **mandatory** for sensitive changes (wallet, payments, on-chain,
  credit metering) — those break at **runtime**, not build time. A clean build
  is necessary but not sufficient. These are also the changes still worth a branch + PR,
  for the preview URL.
- **Do not** create empty `chore: trigger production redeploy` commits — they burn deploy
  slots. If `main` doesn't auto-deploy, the cause is almost always the daily cap, not
  the GitHub integration.

**Deploy target:** production is the Vercel project **`blueagent-web-new`**
(`blueagent.dev`). Never deploy to or recreate the `blue-agent` project.
