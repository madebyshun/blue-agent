# Blue Agent × Aeon Bridge

This document defines how Blue Agent and Aeon can collaborate cleanly.

## 1) One-page collaboration architecture

### Roles

- **Blue Agent** = Base-native build / launch / audit / raise layer
- **Aeon** = autonomous ops / monitoring / digest / self-healing layer

### Shared loop

1. Blue Agent ships skills, templates, command contracts, and launch notes.
2. Aeon watches the repo on a schedule.
3. Aeon summarizes changes, detects regressions, and flags stale docs or broken flows.
4. Blue Agent uses that feedback to patch skills, improve templates, or update launch materials.
5. The loop repeats.

### Division of responsibilities

**Blue Agent owns**
- Base-native grounding
- x402 payment patterns
- builder / agent scoring
- launch and market workflows
- repo artifacts and docs

**Aeon owns**
- scheduled digests
- recurring monitoring
- output scoring
- skill freshness checks
- alerting and follow-up

### Best shared outputs

- daily / weekly digests
- skill health reports
- launch readiness checks
- repo change summaries
- Base ecosystem monitoring
- notification briefs for Telegram / Discord / Slack

### Recommended integration shape

```text
blue-agent repo
├── skills/          → source of truth for grounding
├── templates/       → source of truth for scaffolds
├── commands/        → source of truth for CLI contracts
├── docs/            → roadmap, launch notes, issue packs
└── collab/          → bridge files, digest outputs, evals

Aeon
├── scheduled repo watch
├── digest generation
├── skill health scoring
├── regression alerts
└── notification delivery
```

### What not to do

- Do not make Aeon own product decisions.
- Do not make Blue Agent run unattended as if it were a scheduler.
- Do not mix interactive build workflows with background monitoring.
- Do not expose secrets between repos.

---

## 2) File format for Aeon to read the Blue Agent repo

Use a machine-readable bridge file so Aeon can ingest Blue Agent without guessing.

### Suggested file

`collab/aeon-blue-agent.yml`

### Recommended schema

```yaml
version: 1
source:
  repo: madebyshun/blue-agent
  branch: main
  root: .

include:
  - skills/**/*.md
  - templates/**/README.md
  - commands/**/*.md
  - docs/product-brief.md
  - docs/roadmap.md
  - docs/command-map.md
  - docs/issue-packs.md
  - collab/**/*.md

exclude:
  - node_modules/**
  - .next/**
  - dist/**
  - build/**
  - coverage/**
  - .env*
  - .claude/**

watch:
  schedule: "0 7 * * *"
  triggers:
    - path: skills/**/*.md
      on_change: skill_digest
    - path: templates/**/README.md
      on_change: template_digest
    - path: commands/**/*.md
      on_change: command_contract_digest
    - path: docs/roadmap.md
      on_change: roadmap_digest
    - path: collab/**/*.md
      on_change: collab_digest

outputs:
  digest_dir: collab/aeon-output/
  health_dir: collab/aeon-health/
  alert_channel: telegram
  alert_target: blueagent_hub

rules:
  - base_only
  - no_hallucinated_addresses
  - no_secret_propagation
  - prefer_small_shippable_changes
  - alert_only_when_actionable
```

### Optional run notes

If you want Aeon to generate useful outputs, add a companion prompt file:

`collab/aeon-blue-agent.prompt.md`

Example prompt:

```md
Monitor Blue Agent repo changes.
Summarize what changed.
Flag broken skill docs, missing examples, stale launch notes, and template regressions.
Only alert if there is a concrete action item.
```

---

## 3) Five Blue Agent skills to export to Aeon first

These are the highest-leverage skills to move over first.

### 1. `base-ecosystem.md`
**Why first:** Gives Aeon Base-native grounding so every digest and recommendation stays aligned with the ecosystem. 
**Use in Aeon:** Base watchlists, ecosystem summaries, launch context.
**Output value:** Better Base-specific reasoning, fewer generic agent takes.

### 2. `x402-patterns.md`
**Why first:** Aeon should understand paid workflows if it is monitoring or triggering anything around commands and services.
**Use in Aeon:** payment-aware digests, paid service checks, retry/failure notes.
**Output value:** Clearer handling of micropayment-enabled flows.

### 3. `agent-wallet-security.md`
**Why first:** Autonomous systems need strong signing and wallet guardrails.
**Use in Aeon:** secret handling, signing rules, transaction safety checks.
**Output value:** Safer ops layer with fewer risky suggestions.

### 4. `wallet-guardrails.md`
**Why first:** Aeon may eventually trigger or monitor wallet-related automation; it needs limits and approval rules.
**Use in Aeon:** spend caps, risk flags, allowlists, approval gates.
**Output value:** Prevents unsafe automation from drifting into execution.

### 5. `reputation-scoring.md`
**Why first:** Aeon can score outputs, monitor regressions, and track trust signals.
**Use in Aeon:** skill health scoring, weekly scorecards, regression detection.
**Output value:** Adds a quality loop instead of just a status loop.

### Optional sixth
- `telegram-bot-patterns.md` — if you want Aeon to post actionable briefs into Telegram cleanly.

---

## Suggested rollout order

1. Add `collab/aeon-blue-agent.yml`
2. Add `collab/aeon-blue-agent.prompt.md`
3. Export the five skills above
4. Add digest output examples in `collab/aeon-output/`
5. Wire a weekly review loop
6. Expand to template and command-contract monitoring

---

## Success criteria

You know the bridge is working when:
- Aeon summarizes Blue Agent changes without hallucinating details
- skill freshness issues are caught early
- launch notes stay consistent across repos
- Base-specific quality improves over time
- alerts are actionable instead of noisy
