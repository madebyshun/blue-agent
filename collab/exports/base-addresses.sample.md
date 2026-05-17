# base-addresses — sample export

## What it covers

Verified contract addresses for Base mainnet (chain ID 8453) — tokens, DeFi infrastructure, OP Stack predeploys, and Blue Agent contracts.

## When to use it

Use this skill whenever any agent needs a verified contract address on Base. Never guess or interpolate an address — if it's not here, mark it `TODO` and flag for verification.

## Core concepts

- All addresses are Base mainnet only (chain ID 8453).
- Verify all addresses on [Basescan](https://basescan.org) before use.
- Never invent or guess an address — mark unknowns as `TODO`.
- USDC is 6 decimals on Base — not 18.

## Blue Agent

| Contract | Address |
|---|---|
| $BLUEAGENT token | `0xf895783b2931c919955e18b5e3343e7c7c456ba3` |
| Treasury | `0xf31f59e7b8b58555f7871f71973a394c8f1bffe5` |

## Key tokens

| Token | Address |
|---|---|
| USDC (native) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| WETH | `0x4200000000000000000000000000000000000006` |

## OP Stack predeploys

| Contract | Address |
|---|---|
| WETH9 | `0x4200000000000000000000000000000000000006` |
| L2StandardBridge | `0x4200000000000000000000000000000000000010` |
| GasPriceOracle | `0x420000000000000000000000000000000000000F` |
| L1Block | `0x4200000000000000000000000000000000000015` |

## DeFi infrastructure

| Protocol | Contract | Address |
|---|---|---|
| Multicall3 | Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` |
| Uniswap v3 | Factory | `0x33128a8fC17869897dcE68Ed026d694621f6FDfD` |

## Rules

- If an address is needed and not listed here — do NOT fill in a placeholder. Flag it for the user to supply.
- Always full checksum address format: `0x…` (42 characters).
