# @blueagent/sdk

Unified SDK for Blue Agent — access all builder commands via a clean API.

## Install

```bash
npm install @blueagent/sdk
```

## Usage

```typescript
import { createBlueAgent } from "@blueagent/sdk";

// No `model` on purpose — it resolves from $VIRTUALS_MODEL, else the @blueagent/core
// default. This line used to pin "claude-sonnet-4-6", a Bankr-era id the Virtuals
// gateway does not serve, so anyone who copied it got an error on the first call.
const ba = createBlueAgent();

// Builder commands
const brief     = await ba.builder.idea("a USDC streaming payroll app on Base");
const plan      = await ba.builder.build("USDC streaming payroll: ERC-20 + x402");
const review    = await ba.builder.audit(contractSourceCode);
const checklist = await ba.builder.ship("payroll app mainnet launch");
const pitch     = await ba.builder.raise("USDC payroll agent for Base");
```

## Environment

```bash
VIRTUALS_API_KEY=your_key   # required — Virtuals is the only inference gateway
VIRTUALS_MODEL=...          # optional — pin an id from the live Virtuals catalog
```

The key can also live in `~/.blue-agent/config.toml` as `virtuals_api_key`.

> Versions ≤ 0.1.0 documented `BANKR_API_KEY` and routed through `llm.bankr.bot`, which
> 403s for this project — that path never worked for anyone installing from npm.

Built by [Blocky Studio](https://blocky.studio).
