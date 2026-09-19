# {{PROJECT_NAME}} — Base Agent Starter

A minimal, working AI agent on Base with x402 micropayment support. Thinks with Virtuals
inference, pays for Blue Agent tools in USDC.

## What it is

This template gives you an agent that:
- Thinks using the Virtuals gateway through `callVirtuals` from `@blueagent/core`
- Calls Blue Agent x402 tools (e.g. `risk-gate`) with automatic USDC payment
- Runs entirely on Base (chain 8453)

x402-fetch handles HTTP 402 payment challenges automatically — when a paid API responds
with 402, the library pays in USDC on Base and retries the request.

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
| `VIRTUALS_API_KEY` | Virtuals inference key — the only LLM provider this template calls |
| `VIRTUALS_MODEL` | *(optional)* model id from the live Virtuals catalog; unset uses the package default |
| `BLUEAGENT_API_URL` | *(optional)* Blue Agent x402 base URL — defaults to `https://blueagent.dev` |
| `WALLET_PRIVATE_KEY` | EVM private key for paying x402 tools in USDC on Base |

**Never commit your `.env` file.** `WALLET_PRIVATE_KEY` signs real USDC payments — use a
funded-just-enough hot wallet, not your main one.

### About the model id

`think()` does not pass a `model`. It resolves from `$VIRTUALS_MODEL`, else the
`@blueagent/core` default. Hardcoding an id is how a template goes stale: an earlier version
of this file pinned `claude-haiku-4-5` against a gateway that never served it.

## What x402-fetch does

[x402-fetch](https://npmjs.com/package/x402-fetch) wraps the native `fetch` function. When a
server responds with HTTP 402 Payment Required, the library:
1. Reads the payment requirements from the response headers
2. Signs a USDC payment on Base using your wallet private key
3. Retries the original request with the payment proof attached

No manual payment handling required. The **price comes from the 402 response**, not from
this repo — don't hardcode one, and set a `maxValue` cap if you want a spend ceiling.

## How to extend

1. **Add more Blue Agent tools**: POST to `${BLUEAGENT_API_URL}/api/x402/<tool-id>`
2. **Add conversation history**: pass more entries in the `messages` array
3. **Connect a real user interface**: wrap `main()` in a Telegram bot, Discord bot, or HTTP server
4. **Add more LLM steps**: chain multiple `think()` calls for multi-step reasoning

Live tool ids include `risk-gate`, `honeypot-check`, `key-exposure`, `protocol-risk-monitor`,
`deep-analysis`, `grant-evaluator` and `token-launch-readiness`. The full catalog is served at
[`blueagent.dev/api/catalog`](https://blueagent.dev/api/catalog) — read it rather than trusting
a list in a README, including this one.

## Honesty rules this template follows

The system prompt tells the model to answer `"insufficient data"` rather than invent a
number, and it must never produce a contract address that isn't already verified. Keep that
line if you edit the prompt: a model asked for a price it cannot look up will produce a
plausible one.

## Built by

[Blocky Studio](https://blocky.studio) — [@blueagent_](https://x.com/blueagent_)

Telegram community: [t.me/blueagent_hub](https://t.me/blueagent_hub)
