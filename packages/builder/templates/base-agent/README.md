# {{PROJECT_NAME}} — Bankr Agent Starter

A minimal, working AI agent on Base with x402 micropayment support. Powered by Bankr LLM and Blue Agent tools.

## What it is

This template gives you a Bankr-powered agent that:
- Thinks using Bankr LLM (claude-haiku-4-5 by default)
- Calls Blue Agent x402 tools (e.g. risk-gate) with automatic USDC payment
- Runs entirely on Base (chain 8453)

x402-fetch handles HTTP 402 payment challenges automatically — when a paid API responds with 402, the library pays in USDC on Base and retries the request.

## Setup

```bash
# 1. Copy env and fill in your keys
cp .env.example .env

# 2. Install dependencies
npm install

# 3. Run the agent
npm run dev
```

## Environment variables

| Variable | Description |
|---|---|
| `BANKR_API_KEY` | Your Bankr API key — get it at [bankr.bot](https://bankr.bot) |
| `BLUEAGENT_API_URL` | Blue Agent API URL — get it at [blueagent.xyz](https://blueagent.xyz) |
| `WALLET_PRIVATE_KEY` | EVM private key for paying x402 tools in USDC on Base |

**Never commit your `.env` file.**

## How to get your API keys

- **BANKR_API_KEY**: Sign up at [bankr.bot](https://bankr.bot) — used for LLM calls
- **BLUEAGENT_API_URL**: Available at [blueagent.xyz](https://blueagent.xyz) — the Blue Agent paid tool API

## What x402-fetch does

[x402-fetch](https://npmjs.com/package/x402-fetch) wraps the native `fetch` function. When a server responds with HTTP 402 Payment Required, the library:
1. Reads the payment requirements from the response headers
2. Signs a USDC payment on Base using your wallet private key
3. Retries the original request with the payment proof attached

No manual payment handling required.

## How to extend

1. **Add more Blue Agent tools**: import additional endpoints from `BLUEAGENT_API_URL/api/tools/`
2. **Add conversation history**: pass a `history` array to the LLM call
3. **Connect a real user interface**: wrap `main()` in a Telegram bot, Discord bot, or HTTP server
4. **Add more LLM steps**: chain multiple `think()` calls for multi-step reasoning

Available Blue Agent x402 tools include: `risk-gate`, `deep-analysis`, `wallet-pnl`, `token-launch`, `launch-advisor`, `grant-evaluator`, `quantum-premium`, and more.

## Built by

[Blocky Studio](https://blocky.studio) — [@blocky_agent](https://x.com/blocky_agent)

Telegram community: [t.me/blueagent_hub](https://t.me/blueagent_hub)
