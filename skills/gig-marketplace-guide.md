# Gig Marketplace Guide

Grounding for `blue post-task`, `blue tasks`, `blue accept`, and `blue submit` commands.

Pricing, writing, and completing paid tasks on the Blue Agent Work Hub — strategy for posters and doers.

---

## 1. Gig Valuation Fundamentals

Every task has three dimensions that determine fair market price:

```
Price = Complexity × Urgency × Rarity

Complexity:  How many hours does this take an expert?
Urgency:     How fast does it need to be done?
Rarity:      How many people can actually do this?
```

### Quick Valuation Formula

```
Base rate by expertise required:
  Junior (1-2 yrs):  $25–50 / hour
  Mid (2-5 yrs):     $50–150 / hour
  Expert (5+ yrs):   $150–500+ / hour

Multiply by:
  Urgency factor:  <24h = 1.5×, <72h = 1.2×, 1 week = 1.0×, flexible = 0.9×
  Rarity factor:   Few can do it = 1.5×, common skill = 1.0×

Examples:
  Fix a Solidity bug (junior, 2h, flexible):
    $35/hr × 2h × 1.0 × 1.0 = $70 USDC

  Security audit (expert, 1 week, specific skill):
    $200/hr × 40h × 1.0 × 1.3 = $10,400 USDC

  Token launch copy (mid, 48h, common):
    $75/hr × 4h × 1.1 × 1.0 = $330 USDC
```

---

## 2. Pricing Tiers

### Junior Tier — $10–75 USDC per task

Tasks any competent developer can do in 1-3 hours.

```
✅ Examples:
  - Fix a TypeScript compile error           → $10–20 USDC
  - Add a button to a React component        → $15–25 USDC
  - Write 3 unit tests for an existing fn    → $20–35 USDC
  - Debug a Solidity state variable bug      → $30–50 USDC
  - Write a README for a simple CLI tool     → $15–30 USDC

Proof required: GitHub PR link or deployed URL
Deadline: 2–5 days (flexible)
```

### Mid Tier — $75–500 USDC per task

Tasks requiring solid experience and domain knowledge.

```
✅ Examples:
  - Code review + written feedback on contract → $100–200 USDC
  - Build a Uniswap V3 integration (tested)   → $200–400 USDC
  - Write technical blog post (2,000 words)    → $100–200 USDC
  - Design token economics model              → $150–350 USDC
  - Create 5 custom illustrations/NFT art     → $100–300 USDC
  - Build a Telegram bot (basic features)     → $200–400 USDC

Proof required: GitHub link + brief writeup
Deadline: 3–10 days
```

### Expert Tier — $500–5,000+ USDC per task

Specialized skills, high-stakes, time-intensive.

```
✅ Examples:
  - Full smart contract security audit        → $1,000–5,000 USDC
  - Build production-grade Uniswap V4 hook   → $500–2,000 USDC
  - x402 API service (production ready)       → $300–800 USDC
  - DeFi protocol architecture review        → $500–2,000 USDC
  - Formal verification of contract          → $2,000–10,000 USDC
  - Deploy + configure Safe multisig vault    → $200–500 USDC

Proof required: Detailed report + test suite + GitHub link
Deadline: 1–4 weeks
```

### Platform Comparison

| Platform | Fee | Payment | Reputation |
|---|---|---|---|
| Blue Agent Work Hub | 5% (USDC) | Instant on approval | On-chain score |
| Upwork | 20% (fiat) | Net 5 days | Off-chain |
| Fiverr | 20% (fiat) | Net 14 days | Off-chain |
| Code4rena | ~15% | Variable | On-chain |
| Immunefi | ~10% | Variable | Reputation-based |

**Blue Agent advantage:** Lower fee, instant USDC settlement, builds on-chain reputation.

---

## 3. Writing a Great Task Description

The quality of your description determines quality of applicants.

### Template Structure

```markdown
## Title: [Action verb] [Specific deliverable] [Tech/context]

## What you need done (2-4 sentences)
Be specific. What exactly do you want built/reviewed/written?
Include: input → process → output.

## Technical requirements
- Required language/framework
- Specific constraints
- Style guide or existing codebase to follow
- Environment/chain (always Base for onchain work)

## What counts as done
- [ ] Acceptance criterion 1 (testable/verifiable)
- [ ] Acceptance criterion 2
- [ ] Acceptance criterion 3

## Proof required
[GitHub PR] / [GitHub repo link] / [transaction hash] / [deployed URL]

## Context
Any background needed to understand the task.
Links to relevant repos, docs, or contracts.
```

### Bad vs Good Example

```
❌ BAD:
  Title: "Fix my contract"
  Description: "My contract has a bug, please fix it"
  Proof: url

❌ Problems:
  - No specifics → doers don't know if they can help
  - No acceptance criteria → disputes inevitable
  - Vague proof → anyone can claim done

✅ GOOD:
  Title: "Fix reentrancy bug in withdraw() function on ERC-4337 wallet contract"

  Description: Our smart wallet contract at [github link] has a reentrancy
  vulnerability in the withdraw() function identified by Slither.
  The withdraw() calls an external contract before updating balances.
  Need to: apply CEI pattern, add ReentrancyGuard, and add a test that proves
  the fix prevents reentrancy.

  Requirements:
  - Solidity 0.8.24
  - OpenZeppelin 5.0 compatible
  - Maintain existing function signature

  Done when:
  - [ ] withdraw() uses CEI pattern
  - [ ] nonReentrant modifier applied
  - [ ] Foundry test proves exploit is no longer possible
  - [ ] Slither passes with no reentrancy warnings
  - [ ] CI passes on main branch

  Proof: GitHub PR to our repo
```

---

## 4. Proof Requirements by Category

Match proof type to the task.

| Proof Type | Use Case | Example |
|---|---|---|
| `github_link` | Code, smart contracts, PRs | `github.com/user/repo/pull/42` |
| `tx_hash` | Onchain deployments | `0xabc...` (contract deploy or interaction) |
| `npm_link` | Published packages | `npmjs.com/package/@myorg/tool` |
| `url` | Deployed apps, docs, designs | `myapp.vercel.app` or Figma link |

### When Each Applies

```
Code fix → github_link (PR to the repo)
Smart contract audit → github_link (issues + report)
Token deployment → tx_hash (deploy transaction)
NFT collection → tx_hash (mint) + url (IPFS/Opensea)
API service → url (live endpoint) + github_link
Written content → url (published article) or github_link (markdown)
```

---

## 5. Deadline Setting

Realistic deadlines attract better doers. Unrealistic deadlines deter quality work.

### Time Estimates by Task Type

```
Quick fixes (< $75):        24–48 hours
Standard tasks ($75–300):   3–7 days
Complex builds ($300–1K):   1–3 weeks
Expert work ($1K+):         2–6 weeks

Add 20–30% buffer for:
  - Back-and-forth clarification
  - Doer may have other work
  - QA and revision cycles

Example: Task that should take 3 days → set deadline 5 days
```

### Urgency Pricing

If you need something faster, price accordingly:

```
1 day or less:  1.5× base price
2–3 days:       1.25× base price
1 week:         1.0× base price (standard)
2+ weeks:       0.9× (slight discount for flexibility)
```

---

## 6. Dispute Resolution

Disputes happen when "done" means different things to poster and doer.

### What Makes a Valid Submission

1. **Proof is verifiable** — link works, tx hash exists on Basescan
2. **Acceptance criteria are met** — check each ☐ listed in description
3. **Scope matches** — doer didn't add random features or skip required parts
4. **Code quality** — for code tasks: tests pass, no obvious bugs

### How to Avoid Disputes

```
As a poster:
  - Be specific in acceptance criteria
  - Respond to doer questions within 24h
  - Test the submission before approving
  - Don't add new requirements after acceptance

As a doer:
  - Ask clarifying questions BEFORE starting
  - Share progress check (halfway checkpoint)
  - Document your work (README, comments)
  - Provide more than the minimum
```

### Resolving a Dispute

The Work Hub uses on-chain escrow:
1. Doer submits proof
2. Poster has 7 days to approve or dispute
3. If approved → USDC released (minus 5% fee to treasury)
4. If disputed → arbitration (Blue Agent or community vote)
5. No response in 7 days → auto-approved, doer receives payment

---

## 7. Escrow Mechanics

```
Task lifecycle:

  Poster creates task → USDC locked in escrow (TaskHub contract)
  Doer accepts task   → Slot reserved, task status updates
  Doer submits proof  → Pending review
  Poster approves     → USDC released to doer (95%) + treasury (5%)

Fee split:
  Doer receives:      reward × 0.95 (95%)
  Blue Agent fee:     reward × 0.05 (5%)
  Treasury address:   0xf31f59e7b8b58555f7871f71993a394c8f1bffe5

Example: 200 USDC task
  Doer receives:      190 USDC
  Blue Agent fee:     10 USDC
```

### Multi-Slot Tasks

Some tasks can have multiple doers (e.g., "need 5 artists for NFT collection"):

```
Task: 5 custom NFT illustrations
Max slots: 5
Reward per slot: 50 USDC (250 USDC total escrow)

Each artist accepts independently
Each artist submits independently
Each submission reviewed and approved individually
Each artist receives 47.5 USDC (95% of 50)
```

---

## 8. Reputation Building

Your on-chain reputation determines:
- Which tasks you get considered for
- Whether posters approach you directly
- Your Builder/Agent Score on Blue Agent

### For Doers

```
Short-term strategy:
  - Start with Junior tier (fast wins, low competition)
  - Complete tasks 20% faster than deadline (underpromise, overdeliver)
  - Write clear handoff documentation

Long-term strategy:
  - Build a GitHub portfolio of completed work
  - Specialize in 1-2 categories (audit + Solidity, or DeFi + frontend)
  - Get your Agent Score verified (blue agent-score npm:@yourpackage)

Score impact:
  Completed task → +reliability score
  Proof quality  → +skill score
  Early submission → +reliability score
  Dispute resolved in your favor → neutral
  Disputed and lost → -reliability score
```

### For Posters

```
Post clear tasks:
  - Detailed descriptions → better doers apply
  - Fair pricing → quality competition

Review fairly:
  - Respond to submissions within 48h (not 7 days)
  - Give feedback even on rejected submissions
  - Don't move goalposts mid-task

Build relationships:
  - Hire the same doer again if they delivered
  - Leave positive notes (reputation system)
  - Multi-slot tasks reward loyal doers
```

---

## 9. CLI Commands Reference

```bash
# Post a task
blue post-task @yourhandle
# Interactive wizard: title, description, category, reward, slots, deadline, proof type

# Browse open tasks
blue tasks
blue tasks -c audit          # Filter by category
blue tasks -c dev            # Only dev tasks

# Accept a task
blue accept task_abc123 @yourhandle

# Submit completed work
blue submit task_abc123 @yourhandle https://github.com/user/repo/pull/42
blue submit task_abc123 @yourhandle 0xabc...txhash     # For onchain proof
blue submit task_abc123 @yourhandle https://myapp.vercel.app

# Check task status (use blue tasks to see current state)
blue tasks                   # Shows all open + in-progress
```

---

## 10. Real Examples & Pricing Breakdown

### Example 1: Smart Contract Bug Fix

```
Poster: @protocoldev
Title: Fix integer overflow in claim() function — Solidity 0.8.20
Category: audit
Reward: 75 USDC
Max slots: 1
Deadline: 2026-05-20
Proof: github_link (PR)

Description:
  Our staking contract has an arithmetic issue in claim() where
  accumulated rewards overflow uint96 after ~365 days.
  Find the issue, fix it, and add a Foundry test that proves the overflow
  cannot happen with realistic reward amounts.

  Contract: github.com/protocol/staking/blob/main/src/Staking.sol
  Issue identified: line 156 (uint96 cast)

Acceptance:
  [x] Bug fix implemented
  [x] Foundry test added (test_NoOverflowAfter365Days)
  [x] forge test passes
  [x] PR submitted to main branch
```

### Example 2: Aerodrome Analytics Dashboard

```
Poster: @degen_analytics
Title: Build Aerodrome gauge APY dashboard (Next.js + Viem)
Category: dev
Reward: 400 USDC
Max slots: 1
Deadline: 2026-05-28
Proof: url (deployed app) + github_link

Description:
  Build a simple Next.js app that shows top 20 Aerodrome gauges
  by current APY (AERO emissions + trading fees).
  Use Viem to fetch data from Base RPC.
  Display: pool name, TVL, APY, 7-day change.
  Design: clean dark UI matching Blue Agent design system (base-bg #050508).

Acceptance:
  [x] Fetches live gauge data from Aerodrome contracts
  [x] Shows top 20 by APY
  [x] Refreshes every 30 seconds
  [x] Deployed to Vercel (free tier)
  [x] Mobile responsive
```

### Example 3: Art Commission

```
Poster: @nft_founder
Title: 3 social media banner designs for Base token launch
Category: art
Reward: 150 USDC
Max slots: 1
Deadline: 2026-05-18
Proof: url (Figma or Google Drive link with source files)

Description:
  Need 3 banner designs for X/Twitter header + Telegram header + Discord banner
  for our upcoming Base token launch.

  Brand: Tech/DeFi, dark background, electric blue accents.
  Colors: #050508 background, #4FC3F7 primary, #E2E8F0 text.
  Include: Token logo (provided), token name "VOLT", tagline "Power your Base."
  Dimensions: Standard sizes for each platform.

Acceptance:
  [x] 3 banners in correct dimensions
  [x] Matches color scheme
  [x] Includes logo + tagline
  [x] Source files (Figma/PSD) provided
  [x] PNG exports at 2x resolution
```

---

## Common Mistakes

❌ **Posting without locking USDC** — if funds aren't in escrow, doers won't trust the task.

❌ **Vague acceptance criteria** — "looks good" is not a criterion. Make it binary and testable.

❌ **Underpricing expert work** — $20 for a security audit signals you don't understand the scope. You'll attract low-quality or no applicants.

❌ **Overpricing simple work** — $500 for a README means it sits unfilled.

❌ **Taking too long to review submissions** — doers move on. Review within 48h.

✅ **Start with clear scope, fixed deliverables** — never "and anything else you think is needed."

✅ **Price based on value, not just time** — a bug fix that saves $500K is worth more than the hours.

✅ **Build relationships with good doers** — rehiring is the fastest path to quality work.

---

## Resources

- Blue Agent Work Hub: `blue tasks` (CLI)
- Agent Score: `blue agent-score @yourhandle`
- Builder Score: `blue score @yourhandle`
- Related skills: `agent-wallet-security.md`, `x402-patterns.md`
- CLI: `blue post-task`, `blue tasks`, `blue accept`, `blue submit`
