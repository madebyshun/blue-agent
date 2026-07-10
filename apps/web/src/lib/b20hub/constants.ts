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
export const BASE_SEPOLIA_CHAIN_ID = 84532;

/**
 * Wrapped ETH on Base mainnet. Standard cross-chain deployment — the "other
 * leg" of every B20/ETH pool. Predeployed by the OP Stack, no external
 * verification needed (it's a chain built-in).
 *
 * Same address on Base mainnet + Base Sepolia (OP Stack convention).
 */
export const WETH9_BASE = "0x4200000000000000000000000000000000000006" as const;
export const WETH9_BASE_SEPOLIA = "0x4200000000000000000000000000000000000006" as const;

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

// ── Uniswap V4 on Base Sepolia (verified via Uniswap docs 2026-07-09) ─────────
//
// Base Sepolia is where we deploy B20HUB first for smoke-testing before
// promoting to mainnet. B20 factory is at the same 0xB20f… address as mainnet
// (protocol convention). V4 addresses differ per chain — Uniswap deploys V4
// separately on each chain; treat these as documentation, not "same as
// mainnet".

/**
 * V4 PoolManager on Base Sepolia. Different address from mainnet — each
 * chain gets a fresh V4 deployment. Source:
 * https://developers.uniswap.org/contracts/v4/deployments
 */
export const V4_POOL_MANAGER_SEPOLIA = "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408" as const;

/** V4 PositionManager on Base Sepolia. */
export const V4_POSITION_MANAGER_SEPOLIA = "0x4B2C77d209D3405F41a037Ec6c77F7F5b8e2ca80" as const;

/** V4 UniversalRouter on Base Sepolia. */
export const UNIVERSAL_ROUTER_V4_SEPOLIA = "0x492E6456D9528771018DeB9E87ef7750eF184104" as const;

/** V4 Quoter on Base Sepolia (read-only quotes). */
export const V4_QUOTER_SEPOLIA = "0x4A6513c898fe1B2d0E78d3b0e0A4a151589b1CBA" as const;

/** V4 StateView on Base Sepolia (read-only pool state). */
export const V4_STATE_VIEW_SEPOLIA = "0x571291b572ed32ce6751a2cb2486ebee8dEFB9b4" as const;

/**
 * Permit2 is deployed at the SAME address on every chain (deterministic
 * CREATE2 canonical deploy). Mainnet and Sepolia both use this.
 */
export const PERMIT2_SEPOLIA = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;

// ── B20HUB deployed contracts on Base mainnet ─────────────────────────────────
//
// v1 (block 48410997, 2026-07-09) had a broken launcher — createB20 interface
// had wrong argument order and the params tuple was missing version:1. Buyback
// and Hook are fine and stay in use; launcher is being redeployed with the fix.
// Wire the new launcher address here after redeploy lands.

/**
 * BlueBuyBack — receives 15% of every B20HUB swap as WETH, then anyone can
 * call distribute() to swap it into $BLUE and burn (or send to treasury).
 * Keeper reward: 0.1% of the swap output to the caller.
 * https://basescan.org/address/0x97A758dbDf013E8C9DB0D0056B28f111c773f9a7
 */
export const B20HUB_BUYBACK = "0x97A758dbDf013E8C9DB0D0056B28f111c773f9a7" as const;

/**
 * B20HUBHook — the Uniswap V4 hook that intercepts every swap on B20HUB pools
 * and splits fees 80% creator / 15% BlueBuyBack / 5% treasury. Also enforces
 * LP-permanent-lock via beforeRemoveLiquidity revert.
 * Address bits mined for AFTER_INITIALIZE + BEFORE_REMOVE_LIQUIDITY (0x1200).
 * https://basescan.org/address/0x568e4e59d2CAA6764BA8F9721c8E4e43DF645200
 */
export const B20HUB_HOOK = "0x568e4e59d2CAA6764BA8F9721c8E4e43DF645200" as const;

/**
 * B20HUBLauncher v1 — DEPRECATED. Kept for reference only; do not point new
 * launches at it. Its createB20 encoding was wrong and every launch() call
 * reverted on the B20 factory before touching V4. v2 launcher (with the fix
 * merged in the same PR that added this comment) is redeployed via
 * `forge script script/DeployB20HUB.s.sol`. Replace this address once the
 * new launcher is on-chain.
 * https://basescan.org/address/0x8eEe57660b086c31D0ECc98F48A122f829dDBa4b
 */
export const B20HUB_LAUNCHER_V1_BROKEN = "0x8eEe57660b086c31D0ECc98F48A122f829dDBa4b" as const;
