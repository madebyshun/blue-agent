---
description: Run Blue Agent — idea, build, audit, ship, raise, or Hub tools for Base builders
argument-hint: [idea|build|audit|ship|raise|hub] [prompt]
---

Run the following through Blue Agent: $ARGUMENTS

**Before calling any MCP tool, load the matching skill for precise context.**

1. Identify the operation and load the skill:

   **Console commands:**
   - Concept → brief, why now, MVP: `blue-idea`
   - Architecture, stack, folder structure: `blue-build`
   - Security review, audit, go/no-go: `blue-audit`
   - Deployment, checklist, monitoring: `blue-ship`
   - Pitch, fundraising, investor memo: `blue-raise`

   **Hub — market intelligence:**
   - Token pick, what to buy: `hub-token-pick`
   - Narratives, trending, CT mindshare: `hub-narrative`
   - Whale signals, copy-trade: `hub-whale-signal`
   - Token DD, on-chain analysis: `hub-deep-analysis`
   - Base ecosystem digest: `hub-ecosystem`

   **Hub — security:**
   - Honeypot check: `hub-honeypot`
   - Pre-tx safety screen: `hub-risk-gate`

   **Hub — builder & fundraising:**
   - Market fit, timing, competition: `hub-market-fit`
   - Competitor scan: `hub-competitor-scan`
   - Investor memo: `hub-investor-memo`
   - Fundraise timing: `hub-fundraise-timing`
   - Base grants: `hub-base-grant`
   - Builder Score: `hub-builder-score`
   - Repo health: `hub-repo-health`

   **Utility:**
   - Scaffold project: `blue-new`

2. Call the MCP tool with the user's prompt or inputs
3. Present the result

If no argument provided, ask the user what they want to build or analyze on Base.
