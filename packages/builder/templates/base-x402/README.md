# {{PROJECT_NAME}} — Paid x402 API Template

A production-ready paid API service on Base using x402 micropayments. Mirrors the pattern
from Blue Agent's own x402 surface (`apps/web/src/app/api/x402/`).

## What it is

This template gives you a paid API endpoint that:
- Accepts POST requests and processes them with Virtuals inference
- Defines payment requirements in `x402.json` (USDC on Base, chain 8453)
- Follows the same handler pattern as Blue Agent's x402 tools
- Is yours to host — you settle the payment, no storefront sits in the path

## Setup

```bash
# 1. Copy env and fill in your key
cp .env.example .env

# 2. Install dependencies
npm install

# 3. Run the server
npm run dev
```

## Environment variables

| Variable | Description |
|---|---|
| `VIRTUALS_API_KEY` | Virtuals inference key — the only LLM provider this template calls |
| `VIRTUALS_MODEL` | *(optional)* model id from the live Virtuals catalog; unset uses the package default |
| `PORT` | *(optional)* HTTP port, default `3000` |

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

## Payment config (`x402.json`)

The `x402.json` file defines your services and their prices:
- `network`: `"base"` — chain 8453, settled in USDC
- `currency`: always `"USDC"`
- `services`: map of tool name → price and schema

## Going live

1. Deploy your API to a public URL (Vercel, Railway, Fly.io, etc.)
2. Answer an unpaid request with `402` and an `accepts[]` array, then verify and settle the
   `X-Payment` header before running the handler. Blue Agent does this against the Coinbase
   CDP facilitator; the shape it emits is:

   ```json
   { "scheme": "exact", "network": "eip155:8453",
     "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
     "amount": "500000", "payTo": "0x…", "maxTimeoutSeconds": 120,
     "extra": { "name": "USD Coin", "version": "2" } }
   ```

   `amount` is in base units — USDC is 6dp, so `"500000"` is $0.50.
3. Publish your `x402.json` at a stable URL so agents can discover the price and schema.

> This template used to end with "register on bankr.bot". That storefront is gone from the
> payment path — Blue Agent self-hosts x402 and settles directly, and Bankr 403-bans this
> project at the account level. Don't route your revenue through it.

## Honesty rules this template follows

`x402/my-tool/index.ts` returns `confidence: null` when the model fails to produce JSON,
rather than the `0.8` an earlier version asserted. If you add fields that look like
measurements, make sure something actually measured them — a paid API that invents numbers
is worse than one that returns "insufficient data".

## Deploy notes

- **Vercel**: works with `npm run start` as the start command
- **Railway**: auto-detects Node.js, set `PORT` env var
- **Fly.io**: works with the provided server setup

## Built by

[Blocky Studio](https://blocky.studio) — [@blueagent_](https://x.com/blueagent_)

Telegram community: [t.me/blueagent_hub](https://t.me/blueagent_hub)
