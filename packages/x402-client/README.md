# @blueagent/x402

x402 client SDK for [Blue Hub](https://blueagent.dev/hub) — call Blue Agent tools on Base and pay per call in USDC. No API key is sent to Blue Agent.

## Paid MCP for Claude Code, Codex, Cursor (`blueagent-x402-mcp`)

The remote server `https://blueagent.dev/api/mcp` works in any MCP client, but a generic client stops at a paid tool's `PaymentRequired`. This package's local stdio bridge pays it: it signs the exact EIP-3009 USDC authorization on Base locally and retries the same call. The key never leaves your machine.

```bash
# read-only: free tools run, paid tools show their price, nothing is signed
claude mcp add blue-agent -- npx -y --package @blueagent/x402 blueagent-x402-mcp

# paying, from a wallet funded only for this, under two caps checked before any signature
claude mcp add blue-agent \
  -e BUYER_PRIVATE_KEY=0x... -e BLUEAGENT_MAX_PER_CALL=0.05 -e BLUEAGENT_BUDGET=1.00 \
  -- npx -y --package @blueagent/x402 blueagent-x402-mcp
```

| Env | Default | Meaning |
|---|---|---|
| `BUYER_PRIVATE_KEY` | unset (read-only) | Wallet that pays, USDC on Base 8453 |
| `BLUEAGENT_MAX_PER_CALL` | `0.05` | Refuse any single payment above this, in USD |
| `BLUEAGENT_BUDGET` | `1.00` | Refuse once this process has paid this much, in USD |
| `BLUEAGENT_MCP_URL` | `https://blueagent.dev/api/mcp` | Server to bridge |

A refused payment returns an error that says why; nothing is signed. After a settlement the terminal prints the Basescan link.

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
