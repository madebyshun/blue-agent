# @blueagent/sdk

Unified SDK for Blue Agent — access all builder commands via a clean API.

## Install

```bash
npm install @blueagent/sdk
```

## Usage

```typescript
import { createBlueAgent } from "@blueagent/sdk";

// Omit `model` to use the default. Any id you pass must exist in the live
// Virtuals catalog — an unknown id comes back as a 400, not a fallback.
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
VIRTUALS_API_KEY=your_key   # required — inference runs through Virtuals
```

Or put it in `~/.blue-agent/config.toml`:

```toml
virtuals_api_key = "your_key"
```

Built by [Blocky Studio](https://blocky.studio).
