# {{PROJECT_NAME}} — Paid x402 API Template

A paid API service on Base using x402 micropayments. Mirrors the pattern from Blue
Agent's own x402 surface (`apps/web/src/app/api/x402/`).

## What it is

This template gives you a paid API endpoint that:
- Accepts POST requests and processes them with Virtuals inference
- Declares its price and schema in `x402.json` (USDC on Base, chain 8453)
- Follows the same handler pattern as Blue Agent's x402 tools

It has **zero runtime dependencies** — the LLM call is a plain `fetch` against an
OpenAI-compatible endpoint, and the server is Node's built-in `http`.

> ⚠️ **This template does not collect payment yet.** It ships the handler, the
> schema and the price declaration. Settling a 402 challenge on-chain is a separate
> step — see "Taking payment" below. Do not advertise the endpoint as paid until
> you have wired a facilitator; an endpoint that declares a price and then serves
> for free is worse than a free one, because callers budget against the declaration.

## Setup

```bash
# 1. Copy env and fill in your key
cp .env.example .env

# 2. Install dependencies
npm install

# 3. Run the server
npm run dev
```

## Project structure

```
base-x402/
├── x402.json              # Payment config: price, currency, schema
├── x402/
│   └── my-tool/
│       └── index.ts       # Tool handler: parse → LLM → respond
└── src/
    └── index.ts           # HTTP server with routing
```

## How to add new tools

1. Copy `x402/my-tool/` to `x402/your-tool/`
2. Edit the handler logic in `x402/your-tool/index.ts`
3. Add a route in `src/index.ts`:
   ```typescript
   if (req.method === "POST" && url.pathname === "/api/tools/your-tool") {
     res = await yourTool(req);
   }
   ```
4. Add the service definition to `x402.json`

Keep those two in step. A tool that exists in the router but not in `x402.json` has
no published price; one in `x402.json` but not the router is a 404 your catalog
advertises.

## Payment config (`x402.json`)

The `x402.json` file declares your services and their prices:
- `network`: `"base"` — chain 8453
- `currency`: `"USDC"` — native USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`),
  never bridged USDbC
- `services`: map of tool name → price and schema

## Taking payment

x402 is an HTTP protocol, not a hosted product: you return `402` with your payment
requirements, the caller signs an EIP-3009 `transferWithAuthorization`, and you
verify and settle it before doing the work.

Two ways to close that loop:

- **Use a facilitator.** Blue Agent's own surface settles through the Coinbase CDP
  facilitator. This is the shortest path — you never touch the chain directly.
- **Verify it yourself.** Check the signature, `validBefore`/`validAfter`, the
  `nonce` (store it — replays are the whole attack), that `to` is *your* treasury,
  that `value` covers the price, and that `chainId` is 8453.

Whichever you pick, settle before you answer. Once you've returned the result you
have no leverage left.

## Environment variables

| Variable | Description |
|---|---|
| `VIRTUALS_API_KEY` | **Required.** Inference key — all LLM calls go through [Virtuals](https://compute.virtuals.io) |
| `VIRTUALS_MODEL` | Optional model override. Must exist in the live Virtuals catalog — an unknown id returns **400, not a fallback** |
| `PORT` | HTTP port (default 3000) |

## Deploy notes

- **Vercel**: works with `npm run start` as the start command
- **Railway**: auto-detects Node.js, set `PORT` env var
- **Fly.io**: works with the provided server setup

## Built by

[Blocky Studio](https://blocky.studio) — [@blueagent_](https://x.com/blueagent_)

Telegram community: [t.me/blueagent_hub](https://t.me/blueagent_hub)
