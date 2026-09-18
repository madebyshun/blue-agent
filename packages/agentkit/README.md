# @blueagent/agentkit

Coinbase AgentKit plugin for [Blue Agent](https://blueagent.dev) — 12 x402-powered AI tools on Base.

Built by [Blocky Studio](https://blocky.studio).

## Install

```bash
npm install @blueagent/agentkit
```

## Setup

No configuration is required — the client defaults to `https://blueagent.dev`, which
is the only live x402 surface. Both variables below are optional:

```bash
BLUEAGENT_API_URL=https://blueagent.dev   # override the host (e.g. a local dev server)
BLUEAGENT_API_KEY=your_api_key            # optional, for pre-authorized access
```

> **Upgrading from ≤ 1.2.0?** Those versions could not complete a single call. They
> posted to `/api/tools/{id}`, a path that has never existed and 404s, against a
> default host that does not serve. They also read the x402 requirements from an
> `X-Payment-Required` header the server does not send, and listed 20 tool ids that
> exist in neither the catalog nor the handler map. All of that is fixed in 1.3.0;
> nothing that previously worked has been removed, because nothing previously worked.

## Usage with AgentKit

```typescript
import { createBlueAgentProvider } from "@blueagent/agentkit";
import { AgentKit } from "@coinbase/agentkit";

// Create the Blue Agent provider
const blueAgentProvider = createBlueAgentProvider({
  baseUrl: process.env.BLUEAGENT_API_URL,
  apiKey: process.env.BLUEAGENT_API_KEY,
  // Optional: provide a signPayment function for automatic x402 payments
  signPayment: async (requirement) => {
    // Implement x402 payment signing with your wallet
    // Returns base64-encoded X-Payment header value
    throw new Error("Implement signPayment to enable automatic x402 payments");
  },
});

// Add to AgentKit
const agentKit = new AgentKit({
  cdpApiKeyName: process.env.CDP_API_KEY_NAME,
  cdpApiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY,
  actionProviders: [blueAgentProvider],
});
```

### x402 Payment Signing

Blue Agent tools use the [x402 payment protocol](https://x402.org) for micropayments on
Base. Without a `signPayment` callback the client throws a descriptive error on 402 and
never spends anything — that is the default, and it is safe.

To pay automatically, implement `signPayment`. It receives one entry of the server's
`accepts[]` array and must return the base64 value for the `X-Payment` header:

```typescript
const blueAgentProvider = createBlueAgentProvider({
  signPayment: async (requirement) => {
    // requirement = {
    //   scheme: "exact",
    //   network: "eip155:8453",              // Base mainnet, CAIP-2
    //   asset:  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",  // USDC
    //   amount: "200000",                    // base units — USDC is 6dp, so $0.20
    //   payTo:  "0x…",
    //   maxTimeoutSeconds: 120,
    //   extra:  { name: "USD Coin", version: "2" },
    // }
    //
    // Sign an EIP-3009 `transferWithAuthorization` for `amount` to `payTo` with your
    // own wallet, then base64-encode the x402 v2 payment payload. You must supply this
    // yourself — this package deliberately never holds or touches a key.
    return myWalletSignsX402(requirement);
  },
});
```

> ⚠️ Do **not** use `buildExactPayment` from `@blueagent/payments` for this. It is an
> unfinished stub: it returns `signature: ""`, declares `x402Version: 1` and
> `network: "base-mainnet"`, while this server speaks x402 v2 with CAIP-2 networks. It
> has no call sites anywhere in the repo, and earlier revisions of this file showed it
> being invoked with an argument list it does not accept.

## Available Tools

| Tool | Description | Price |
|------|-------------|-------|
| `risk_gate` | Screen a transaction before execution — flags high-risk actions on Base | $0.20 |
| `honeypot_check` | Detect honeypot tokens — checks if a token can be sold after purchase | $0.10 |
| `contract_trust` | Score a smart contract's trustworthiness | $0.15 |
| `key_exposure` | Check if a wallet has been flagged for key compromise | $0.50 |
| `deep_analysis` | Comprehensive token analysis — fundamentals, tokenomics, risk score | $0.50 |
| `grant_evaluator` | Evaluate project eligibility for Base ecosystem grants | $5.00 |
| `whale_tracker` | Track large wallet movements for a token | $0.10 |
| `aml_screen` | AML screening against sanctions and flagged addresses | $0.25 |
| `airdrop_check` | Check a wallet's eligibility for active airdrops | $0.10 |
| `narrative_pulse` | Get current narrative trends and sentiment in crypto | $0.10 |
| `dex_flow` | Analyze DEX trading flow and order book depth | $0.15 |
| `lp_analyzer` | Analyze LP positions — impermanent loss, fees, rebalancing | $0.25 |

All payments are in USDC on Base (chain ID 8453), settled against
`POST https://blueagent.dev/api/x402/{tool-id}`.

These 12 are a curated subset, not the whole Hub. The full catalog is larger and
changes when a tool ships or retires, so resolve it from the generated source
rather than this table: <https://blueagent.dev/api/catalog>.

## Links

- [Blue Agent](https://blueagent.dev)
- [Blocky Studio](https://blocky.studio)
- [Twitter/X](https://x.com/blueagent_)
- [Telegram](https://t.me/blueagent_hub)
