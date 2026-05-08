# @blueagent/vercel-ai

Vercel AI SDK tools for [Blue Agent](https://blueagent.xyz) — 32 x402-powered AI tools on Base.

Built by [Blocky Studio](https://blocky.studio).

## Install

```bash
npm install @blueagent/vercel-ai
```

## Setup

Set environment variables:

```bash
BLUEAGENT_API_URL=https://api.blueagent.xyz
BLUEAGENT_API_KEY=your_api_key   # optional, for pre-authorized access
```

## Usage with generateText()

```typescript
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { blueagentTools } from "@blueagent/vercel-ai";

const result = await generateText({
  model: openai("gpt-4o"),
  tools: blueagentTools({
    baseUrl: process.env.BLUEAGENT_API_URL,
    apiKey: process.env.BLUEAGENT_API_KEY,
  }),
  maxSteps: 5,
  prompt: "Is 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 safe to interact with? Check the contract trust and run an AML screen.",
});

console.log(result.text);
```

## Usage with streamText()

```typescript
import { streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { blueagentTools } from "@blueagent/vercel-ai";

const stream = streamText({
  model: anthropic("claude-3-5-sonnet-20241022"),
  tools: blueagentTools({
    baseUrl: process.env.BLUEAGENT_API_URL,
    apiKey: process.env.BLUEAGENT_API_KEY,
  }),
  maxSteps: 10,
  prompt: "Analyze the token at 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 and check for whale activity.",
});

for await (const chunk of stream.fullStream) {
  if (chunk.type === "text-delta") process.stdout.write(chunk.textDelta);
}
```

## Use a single tool

```typescript
import { blueagentTool } from "@blueagent/vercel-ai";
import { generateText } from "ai";

const result = await generateText({
  model: openai("gpt-4o"),
  tools: {
    risk_gate: blueagentTool("risk-gate", { apiKey: process.env.BLUEAGENT_API_KEY }),
  },
  prompt: "Screen this transfer: 1000 USDC to 0xabc…",
});
```

## x402 Payment Signing

Blue Agent tools use the [x402 payment protocol](https://x402.org) for micropayments on Base (USDC, chain ID 8453). To enable automatic payment handling without a pre-issued API key, implement the `signPayment` callback:

```typescript
import { blueagentTools } from "@blueagent/vercel-ai";

const tools = blueagentTools({
  signPayment: async (requirement) => {
    // Sign the payment requirement with your wallet
    // Returns base64-encoded X-Payment header value
    const payment = await buildExactPayment(wallet, requirement);
    return encodeX402Header(payment);
  },
});
```

## Available Tools

| Tool | Description | Price |
|------|-------------|-------|
| `risk_gate` | Screen a transaction before execution — flags high-risk actions on Base | $0.05 |
| `honeypot_check` | Detect honeypot tokens — checks if a token can be sold after purchase | $0.10 |
| `allowance_audit` | Audit all active ERC-20 token allowances for a wallet | $0.10 |
| `phishing_scan` | Scan a URL, contract, or handle for phishing indicators | $0.10 |
| `mev_shield` | Analyze a swap for MEV sandwich attack risk | $0.10 |
| `contract_trust` | Score a smart contract's trustworthiness | $0.10 |
| `circuit_breaker` | Evaluate whether an agent action should be paused | $0.10 |
| `key_exposure` | Check if a wallet has been flagged for key compromise | $0.10 |
| `quantum_premium` | Deep quantum-readiness analysis for a single wallet | $1.50 |
| `quantum_batch` | Batch quantum-readiness check for up to 10 wallets | $2.50 |
| `quantum_migrate` | Generate a quantum-safe migration plan for a wallet | $0.10 |
| `quantum_timeline` | Get projected quantum threat timeline for Ethereum wallets | $0.10 |
| `deep_analysis` | Comprehensive token analysis — fundamentals, tokenomics, risk score | $0.35 |
| `token_launch` | Launch a new token on Base | $1.00 |
| `launch_advisor` | AI-powered launch strategy for your project | $3.00 |
| `grant_evaluator` | Evaluate project eligibility for Base ecosystem grants | $5.00 |
| `x402_readiness` | Audit an API for x402 payment protocol compliance | $0.10 |
| `base_deploy_check` | Verify a deployed contract on Base | $0.10 |
| `tokenomics_score` | Score a token's economic model and sustainability | $0.10 |
| `whitepaper_tldr` | Summarize a whitepaper into a concise TL;DR | $0.10 |
| `vc_tracker` | Track recent VC investments in a sector | $0.10 |
| `wallet_pnl` | Calculate realized and unrealized PnL for a wallet | $1.00 |
| `whale_tracker` | Track large wallet movements for a token | $0.10 |
| `aml_screen` | AML screening against sanctions and flagged addresses | $0.10 |
| `airdrop_check` | Check a wallet's eligibility for active airdrops | $0.10 |
| `narrative_pulse` | Get current narrative trends and sentiment in crypto | $0.10 |
| `dex_flow` | Analyze DEX trading flow and order book depth | $0.10 |
| `yield_optimizer` | Find best yield opportunities across Base DeFi | $0.10 |
| `lp_analyzer` | Analyze LP positions — impermanent loss, fees, rebalancing | $0.10 |
| `tax_report` | Generate a tax report for a wallet for a specific year | $0.10 |
| `alert_subscribe` | Subscribe to real-time on-chain alerts for a wallet | $0.10 |
| `alert_check` | Check the status of active alerts for a wallet | $0.10 |

All payments are in USDC on Base (chain ID 8453).

## Links

- [Blue Agent](https://blueagent.xyz)
- [Blocky Studio](https://blocky.studio)
- [Twitter/X](https://x.com/blocky_agent)
- [Telegram](https://t.me/blueagent_hub)
