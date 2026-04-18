# BlueAgent Skill

**emoji:** 🔵
**homepage:** https://t.me/BlueAgentBot
**payment:** x402 · USDC on Base

AI agent on Base with 21 pay-per-use tools across Data, Security, Research, and Earn. No subscription — just pay per call in USDC via x402.

## Setup

```bash
npm install -g @bankr/cli
bankr login
npx @blueagent/skill   # starts MCP server on stdio
```

## Tools

### Data
| Tool | Price | Description |
|------|-------|-------------|
| `pnl` | $1.00 | Wallet PnL — win rate, trading style, smart money score |
| `whale-tracker` | $0.10 | Smart money and whale flow on Base |
| `dex-flow` | $0.15 | DEX volume, liquidity, buy/sell pressure |
| `unlock-alert` | $0.20 | Token unlock schedule and vesting cliff |

### Security
| Tool | Price | Description |
|------|-------|-------------|
| `riskcheck` | $0.05 | Pre-tx safety — APPROVE / WARN / BLOCK |
| `honeypot-check` | $0.05 | Detect honeypot or rug pull before buying |
| `phishing-scan` | $0.10 | Scan URL, contract, or handle for scams |
| `aml-screen` | $0.25 | AML compliance and sanctions screening |
| `mev-shield` | $0.30 | MEV sandwich attack risk before large swaps |
| `quantum` | $1.50 | Quantum vulnerability score + migration steps |

### Research
| Tool | Price | Description |
|------|-------|-------------|
| `analyze` | $0.35 | Deep due diligence — risk score, red flags |
| `whitepaper-tldr` | $0.20 | 5-bullet whitepaper summary |
| `tokenomics-score` | $0.50 | Supply, inflation, unlock cliff analysis |
| `narrative-pulse` | $0.40 | Trending narratives in crypto right now |
| `vc-tracker` | $1.00 | Who is backing what in Base ecosystem |
| `advisor` | $3.00 | Full token launch playbook |
| `grant` | $5.00 | Base grant scoring and feedback |

### Earn
| Tool | Price | Description |
|------|-------|-------------|
| `airdrop-check` | $0.10 | Airdrop eligibility and estimated value |
| `yield-optimizer` | $0.15 | Best APY on Base DeFi for any token |
| `lp-analyzer` | $0.30 | LP health — impermanent loss, rebalance tips |
| `tax-report` | $2.00 | On-chain tax report with gains/losses |

## Example

```
use the riskcheck tool with action "approve 0xABC to spend unlimited USDC"
```

```json
{ "decision": "BLOCK", "riskScore": 94, "recommendation": "Use exact amount instead." }
```

## CLI

```bash
bankr x402 call "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/risk-gate" \
  -X POST -d '{"action":"swap 1 ETH to USDC"}' -y --max-payment 1 --raw
```
