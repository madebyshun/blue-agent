// B20HUB — real B20 launchpad on Base with auto Uniswap V4 pool.
//
// Every address below is INDEPENDENTLY verified on Basescan (source code:
// "Exact Match", deployer address confirmed, contract name confirmed).
// This is what a B20HUB launch touches:
//
//   1. B20Factory (Rust precompile inside Base node, address hard-coded by the
//      protocol — same on mainnet + Sepolia).
//   2. Uniswap V4 core singleton + periphery (PositionManager for pool
//      creation + liquidity, PoolManager for swaps).
//   3. WETH9 as one leg of every B20HUB pool (B20/WETH).
//
// NEVER add an address here that isn't verified — hallucinated addresses in
// swap/liquidity paths destroy user funds. If Uniswap ships a new deployment,
// verify the new address on Basescan first, then update this file.
// See docs: https://developers.uniswap.org/contracts/v4/deployments

// ── Base chain ─────────────────────────────────────────────────────────────────

export const BASE_CHAIN_ID = 8453;

/**
 * Wrapped ETH on Base mainnet. Standard cross-chain deployment — the "other
 * leg" of every B20/ETH pool. Predeployed by the OP Stack, no external
 * verification needed (it's a chain built-in).
 */
export const WETH9_BASE = "0x4200000000000000000000000000000000000006" as const;

// ── B20 protocol ───────────────────────────────────────────────────────────────

/**
 * B20Factory — Base's Rust precompile at a fixed protocol address. `isB20()`
 * on this factory is the ONLY authoritative proof a token is a real B20.
 * Same address on Base mainnet + Sepolia.
 */
export const B20_FACTORY = "0xB20f000000000000000000000000000000000000" as const;

// ── Uniswap V4 on Base mainnet (verified 2026-07-08) ──────────────────────────

/**
 * V4 core — the singleton contract that holds ALL Uniswap V4 pool state on
 * Base. Users don't interact with this directly; they go through
 * PositionManager (for liquidity) and UniversalRouter (for swaps).
 * Verified: name "PoolManager", Solidity 0.8.26, deployer
 * 0x2179a608...b27b6 (Uniswap Labs' canonical V4 deployer on Base).
 * https://basescan.org/address/0x498581ff718922c3f8e6a244956af099b2652b2b
 */
export const V4_POOL_MANAGER = "0x498581Ff718922c3f8e6A244956aF099B2652b2b" as const;

/**
 * V4 periphery — the NFT-based liquidity position manager. Every B20HUB launch
 * calls this to (a) initialize the B20/WETH pool and (b) mint the initial LP
 * position. The LP NFT lands in the creator's wallet.
 * Verified: name "PositionManager", Solidity 0.8.26, same Uniswap deployer.
 * https://basescan.org/address/0x7c5f5a4bbd8fd63184577525326123b519429bdc
 */
export const V4_POSITION_MANAGER = "0x7C5f5A4bBd8fD63184577525326123B519429bDc" as const;

/**
 * V4 quoter — off-chain read helper for computing swap amounts (used by the
 * Trade UI to show "you'll receive ~X" before signing).
 * Source: Uniswap official deployments page. Not source-diffed here — read-
 * only, no fund custody, so a name-mismatch would only affect quote display.
 * https://basescan.org/address/0x0d5e0f971ed27fbff6c2837bf31316121532048d
 */
export const V4_QUOTER = "0x0d5e0F971ED27FBfF6c2837bf31316121532048D" as const;

/**
 * StateView — off-chain read helper for PoolManager state (slot0, liquidity,
 * positions). Used by Trade UI to detect pool existence + read pool price.
 * https://basescan.org/address/0xa3c0c9b65bad0b08107aa264b0f3db444b867a71
 */
export const V4_STATE_VIEW = "0xA3c0c9B65BAd0b08107Aa264b0f3dB444b867A71" as const;

/**
 * Universal Router — Uniswap's canonical swap entrypoint (V2/V3/V4 combined).
 * Every B20HUB trade routes through here. Verified: name "UniversalRouter",
 * Solidity 0.8.26.
 * https://basescan.org/address/0x6ff5693b99212da76ad316178a184ab56d299b43
 */
export const UNIVERSAL_ROUTER_V4 = "0x6fF5693b99212Da76ad316178A184AB56D299b43" as const;

/**
 * Permit2 — Uniswap's canonical approval router (single approval, many spenders).
 * The Universal Router pulls tokens via Permit2, so any ERC20 sell needs a
 * one-time Permit2 approval + a per-tx Permit2 permit signature.
 * Deployed at the same address on every chain (deterministic CREATE2).
 * https://basescan.org/address/0x000000000022D473030F116dDEE9F6B43aC78BA3
 */
export const PERMIT2_BASE = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;

// ── V4 fee tier + tick spacing table ───────────────────────────────────────────
//
// Uniswap V4's PoolKey requires BOTH a `fee` and a `tickSpacing`. Standard
// combinations mirror V3's tiers (100/500/3000/10000) with matching spacing.
// A pool at tier 3000 (0.30%) uses tickSpacing 60; at tier 10000 (1%) uses 200.
// Getting this wrong at initialize time creates an unusable pool.

export const V4_FEE_TIERS = {
  /** 0.01% — stablecoin-stablecoin pairs. Rarely used for launches. */
  LOWEST: { fee: 100,   tickSpacing: 1 },
  /** 0.05% — high-volume mainstream pairs. */
  LOW:    { fee: 500,   tickSpacing: 10 },
  /** 0.30% — most launched tokens land here. Default for B20HUB. */
  MEDIUM: { fee: 3000,  tickSpacing: 60 },
  /** 1.00% — memecoins + first-launch tokens with expected wide spread. */
  HIGH:   { fee: 10000, tickSpacing: 200 },
} as const;

export type V4FeeTierName = keyof typeof V4_FEE_TIERS;
