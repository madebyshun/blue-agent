---
name: blueagent
emoji: 🔵
description: >
  AI agent on Base with 21 pay-per-use tools for Data, Security, Research, and Earn.
  Trigger when user asks about token analysis, wallet PnL, risk checks, honeypot
  detection, airdrops, yield, VC tracking, or anything related to Base ecosystem.
  Each tool costs a small amount of USDC — no subscription needed.
mcp:
  command: npx
  args: ["-y", "@blueagent/skill"]
  env:
    BANKR_API_KEY: "${BANKR_API_KEY}"
homepage: https://t.me/BlueAgentBot
payment: x402 · USDC on Base
---

# BlueAgent Skill

BlueAgent provides 21 pay-per-use AI services on Base. Each call costs a small amount of USDC — no subscription needed.

## When to use this skill

| User says... | Use tool |
|---|---|
| "analyze this token / is this legit?" | `analyze` |
| "check my wallet PnL / how am I trading?" | `pnl` |
| "is this a honeypot / rug?" | `honeypot-check` |
| "is this safe to sign / approve?" | `riskcheck` |
| "what airdrops am I eligible for?" | `airdrop-check` |
| "best yield for my USDC?" | `yield-optimizer` |
| "summarize this whitepaper" | `whitepaper-tldr` |
| "help me launch a token" | `advisor` |
| "apply for Base grant" | `grant` |
| "check whale activity" | `whale-tracker` |

## How to call services

Use the Bankr CLI. Format:

```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/{endpoint}" \
  -X POST \
  -d '{JSON body}' \
  -y --max-payment {price x2} --raw
```

## Services

### DATA

**pnl** · $1.00 · endpoint: `wallet-pnl`
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/wallet-pnl" \
  -X POST -d '{"address":"0xWALLET","chain":"base"}' -y --max-payment 3 --raw
```

**whale-tracker** · $0.10 · endpoint: `whale-tracker`
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/whale-tracker" \
  -X POST -d '{"address":"0xTOKEN_OR_WALLET","chain":"base"}' -y --max-payment 1 --raw
```

**dex-flow** · $0.15 · endpoint: `dex-flow`
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/dex-flow" \
  -X POST -d '{"token":"TOKEN_ADDRESS","chain":"base"}' -y --max-payment 1 --raw
```

**unlock-alert** · $0.20 · endpoint: `unlock-alert`
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/unlock-alert" \
  -X POST -d '{"token":"TOKEN_NAME_OR_ADDRESS"}' -y --max-payment 1 --raw
```

---

### SECURITY

**riskcheck** · $0.05 · endpoint: `risk-gate`
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/risk-gate" \
  -X POST -d '{"action":"DESCRIBE_THE_ACTION"}' -y --max-payment 1 --raw
# Returns: { "decision": "APPROVE" | "WARN" | "BLOCK", "riskScore": 0-100 }
```

**honeypot-check** · $0.05 · endpoint: `honeypot-check`
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/honeypot-check" \
  -X POST -d '{"token":"0xTOKEN_ADDRESS","chain":"base"}' -y --max-payment 1 --raw
```

**phishing-scan** · $0.10 · endpoint: `phishing-scan`
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/phishing-scan" \
  -X POST -d '{"target":"URL_OR_ADDRESS_OR_HANDLE"}' -y --max-payment 1 --raw
```

**aml-screen** · $0.25 · endpoint: `aml-screen`
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/aml-screen" \
  -X POST -d '{"address":"0xWALLET","chain":"base"}' -y --max-payment 1 --raw
```

**mev-shield** · $0.30 · endpoint: `mev-shield`
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/mev-shield" \
  -X POST -d '{"action":"swap 10 ETH to USDC on Uniswap","chain":"base"}' -y --max-payment 1 --raw
```

**quantum** · $1.50 · endpoint: `quantum-premium`
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/quantum-premium" \
  -X POST -d '{"address":"0xWALLET","chain":"base","tier":"standard"}' -y --max-payment 4 --raw
# tiers: lite ($0.10) | standard ($1.50) | shield ($0.25) | timeline ($2.00) | batch ($2.50) | contract ($5.00)
```

---

### RESEARCH

**analyze** · $0.35 · endpoint: `deep-analysis`
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/deep-analysis" \
  -X POST -d '{"projectName":"$TOKEN_OR_ADDRESS"}' -y --max-payment 1 --raw
# Returns: overallScore, riskScore, recommendation, keyRisks, keyStrengths
```

**whitepaper-tldr** · $0.20 · endpoint: `whitepaper-tldr`
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/whitepaper-tldr" \
  -X POST -d '{"url":"https://docs.example.com","projectName":"ProjectName"}' -y --max-payment 1 --raw
```

**tokenomics-score** · $0.50 · endpoint: `tokenomics-score`
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/tokenomics-score" \
  -X POST -d '{"token":"TOKEN_NAME_OR_ADDRESS"}' -y --max-payment 2 --raw
```

**narrative-pulse** · $0.40 · endpoint: `narrative-pulse`
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/narrative-pulse" \
  -X POST -d '{"query":"AI agents on Base"}' -y --max-payment 1 --raw
```

**vc-tracker** · $1.00 · endpoint: `vc-tracker`
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/vc-tracker" \
  -X POST -d '{"query":"a16z crypto portfolio 2025"}' -y --max-payment 3 --raw
```

**advisor** · $3.00 · endpoint: `launch-advisor`
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/launch-advisor" \
  -X POST -d '{"description":"NFT marketplace for Base builders","projectName":"MyProject"}' -y --max-payment 7 --raw
```

**grant** · $5.00 · endpoint: `grant-evaluator`
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/grant-evaluator" \
  -X POST -d '{"description":"PROJECT_DESCRIPTION","projectName":"MyProject"}' -y --max-payment 11 --raw
# Returns: overallScore, suggestedGrantSize, strengths, concerns
```

---

### EARN

**airdrop-check** · $0.10 · endpoint: `airdrop-check`
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/airdrop-check" \
  -X POST -d '{"address":"0xWALLET","chain":"base"}' -y --max-payment 1 --raw
```

**yield-optimizer** · $0.15 · endpoint: `yield-optimizer`
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/yield-optimizer" \
  -X POST -d '{"token":"USDC","chain":"base"}' -y --max-payment 1 --raw
```

**lp-analyzer** · $0.30 · endpoint: `lp-analyzer`
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/lp-analyzer" \
  -X POST -d '{"address":"0xWALLET","pool":"ETH/USDC","chain":"base"}' -y --max-payment 1 --raw
```

**tax-report** · $2.00 · endpoint: `tax-report`
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/tax-report" \
  -X POST -d '{"address":"0xWALLET","year":"2025","chain":"base"}' -y --max-payment 5 --raw
```

---

## Rules

- Always run `riskcheck` before any transaction user wants to sign
- Always run `honeypot-check` before user buys an unknown token
- Replace placeholders: `0xWALLET`, `TOKEN_ADDRESS`, `DESCRIBE_THE_ACTION` with real values from context
- `--max-payment` = price × 2 (safety buffer, only actual price is charged)
- Parse JSON from stdout — field `response` contains the result
