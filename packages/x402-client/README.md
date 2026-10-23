# @blueagent/x402

x402 client SDK for [Blue Hub](https://blueagent.dev/hub) — call Blue Agent tools on Base and pay per call in USDC. No API key is sent to Blue Agent.

## Claude Code paid MCP demo

The production MCP endpoint is `https://blueagent.dev/api/mcp`. Generic MCP clients can discover the tools, but they do not all know how to handle an x402 `PaymentRequired` tool result. This package includes an x402-aware local stdio bridge that signs the exact EIP-3009 authorization locally and retries the same call.

Use a dedicated demo wallet with only the USDC you intend to spend. The bridge is not on npm yet, so build it locally and point your MCP client at the built file:

```bash
cd packages/x402-client && npm run build
export BUYER_PRIVATE_KEY=0x...
node dist/mcp-stdio.js
```

Configure Claude Code with the absolute path to that build:

```json
{
  "mcpServers": {
    "blue-agent-paid": {
      "command": "node",
      "args": ["/absolute/path/to/blue-agent/packages/x402-client/dist/mcp-stdio.js"],
      "env": { "BUYER_PRIVATE_KEY": "0x..." }
    }
  }
}
```

Once a release carrying the `blueagent-x402-mcp` bin is published, this becomes `npx --yes --package @blueagent/x402 blueagent-x402-mcp`.

Then ask:

```text
Compare NVDA on Base 8453 and Robinhood Chain 4663.
Which venue is cheaper versus the Chainlink reference price?
Do not give me a buy or sell recommendation.
```

The bridge performs: unpaid MCP call → exact `PaymentRequired` parsing → local EIP-3009 signature → retry with `_meta["x402/payment"]` → result and settlement receipt. The private key never leaves the local process. The terminal prints a Basescan URL after successful settlement.

For a direct local test without Claude Code:

```bash
BUYER_PRIVATE_KEY=0x... npx tsx apps/web/scripts/mcp-paid-e2e.ts https://blueagent.dev/api/mcp stock_signal
```

## SDK quick start

```typescript
import { createX402Client } from "@blueagent/x402";

const client = createX402Client({ privateKey: process.env.PRIVATE_KEY as `0x${string}` });
const signal = await client.tokenPick();
console.log(signal.data, signal.pricePaid);
```

The existing HTTP client handles the normal x402 header flow. `PaidMcpClient` handles the MCP-specific tool-result flow:

```typescript
// Call by tool ID + inputs
const result = await client.hub("ecosystem-digest", { focus: "DeFi" });
const result = await client.hub("honeypot-check", { token: "0x..." });
const result = await client.hub("contract-trust",    { address: "0x..." });

// Call any x402 endpoint directly
const result = await client.call("https://blueagent.dev/api/x402/token-pick-signal", {
  body: { context: "Base DeFi narrative" },
});
```

For the MCP-specific tool-result flow:

```typescript
import { PaidMcpClient } from "@blueagent/x402";
const mcp = new PaidMcpClient({ privateKey: process.env.PRIVATE_KEY as `0x${string}` });
await mcp.initialize();
const result = await mcp.callTool("stock_signal", { ticker: "NVDA" });
```
