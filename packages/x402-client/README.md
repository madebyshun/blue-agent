# @blueagent/x402

x402 client SDK for [Blue Hub](https://blueagent.dev/hub) — call 40 AI tools on Base, pay per call in USDC. No API key, no account, no human in the loop.

## Install

```bash
npm install @blueagent/x402
```

## Quick start

```typescript
import { createX402Client } from "@blueagent/x402";

const client = createX402Client({
  privateKey: process.env.PRIVATE_KEY as `0x${string}`,
});

// Call any Blue Hub tool by ID
const signal = await client.tokenPick();
console.log(signal.data);       // AI result
console.log(signal.pricePaid);  // "$0.25"

// Or use the 5 core founder commands
const brief = await client.idea("a gasless USDC tipping app on Base");
const arch  = await client.build("gasless USDC tipping app, Solidity + Next.js");
const audit = await client.audit("0x<contract-address>");
const ship  = await client.ship("tipping app, deployed on Base Sepolia");
const raise = await client.raise("gasless USDC tipping app, 500 DAU, pre-seed");
```

## Call any tool

```typescript
// Call by tool ID + inputs
const result = await client.hub("ecosystem-digest", { focus: "DeFi" });
const result = await client.hub("whale-copy-signal", { wallet: "0x..." });
const result = await client.hub("contract-trust",    { address: "0x..." });

// Call any x402 endpoint directly
const result = await client.call("https://blueagent.dev/api/x402/token-pick-signal", {
  body: { context: "Base DeFi narrative" },
});
```

## Discover pricing

```typescript
// Get all tool prices from /.well-known/pricing
const manifest = await client.pricing();
manifest.routes.forEach(r => {
  console.log(r.name, r.priceUSD);
});

// Get price for a specific tool
const price = await client.priceOf("blue-audit");
// { priceUSD: "$1.00", amountRequired: "1000000" }
```

## Result shape

```typescript
{
  data:       T,          // parsed JSON response from tool
  toolId:     string,     // e.g. "token-pick-signal"
  pricePaid:  string,     // human-readable e.g. "$0.25"
  amountPaid: string,     // raw USDC units e.g. "250000"
  txSettled?: string,     // settlement tx hash (if returned)
}
```

## Payment flow

The SDK handles the full x402 v2 flow automatically:

```
1. POST /api/x402/{tool}           → 402 + X-Payment-Requirements header
2. decode base64 requirements      → get payTo, amount, network
3. sign EIP-3009 USDC auth         → TransferWithAuthorization on Base
4. POST /api/x402/{tool}           → X-Payment header with signature
5. 200 OK                          → tool result + optional settlement tx
```

## Config

```typescript
createX402Client({
  privateKey: "0x...",                   // required: EVM private key
  rpcUrl:     "https://mainnet.base.org", // optional: Base RPC (default)
  ttl:        300,                        // optional: signature TTL seconds (default: 300)
})
```

## Links

- Blue Hub: https://blueagent.dev/hub
- Catalog API: https://blueagent.dev/api/catalog
- Pricing: https://blueagent.dev/.well-known/pricing
- GitHub: https://github.com/madebyshun/blue-agent
