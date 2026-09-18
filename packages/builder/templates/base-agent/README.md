# {{PROJECT_NAME}} — Base Agent Starter

A minimal, working AI agent on Base with x402 micropayment support. Inference runs
through Virtuals; paid tools come from Blue Agent.

## What it is

This template gives you an agent that:
- Thinks using Virtuals inference (`deepseek-deepseek-v4-flash` by default)
- Calls Blue Agent x402 tools (e.g. `risk-gate`) with automatic USDC payment
- Runs entirely on Base (chain 8453)

It has exactly one runtime dependency — `x402-fetch`. The LLM call is a plain
`fetch` against an OpenAI-compatible endpoint, so there is no SDK to keep in sync.

x402-fetch handles HTTP 402 payment challenges automatically — when a paid API
responds with 402, the library pays in USDC on Base and retries the request.

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
| `VIRTUALS_API_KEY` | **Required.** Inference key — Blue Agent runs all LLM calls through [Virtuals](https://compute.virtuals.io) |
| `VIRTUALS_MODEL` | Optional model override. Must exist in the live Virtuals catalog — an unknown id returns **400, not a fallback** |
| `BLUEAGENT_API_URL` | Blue Agent paid-tool host. Defaults to `https://blueagent.dev` |
| `WALLET_PRIVATE_KEY` | EVM private key for paying x402 tools in USDC on Base |

**Never commit your `.env` file.**

## A note on `max_tokens`

The default model reasons before it answers. Virtuals bills that hidden reasoning
inside `usage.completion_tokens`, spends it from the **same** `max_tokens` budget as
the answer, and never returns it in `message.content`.

Measured 2026-09-17 on one real prompt: at `max_tokens: 400`, **8 of 12 calls
returned empty content** with `finish_reason: "length"` — reasoning alone consumed
189–417 tokens. The same prompt at 1000 / 1500 / 2000 was clean every time.

So: ask for **≥ 1500**, and read an empty response as a starved budget before you
suspect an outage. The failure mode is the expensive one — a starved call bills the
full budget and returns nothing.

## What x402-fetch does

[x402-fetch](https://npmjs.com/package/x402-fetch) wraps the native `fetch` function.
When a server responds with HTTP 402 Payment Required, the library:
1. Reads the payment requirements from the response headers
2. Signs a USDC payment on Base using your wallet private key
3. Retries the original request with the payment proof attached

No manual payment handling required.

## Finding tools and prices

Blue Agent's paid tools are served at `https://blueagent.dev/api/x402/<tool-id>`.

**Resolve an id and its price at call time** from the live catalog:

```
https://blueagent.dev/.well-known/pricing
```

Do not hardcode either. An id that is not in the catalog is a 404, and a price you
remembered is a guess — prices are set per tool and change independently.

## How to extend

1. **Add more Blue Agent tools**: pick another id from the pricing catalog and call
   `${BLUEAGENT_API_URL}/api/x402/<id>` through the same `paidFetch`
2. **Add conversation history**: append prior turns to the `messages` array
3. **Connect a real user interface**: wrap `main()` in a Telegram bot, Discord bot,
   or HTTP server
4. **Add more LLM steps**: chain multiple `think()` calls for multi-step reasoning

## Built by

[Blocky Studio](https://blocky.studio) — [@blueagent_](https://x.com/blueagent_)

Telegram community: [t.me/blueagent_hub](https://t.me/blueagent_hub)
