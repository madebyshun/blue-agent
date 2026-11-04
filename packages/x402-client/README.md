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

## Agent budget

One key can pay for many agents without any of them draining it. Every limit is
checked after the 402 is read and **before** anything is signed, so a refused
call is never paid. The client holds no funds; it only declines to sign.

```ts
const client = new X402Client({
  privateKey: process.env.BUYER_KEY as `0x${string}`,
  maxPerCallAtomic: 50_000n,                 // no single call above $0.05
  budget: {
    totalAtomic: 2_000_000n,                 // $2.00 for this client, all agents
    perAgentAtomic: { scout: 250_000n },     // scout: $0.25, fixed at construction
    defaultAgentAtomic: 500_000n,            // any other agent: $0.50
    loop: { maxRepeats: 5, windowSeconds: 60 }, // the default; `false` turns it off
  },
});

await client.call(url, { agent: "scout", body: { ticker: "NVDA" } });

client.budget.report();          // [{ agent, spentAtomic, calls, capAtomic }], highest spend first
client.budget.remainingAtomic("scout");
```

A refusal throws `BudgetError` with `code`:
- `BUDGET_EXCEEDED`: the total budget would be passed.
- `AGENT_BUDGET_EXCEEDED`: that agent's budget would be passed.
- `LOOP_DETECTED`: the same agent made the same call (endpoint and body) more than
  `maxRepeats` times inside `windowSeconds`, which is how a stuck agent burns money.

Spend is reserved before signing and kept only when the seller answers 2xx, so
parallel calls cannot overshoot a budget and a failed call gives its share back.
Budgets live in memory for the life of the client.

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
