# Blue Agent Backlog

This backlog breaks the roadmap into buildable issues. Each issue should be small enough to finish in one focused Claude pass.

## How to use this backlog
- Pick one pack at a time.
- Keep each issue scoped to 1–3 files.
- Prefer grounded, Base-only content.
- Do not mix skills, templates, and CLI changes in the same issue unless they are tightly coupled.

---

## Pack 1 — Foundation

Goal: expand grounding and template coverage so the repo has stronger Base-native foundations.

### Skills
1. **base-ecosystem.md**
   - Cover: Aerodrome, Uniswap V4, Base Name, Friend.tech-style social primitives, Base-native app patterns.
   - Done when: file exists, Base-only, practical examples, matches the style of existing skills.

2. **x402-patterns.md**
   - Cover: x402 request flow, payment headers, nonce/validBefore patterns, USDC usage, pay-per-use design.
   - Done when: includes implementation guidance and safety notes.

3. **base-4337-aa.md**
   - Cover: ERC-4337, paymasters, session keys, smart account flows, gas sponsorship.
   - Done when: can ground wallet/account-abstraction related build prompts.

4. **uniswap-v4-hooks.md**
   - Cover: hooks, PoolManager, swap lifecycle, liquidity management, common risks.
   - Done when: useful for both build and audit prompts.

5. **agent-wallet-security.md**
   - Cover: wallet custody, approvals, key hygiene, transaction safety, treasury practices.
   - Done when: can support safe onchain action planning.

6. **yield-strategies.md**
   - Cover: LSTs, stablecoin yield, RWA yield, risk tiers, capital efficiency.
   - Done when: includes Base-relevant DeFi examples.

7. **frontend-base.md**
   - Cover: Next.js, viem, wagmi, Frame SDK, wallet UX patterns, Base frontend conventions.
   - Done when: helps build web app surfaces and miniapps.

8. **base-bridge-risks.md**
   - Cover: bridge trust assumptions, chain mismatch, liquidity, reorg/finality considerations.
   - Done when: gives clear warning patterns and mitigation checks.

9. **reputation-scoring.md**
   - Cover: Blue Score, builder score, agent score, score card logic, onchain/offchain split.
   - Done when: grounds product and API design for scoring.

10. **template-guidelines.md**
    - Cover: how to structure templates, what every template must include, naming conventions.
    - Done when: becomes the canonical reference for template creation.

### Templates
11. **base-hardhat-agent**
    - Focus: agent starter with contracts + scripts + tests.

12. **base-telegram-bot**
    - Focus: Telegram bot starter for Base communities.

13. **base-frame-miniapp**
    - Focus: lightweight frame/miniapp starter with wallet actions.

14. **base-erc20-wizard**
    - Focus: token creation wizard, launch flow, metadata, deployment checks.

15. **base-uniswap-hook**
    - Focus: Uniswap V4 hook scaffold with tests and deployment notes.

16. **base-4337-agent**
    - Focus: smart-account agent starter with paymaster/session-key patterns.

---

## Pack 2 — CLI

Goal: make the CLI feel broad, discoverable, and useful for daily builder work.

### Commands to add or deepen
1. **blue chat**
   - Streaming chat command with model selection.
   - Done when: CLI can start a real chat session, not just print a placeholder.

2. **blue market**
   - Browse skills, templates, and agents.
   - Done when: discovery flow exists and items are categorized.

3. **blue history**
   - Show usage history, recent commands, and costs.
   - Done when: output is readable and tied to stored usage data.

4. **blue validate**
   - Validate repo/package/template structure.
   - Done when: checks common issues and prints actionable output.

5. **blue review**
   - Run a review pass on prompts, templates, or repo status.
   - Done when: produces a useful summary with next steps.

6. **blue debug**
   - Diagnose environment/setup problems.
   - Done when: can inspect common failure points.

7. **blue deploy**
   - Deploy helper for web/api/package targets.
   - Done when: gives a safe deployment path and checks prerequisites.

8. **blue install**
   - Install skills/templates into local workspace.
   - Done when: can materialize selected assets locally.

9. **blue skills list**
   - List available skills.

10. **blue templates list**
    - List available templates.

### CLI quality bar
- Help output should be clean.
- Commands should be Base-aware and grounded.
- Reuse shared package logic instead of duplicating business logic in the CLI.
- Prefer safe fallbacks over silent failure.

---

## Pack 3 — Core Product

Goal: turn Blue Agent into a real product loop with chat, payments, history, and market surfaces.

### Product issues
1. **Chat streaming**
   - Extend the web chat page and/or CLI chat flow to support streaming responses.
   - Done when: first usable chat experience is real.

2. **x402 payments**
   - Wire pay-per-use into chat and tool usage.
   - Done when: user actions can be metered and charged.

3. **Usage history**
   - Persist command/chat/tool usage with timestamp and cost.
   - Done when: history can be shown in CLI or web.

4. **/market**
   - Add a marketplace for skills, templates, and agents.
   - Done when: browse + install + publish path is clear.

5. **Blue Score onchain**
   - Make the score discoverable onchain or mintable as a card.
   - Done when: offchain score connects cleanly to onchain presentation.

6. **One-command setup**
   - Add a shell installer and docs.
   - Done when: fresh setup is simple and repeatable.

7. **Docs and launch kit**
   - Setup guide, quickstart, examples, and release notes.
   - Done when: someone new can understand the repo in one sitting.

---

## Suggested execution order

### Sprint 1
- base-ecosystem
- x402-patterns
- base-4337-aa
- uniswap-v4-hooks
- base-hardhat-agent
- base-telegram-bot

### Sprint 2
- frontend-base
- agent-wallet-security
- base-bridge-risks
- reputation-scoring
- template-guidelines
- base-erc20-wizard
- base-frame-miniapp

### Sprint 3
- blue chat
- blue history
- blue market
- blue validate
- blue review
- blue debug
- x402 payments

### Sprint 4
- /market UI and install flow
- Blue Score onchain flow
- one-command setup
- docs and launch kit

---

## Claude handoff format

When handing an issue to Claude, use:

- **Goal:** what should be built
- **Files:** exact files to touch
- **Acceptance:** what must be true when done
- **Constraints:** Base-only, grounded, minimal refactor, no unrelated scope

Example:

**Goal:** Add `base-ecosystem.md` skill.
**Files:** `packages/builder/skills/base-ecosystem.md`, `packages/core/src/registry.ts` if needed.
**Acceptance:** file exists, style matches existing skills, repo still builds.
**Constraints:** Base-only, practical, no fluff.
