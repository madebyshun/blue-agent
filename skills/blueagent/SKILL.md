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

# BlueAgent — AI-Powered DeFi Intelligence on Base

BlueAgent provides 21 pay-per-use AI services on Base. Each call costs a small amount of USDC via x402 — no subscription, no API keys, just pay per call.

## Quick Start

**Prerequisites:**
- Bankr CLI installed: `npm install -g @bankr/cli`
- Logged in: `bankr login`

**Call any service:**
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/{endpoint}" \
  -X POST -d '{JSON body}' -y --max-payment {price x2} --raw
```

## Services

### 📊 DATA

**wallet-pnl** · $1.00 · Wallet trading analysis — PnL, win rate, smart money score
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/wallet-pnl" \
  -X POST -d '{"address":"0xYOUR_WALLET"}' -y --max-payment 3 --raw
```

**whale-tracker** · $0.10 · Whale & smart money flows on Base
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/whale-tracker" \
  -X POST -d '{"address":"0xTOKEN_OR_WALLET"}' -y --max-payment 1 --raw
```

**dex-flow** · $0.15 · DEX volume, liquidity, buy/sell pressure
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/dex-flow" \
  -X POST -d '{"token":"TOKEN_ADDRESS"}' -y --max-payment 1 --raw
```

**unlock-alert** · $0.20 · Token unlock schedule & vesting cliff
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/unlock-alert" \
  -X POST -d '{"token":"TOKEN_NAME"}' -y --max-payment 1 --raw
```

---

### 🛡️ SECURITY

**risk-gate** · $0.05 · Pre-transaction safety — returns APPROVE / WARN / BLOCK
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/risk-gate" \
  -X POST -d '{"action":"approve 0xABC to spend unlimited USDC"}' -y --max-payment 1 --raw
# { "decision": "BLOCK", "riskScore": 94, "recommendation": "Use exact amount." }
```

**honeypot-check** · $0.05 · Detect honeypot or rug pull before buying
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/honeypot-check" \
  -X POST -d '{"token":"0xTOKEN_ADDRESS"}' -y --max-payment 1 --raw
```

**phishing-scan** · $0.10 · Scan URL, contract, or social handle for scams
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/phishing-scan" \
  -X POST -d '{"target":"https://suspicious-site.com"}' -y --max-payment 1 --raw
```

**aml-screen** · $0.25 · AML compliance & sanctions screening
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/aml-screen" \
  -X POST -d '{"address":"0xWALLET"}' -y --max-payment 1 --raw
```

**mev-shield** · $0.30 · MEV sandwich attack risk before large swaps
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/mev-shield" \
  -X POST -d '{"action":"swap 10 ETH to USDC on Uniswap"}' -y --max-payment 1 --raw
```

**quantum-premium** · $1.50 · Quantum vulnerability score & migration steps
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/quantum-premium" \
  -X POST -d '{"address":"0xWALLET"}' -y --max-payment 4 --raw
```

---

### 🔍 RESEARCH

**deep-analysis** · $0.35 · Deep due diligence — risk score, red flags, recommendation
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/deep-analysis" \
  -X POST -d '{"projectName":"$TOKEN_OR_ADDRESS"}' -y --max-payment 1 --raw
```

**whitepaper-tldr** · $0.20 · 5-bullet whitepaper summary
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/whitepaper-tldr" \
  -X POST -d '{"url":"https://docs.example.com","projectName":"Project"}' -y --max-payment 1 --raw
```

**tokenomics-score** · $0.50 · Supply structure, inflation, unlock cliff analysis
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/tokenomics-score" \
  -X POST -d '{"token":"TOKEN_NAME"}' -y --max-payment 2 --raw
```

**narrative-pulse** · $0.40 · Trending narratives & momentum in crypto
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/narrative-pulse" \
  -X POST -d '{"query":"AI agents on Base"}' -y --max-payment 1 --raw
```

**vc-tracker** · $1.00 · VC investment activity & fundraising signals
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/vc-tracker" \
  -X POST -d '{"query":"a16z crypto Base investments"}' -y --max-payment 3 --raw
```

**launch-advisor** · $3.00 · Full token launch playbook — tokenomics, marketing, KPIs
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/launch-advisor" \
  -X POST -d '{"description":"NFT marketplace","projectName":"MyProject"}' -y --max-payment 7 --raw
```

**grant-evaluator** · $5.00 · Base grant scoring — innovation, feasibility, team quality
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/grant-evaluator" \
  -X POST -d '{"description":"PROJECT_DESC","projectName":"MyProject"}' -y --max-payment 11 --raw
```

---

### 💰 EARN

**airdrop-check** · $0.10 · Airdrop eligibility & estimated value
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/airdrop-check" \
  -X POST -d '{"address":"0xWALLET"}' -y --max-payment 1 --raw
```

**yield-optimizer** · $0.15 · Best APY on Base DeFi for any token
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/yield-optimizer" \
  -X POST -d '{"token":"USDC"}' -y --max-payment 1 --raw
```

**lp-analyzer** · $0.30 · LP health — impermanent loss & rebalance tips
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/lp-analyzer" \
  -X POST -d '{"address":"0xWALLET","pool":"ETH/USDC"}' -y --max-payment 1 --raw
```

**tax-report** · $2.00 · On-chain tax report with gains, losses & recommendations
```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/tax-report" \
  -X POST -d '{"address":"0xWALLET","year":"2025"}' -y --max-payment 5 --raw
```

---

## Usage Rules

- Always run `risk-gate` before any transaction the user wants to sign
- Always run `honeypot-check` before user buys an unknown token
- `--max-payment` = price × 2 (safety buffer — only actual price is charged)
- Parse JSON from stdout — the result is in the `response` field

## Pricing Summary

| Category | Tools | Price range |
|----------|-------|-------------|
| Data | 4 tools | $0.10 – $1.00 |
| Security | 6 tools | $0.05 – $1.50 |
| Research | 7 tools | $0.20 – $5.00 |
| Earn | 4 tools | $0.10 – $2.00 |
