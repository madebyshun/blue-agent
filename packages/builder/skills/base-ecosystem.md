# Base Ecosystem

Grounding for `blue build` — practical context on Base protocols, patterns, and tradeoffs for builders.

---

## 1. What is Base?

Base is Coinbase's L2 built on the OP Stack (Optimism). Chain ID: **8453**. ~100× cheaper gas than Ethereum mainnet, ~2-second block times, finalized on Ethereum L1 every ~15 minutes. Native USDC, Coinbase smart wallets, and growing institutional liquidity. The biggest consumer crypto chain by daily active addresses as of 2024-2025.

---

## 2. Core Protocols

### Aerodrome Finance — Base's Native DEX

Aerodrome is the dominant DEX and liquidity layer on Base. Fork of Velodrome (Optimism), which itself is a fork of Solidly.

**Key mechanics:**
- **veAERO model**: Lock AERO tokens → receive veAERO (vote-escrow) → vote weekly on which pools get AERO emissions
- **Gauges**: Liquidity pools that receive AERO rewards based on veAERO votes
- **Stable + volatile pools**: `x*y=k` for correlated assets, `x³y + xy³=k` for stable pairs
- **Concentrated liquidity (CL) pools**: Added in v2 — Uniswap v3-style tick-based positions
- **Bribe market**: Protocols pay veAERO holders to vote for their pool → sustainable liquidity rental

**When to use:** Any project needing deep Base liquidity, token launches, LP incentive programs.

**Router:** `TODO — verify on Basescan`
**Voter:** `TODO — verify on Basescan`
**AERO token:** `TODO — verify on Basescan`

---

### Uniswap V4 on Base

Most advanced AMM architecture. Uniswap V4 introduces **hooks** — arbitrary code executed at key lifecycle points.

**Hook lifecycle points:**
- `beforeInitialize` / `afterInitialize` — called when pool is created
- `beforeAddLiquidity` / `afterAddLiquidity`
- `beforeRemoveLiquidity` / `afterRemoveLiquidity`
- `beforeSwap` / `afterSwap` — most commonly used
- `beforeDonate` / `afterDonate`

**PoolManager:** Singleton contract that manages all Uniswap V4 pools. No more per-pool contracts. All pools live in one contract.
- PoolManager on Base: `TODO — verify on Basescan`

**What hooks enable:**
- Dynamic fees (adjust fee based on volatility)
- On-chain limit orders
- TWAP oracles built directly into pool
- KYC/allowlist gates for DEX pools
- Automated LP rebalancing
- Custom liquidity shapes

**Key structs:**
```solidity
PoolKey {
  Currency currency0;
  Currency currency1;
  uint24 fee;
  int24 tickSpacing;
  IHooks hooks;
}
```

**When to use:** Any DeFi primitive that needs custom AMM behavior. CLMM positions, dynamic fees, token launches with controlled liquidity.

---

### Uniswap V3 on Base (still widely used)

Still the most liquid AMM on Base for most pairs. V3 has **concentrated liquidity** — LPs choose price ranges. More capital efficient than constant product AMMs.

- **NonfungiblePositionManager**: Manages LP positions as NFTs
- Tick spacing: 1 (0.01% pools), 10 (0.05%), 60 (0.3%), 200 (1%)
- V3 Factory on Base: `TODO — verify on Basescan`

---

### Aave V3 on Base

Lending protocol. Same interface as Ethereum mainnet. Key Base-specific assets: USDC, WETH, cbETH, wstETH.

- Pool address on Base: `TODO — verify on Basescan`
- Use `supply()`, `borrow()`, `repay()`, `withdraw()` on the Pool contract
- Health factor > 1.0 required to avoid liquidation

---

## 3. Identity & Social Layer

### Base Name Service (.base names)

On-chain identity for Base wallets. Similar to ENS but native to Base.

- Cheap to register (cents, not dollars)
- Resolves to Base addresses
- Used by Coinbase Wallet, Farcaster, and Base apps natively
- Registry: `TODO — verify on Basescan`
- Frontend: `base.org/names`

**Use in builds:** Resolve `.base` names in your UI. Replace `0xabc…` with `@name.base`. Dramatically improves UX.

---

### Farcaster — Decentralized Social

Protocol for decentralized social media. Each user has a **FID** (Farcaster ID) stored on Optimism mainnet. Messages (casts) stored on Farcaster Hubs (distributed network).

- **Frames**: Mini-apps embedded in casts — run on Base, accept payments, mint NFTs
- **Warpcast**: Main client (like Twitter for Farcaster)
- **Neynar API**: Easiest way to build Farcaster integrations
- Strong overlap with Base builders — biggest crypto dev social community

**When to use:** Distribution channel for Base apps. Frames are the fastest way to get users interacting with an onchain product without leaving their feed.

---

### Coinbase Smart Wallets

Passkey-based smart wallets deployed by Coinbase for users. No seed phrase, no private key management, no browser extension.

- **ERC-4337 compatible** (AA wallets)
- Passkey signing (Face ID / fingerprint)
- Gasless transactions via paymaster
- Batch transactions
- Cross-device recovery

**When to use:** Any consumer product targeting non-crypto users. Smart wallets remove the biggest UX friction in Web3.

**Factory:** `TODO — verify on Basescan`

---

## 4. Base-Specific Patterns

### Gas & Speed

- Typical gas: 0.001–0.01 gwei (vs 10–100 gwei on mainnet)
- Block time: ~2 seconds
- L1 finality: ~15 minutes (challenge window)
- For most consumer apps: treat Base confirmation as final
- For high-value settlements: wait for L1 finality

### Native USDC

Circle deployed native USDC on Base (not bridged). This is the canonical stablecoin.

- **USDC (native)**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- 6 decimals (`1_000_000` = 1 USDC)
- **USDbC** (bridged from Ethereum) — deprecated, avoid in new builds
- Supports `transferWithAuthorization` (EIP-3009) — key for x402 payments

### Paymaster (Gasless Transactions)

Coinbase provides a paymaster for Base that sponsors gas for users.

- Users sign transactions with their smart wallet
- Your backend or Coinbase's paymaster pays the gas
- Requires ERC-4337 EntryPoint integration
- Free tier available through Coinbase Developer Platform

**Use case:** Onboarding flows where gas friction would cause drop-off.

### Coinbase Developer Platform (CDP)

- **AgentKit**: TypeScript/Python SDK for building onchain agents
- **OnchainKit**: React components for Base apps (wallet connect, swap, NFT mint)
- **Verifications**: Coinbase ID verification — gives users a Verified badge onchain
- **x402 payments**: Built into CDP infrastructure

---

## 5. Gotchas & Risks

### Bridge Risk

- Standard bridge (Optimism/Base bridge) has a 7-day withdrawal window to Ethereum
- Third-party bridges (Stargate, Across, Hop) are faster but add smart contract risk
- Never assume fast bridge = same security as native bridge

### Sequencer Centralization

- Coinbase operates the Base sequencer — single point of failure for ordering
- Sequencer downtime = Base is down (has happened)
- Sequencer can theoretically censor transactions (no evidence to date)
- Roadmap: Based Sequencing (Ethereum-based decentralized sequencing)
- Don't build systems that assume sequencer cannot go offline

### Liquidity Fragmentation

- Not all tokens have deep liquidity on Base
- Long-tail tokens may have <$100K TVL in their deepest pool
- Always check Aerodrome and Uniswap V3/V4 TVL before designing swaps
- Stablecoin liquidity is excellent (USDC, USDT, DAI)
- ETH liquidity is excellent
- Everything else: verify

### Re-org Risk

- Base has had minor re-orgs (1-2 blocks)
- For most apps: 1 confirmation is safe
- For payments > $1K: wait 10 confirmations
- For settlements > $10K: wait for L1 finality (~15 min)

### L1 Data Costs

- Even though L2 execution is cheap, L1 data posting adds cost
- EIP-4844 (blob transactions) dramatically reduced this in 2024
- Calldata-heavy operations (complex proofs, large inputs) still have noticeable L1 cost
- Measure with `eth_estimateGas` on Base RPC — don't assume from mainnet benchmarks

---

## 6. When to Build on Base

**✅ Best fit:**
- Consumer apps needing low fees (gaming, social, payments)
- DeFi protocols wanting access to Base liquidity (Aerodrome, Uniswap)
- Social/creator products with onchain verification (Farcaster frames)
- AI agents executing frequent onchain actions
- x402 micropayment services ($0.001–$0.10 per call)
- Token launches (Clanker, Aerodrome pool)
- Products targeting Coinbase's 100M+ user base

**❌ Better elsewhere:**
- High-frequency trading requiring sub-10ms finality → Solana
- Privacy-critical applications → Aztec or other ZK privacy chains
- Maximum decentralization (no sequencer trust) → Ethereum mainnet or based rollups
- Solana-native DeFi ecosystem access → stay on Solana
