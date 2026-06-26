/**
 * B20 Inspector — ABI constants (verified from base-std interfaces).
 *
 * Sources:
 *  - StdPrecompiles.sol  → precompile addresses
 *  - IB20.sol            → token functions + role/policy/pause APIs
 *  - IB20Asset.sol       → multiplier()
 *  - IB20Stablecoin.sol  → currency()
 *  - IB20Factory.sol     → isB20 / isB20Initialized
 *  - IPolicyRegistry.sol → policyExists / policyAdmin
 */

// ── Addresses ─────────────────────────────────────────────────────────────────

export const B20_FACTORY_ADDRESS        = "0xB20f000000000000000000000000000000000000" as const;
export const POLICY_REGISTRY_ADDRESS    = "0x8453000000000000000000000000000000000002" as const;
export const ACTIVATION_REGISTRY_ADDRESS = "0x8453000000000000000000000000000000000001" as const;

// ── ActivationRegistry feature IDs ────────────────────────────────────────────
// isActivated(id) gates createB20: false ⟹ the call reverts FeatureNotActivated,
// which surfaces in the wallet as a confusing "Unable to estimate fee". B20 on
// mainnet is not enabled until the ActivationRegistry flips these on (can be ~1h
// after the Beryl hardfork). Hashes are keccak256(utf8) of the feature name —
// verified live against 0x8453…0001 (asset/stablecoin = false on mainnet, true on
// sepolia as of 2026-06-26).
/** keccak256("base.b20_asset") — gates ASSET-variant deploys */
export const B20_ASSET_FEATURE_ID =
  "0xcdcc772fe4cbdb1029f822861176d09e646db96723d4c1e82ddfdeb8163ef54c" as const;
/** keccak256("base.b20_stablecoin") — gates STABLECOIN-variant deploys */
export const B20_STABLECOIN_FEATURE_ID =
  "0xecfa0def2c10020caaf65e6155aa69c84b24892aaef76eeac52e0e2b3a0b8601" as const;

// ── Sentinel values ───────────────────────────────────────────────────────────

/** policyId 0 ⟹ ALWAYS_ALLOW — no transfer/mint restriction */
export const ALWAYS_ALLOW_POLICY_ID = 0n;

/**
 * policyId sentinel that denies everyone. Per B20 docs:
 *   ALWAYS_BLOCK = (uint64(ALLOWLIST=1) << 56) | 1
 * A scope set to this policy rejects all addresses — transfers/mints on that
 * scope are completely blocked.
 */
export const ALWAYS_BLOCK_POLICY_ID = (1n << 56n) | 1n; // 72057594037927937n

/** DEFAULT_ADMIN_ROLE — bytes32(0) in OpenZeppelin AccessControl (B20 inherits it) */
export const DEFAULT_ADMIN_ROLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

/** address(0) — used as the "admin-less" sentinel (initialAdmin == address(0)) */
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/** supplyCap() returns this sentinel when the token has no cap (type(uint128).max) */
export const SUPPLY_CAP_UNCAPPED =
  340282366920938463463374607431768211455n; // type(uint128).max

// ── PausableFeature enum indices ──────────────────────────────────────────────

/** Maps PausableFeature enum → uint8 value for isPaused(feature) calls */
export const PAUSABLE_FEATURE = {
  TRANSFER: 0,
  MINT:     1,
  BURN:     2,
} as const;

// ── ABIs ──────────────────────────────────────────────────────────────────────

/** IB20Factory — read-only subset needed by the inspector */
export const FACTORY_ABI = [
  {
    type: "function", name: "isB20", stateMutability: "view",
    inputs:  [{ name: "token", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function", name: "isB20Initialized", stateMutability: "view",
    inputs:  [{ name: "token", type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const;

/** IB20 — ERC-20 reads + pause + policy + scope constants + roles */
export const TOKEN_READ_ABI = [
  // ── ERC-20 basics ──────────────────────────────────────────────────────────
  { type: "function", name: "name",        stateMutability: "view", inputs: [], outputs: [{ type: "string"  }] },
  { type: "function", name: "symbol",      stateMutability: "view", inputs: [], outputs: [{ type: "string"  }] },
  { type: "function", name: "decimals",    stateMutability: "view", inputs: [], outputs: [{ type: "uint8"   }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },

  // ── Supply cap ─────────────────────────────────────────────────────────────
  { type: "function", name: "supplyCap",   stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },

  // ── Pause — PausableFeature is a uint8 enum (TRANSFER=0, MINT=1, BURN=2) ─
  {
    type: "function", name: "isPaused", stateMutability: "view",
    inputs:  [{ name: "feature", type: "uint8" }],
    outputs: [{ type: "bool" }],
  },

  // ── Policy scope bytes32 constants (view functions on every B20 token) ────
  { type: "function", name: "TRANSFER_SENDER_POLICY",   stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "TRANSFER_RECEIVER_POLICY", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "TRANSFER_EXECUTOR_POLICY", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "MINT_RECEIVER_POLICY",     stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },

  // ── policyId(bytes32 scope) → uint64 ──────────────────────────────────────
  {
    type: "function", name: "policyId", stateMutability: "view",
    inputs:  [{ name: "policyScope", type: "bytes32" }],
    outputs: [{ type: "uint64" }],
  },

  // ── Role constants (view functions returning bytes32 hash) ─────────────────
  { type: "function", name: "DEFAULT_ADMIN_ROLE", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "MINT_ROLE",          stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "BURN_ROLE",          stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "BURN_BLOCKED_ROLE",  stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "PAUSE_ROLE",         stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "UNPAUSE_ROLE",       stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "METADATA_ROLE",      stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },

  // ── hasRole — checks a specific account (no enumeration on B20) ───────────
  {
    type: "function", name: "hasRole", stateMutability: "view",
    inputs:  [{ name: "role", type: "bytes32" }, { name: "account", type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const;

/** IB20Asset — Asset-variant-only reads */
export const ASSET_ABI = [
  {
    type: "function", name: "multiplier", stateMutability: "view",
    inputs:  [],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** IB20Stablecoin — Stablecoin-variant-only reads */
export const STABLECOIN_ABI = [
  {
    type: "function", name: "currency", stateMutability: "view",
    inputs:  [],
    outputs: [{ type: "string" }],
  },
] as const;

/** ActivationRegistry — isActivated(featureId) gate read */
export const ACTIVATION_REGISTRY_ABI = [
  {
    type: "function", name: "isActivated", stateMutability: "view",
    inputs:  [{ name: "id", type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
] as const;

/** IPolicyRegistry — read-only subset */
export const POLICY_REGISTRY_ABI = [
  {
    type: "function", name: "policyExists", stateMutability: "view",
    inputs:  [{ name: "policyId", type: "uint64" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function", name: "policyAdmin", stateMutability: "view",
    inputs:  [{ name: "policyId", type: "uint64" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function", name: "isAuthorized", stateMutability: "view",
    inputs:  [{ name: "policyId", type: "uint64" }, { name: "account", type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const;
