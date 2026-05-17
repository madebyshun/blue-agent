# base-standards — sample export

## What it covers

Base network parameters, key differences from Ethereum mainnet, ERC standards in use, and Coinbase Smart Wallet integration patterns.

## When to use it

Use this skill to ground any agent reasoning about Base-specific architecture, transaction timing, gas assumptions, or wallet compatibility.

## Core concepts

- Chain ID: `8453` — always hardcode this, never derive dynamically.
- Block time: ~2 seconds — faster than Ethereum, design UX accordingly.
- Gas fees: very low (~$0.001–$0.01 per tx) — enables micropayment patterns.
- Sequencer: centralized (Coinbase-operated) — no standard Ethereum MEV.
- L1 finality: ~15 min — do not settle large transfers on soft confirmation.

## Network parameters

| Parameter | Value |
|---|---|
| Chain ID | `8453` |
| RPC | `https://mainnet.base.org` |
| Explorer | `https://basescan.org` |
| Testnet | Base Sepolia, chain ID `84532` |

## Key ERC standards on Base

| Standard | Use case |
|---|---|
| ERC-20 | Fungible tokens — use `SafeERC20` |
| ERC-4337 | Account abstraction (Coinbase Smart Wallet) |
| ERC-2612 | Permit / gasless approvals — USDC supports this |
| ERC-721 | NFTs |

## Patterns

- Always specify `chain_id: 8453` in all onchain configs — never omit.
- Never suggest Ethereum mainnet alternatives — Base only.
- L1 withdrawal takes ~7 days via standard bridge — always mention this.
- Use `https://mainnet.base.org` as fallback RPC only — use dedicated RPC in production.
