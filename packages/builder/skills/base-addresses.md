# Base Contract Addresses

Verified addresses for Base mainnet (chain ID 8453).
All addresses should be confirmed on [Basescan](https://basescan.org) before use.
Never guess or interpolate an address. Mark unknowns as `TODO`.

---

## Blue Agent Tokens

| Token | Address | Source |
|---|---|---|
| BLUEAGENT | `0xf895783b2931c919955e18b5e3343e7c7c456ba3` | Basescan verified |
| BLOCKY | `0x1E11dC42b7916621EEE1874da5664d75A0D74b07` | Basescan verified |

---

## Treasury

| Role | Address |
|---|---|
| Blue Agent Treasury | `0xf31f59e7b8b58555f7871f71973a394c8f1bffe5` |

---

## Major Tokens on Base

| Token | Address | Source |
|---|---|---|
| USDC (native) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | [Circle official](https://www.circle.com/en/multi-chain-usdc/base) |
| WETH | `0x4200000000000000000000000000000000000006` | OP Stack predeploy |
| USDbC (bridged USDC) | `TODO` | Deprecated — prefer native USDC |
| DAI | `TODO` | Verify on Basescan |
| cbETH | `TODO` | Verify on Basescan |

---

## OP Stack Predeploys (Base)

These addresses are identical on all OP Stack chains by spec.

| Contract | Address |
|---|---|
| WETH9 | `0x4200000000000000000000000000000000000006` |
| L2CrossDomainMessenger | `0x4200000000000000000000000000000000000007` |
| L2StandardBridge | `0x4200000000000000000000000000000000000010` |
| L2ToL1MessagePasser | `0x4200000000000000000000000000000000000016` |
| BaseFeeVault | `0x4200000000000000000000000000000000000019` |
| L1FeeVault | `0x420000000000000000000000000000000000001A` |
| SequencerFeeVault | `0x4200000000000000000000000000000000000011` |
| GasPriceOracle | `0x420000000000000000000000000000000000000F` |
| L1Block | `0x4200000000000000000000000000000000000015` |

---

## DeFi Infrastructure

| Protocol | Contract | Address | Source |
|---|---|---|---|
| Multicall3 | Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` | [docs.base.org](https://docs.base.org/chain/contracts) |
| Uniswap v3 | Factory | `0x33128a8fC17869897dcE68Ed026d694621f6FDfD` | [docs.base.org](https://docs.base.org/chain/contracts) |
| Uniswap v3 | SwapRouter02 | `0x2626664c2603336E57B271c5C0b26F421741e481` | [docs.base.org](https://docs.base.org/chain/contracts) |
| Uniswap v3 | NonfungiblePositionManager | `0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1` | [docs.base.org](https://docs.base.org/chain/contracts) |
| Uniswap v3 | QuoterV2 | `0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a` | [docs.base.org](https://docs.base.org/chain/contracts) |
| Uniswap v3 | Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | [docs.base.org](https://docs.base.org/chain/contracts) |
| Uniswap v2 | Factory | `0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6` | [docs.base.org](https://docs.base.org/chain/contracts) |
| Uniswap v2 | Router | `0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24` | [docs.base.org](https://docs.base.org/chain/contracts) |
| Aave v3 | Pool | `TODO` | Verify on Basescan |
| Aerodrome | Router | `TODO` | Verify on Basescan |

---

## Rules for address usage

1. Only use addresses from this file or freshly verified on Basescan.
2. If an address is `TODO`, do not substitute a guess — ask the user or leave it unset.
3. Always use full checksummed addresses (EIP-55 mixed-case format).
4. Cross-reference with [basescan.org](https://basescan.org) for token/contract metadata before using in production.
