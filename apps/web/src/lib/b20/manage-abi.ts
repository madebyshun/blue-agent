/**
 * B20 Management ABI — write functions for IB20 (verified from base-std).
 * Used by ManagePanel for client-side encodeFunctionData.
 */

// ── Write ABI ─────────────────────────────────────────────────────────────────

export const B20_WRITE_ABI = [
  // ── Supply ──────────────────────────────────────────────────────────────────
  {
    type: "function", name: "mint", stateMutability: "nonpayable",
    inputs:  [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    // Mint to many recipients in one tx. Gated by MINT_ROLE, same as mint().
    // No WithMemo variant — attach context off-chain or per-token instead.
    type: "function", name: "batchMint", stateMutability: "nonpayable",
    inputs:  [
      { name: "recipients", type: "address[]" },
      { name: "amounts",    type: "uint256[]" },
    ],
    outputs: [],
  },
  {
    type: "function", name: "burn", stateMutability: "nonpayable",
    inputs:  [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function", name: "burnBlocked", stateMutability: "nonpayable",
    inputs:  [{ name: "from", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [],
  },
  // ── Pause ──────────────────────────────────────────────────────────────────
  {
    type: "function", name: "pause", stateMutability: "nonpayable",
    inputs:  [{ name: "features", type: "uint8[]" }],
    outputs: [],
  },
  {
    type: "function", name: "unpause", stateMutability: "nonpayable",
    inputs:  [{ name: "features", type: "uint8[]" }],
    outputs: [],
  },
  // ── Policy ─────────────────────────────────────────────────────────────────
  {
    type: "function", name: "updatePolicy", stateMutability: "nonpayable",
    inputs:  [{ name: "policyScope", type: "bytes32" }, { name: "newPolicyId", type: "uint64" }],
    outputs: [],
  },
  // ── Access control ─────────────────────────────────────────────────────────
  {
    type: "function", name: "grantRole", stateMutability: "nonpayable",
    inputs:  [{ name: "role", type: "bytes32" }, { name: "account", type: "address" }],
    outputs: [],
  },
  {
    type: "function", name: "revokeRole", stateMutability: "nonpayable",
    inputs:  [{ name: "role", type: "bytes32" }, { name: "account", type: "address" }],
    outputs: [],
  },
  {
    type: "function", name: "renounceLastAdmin", stateMutability: "nonpayable",
    inputs:  [],
    outputs: [],
  },
  // ── Supply cap ─────────────────────────────────────────────────────────────
  {
    type: "function", name: "updateSupplyCap", stateMutability: "nonpayable",
    inputs:  [{ name: "newSupplyCap", type: "uint256" }],
    outputs: [],
  },
  // ── Metadata ───────────────────────────────────────────────────────────────
  {
    type: "function", name: "updateName", stateMutability: "nonpayable",
    inputs:  [{ name: "newName", type: "string" }],
    outputs: [],
  },
  {
    type: "function", name: "updateSymbol", stateMutability: "nonpayable",
    inputs:  [{ name: "newSymbol", type: "string" }],
    outputs: [],
  },
  {
    type: "function", name: "updateContractURI", stateMutability: "nonpayable",
    inputs:  [{ name: "newURI", type: "string" }],
    outputs: [],
  },
  // ── ERC-20 transfer ────────────────────────────────────────────────────────
  {
    type: "function", name: "transfer", stateMutability: "nonpayable",
    inputs:  [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
  // ── ERC-20 read (for balance display) ─────────────────────────────────────
  {
    type: "function", name: "balanceOf", stateMutability: "view",
    inputs:  [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

// ── Constants ─────────────────────────────────────────────────────────────────

/** type(uint128).max — sentinel for "no supply cap" */
export const SUPPLY_CAP_MAX = 340282366920938463463374607431768211455n;

/** PausableFeature enum indices */
export const PAUSE_FEATURE = { TRANSFER: 0, MINT: 1, BURN: 2 } as const;
export type  PauseFeatureName = keyof typeof PAUSE_FEATURE;

// ── Role definitions ──────────────────────────────────────────────────────────

export const ROLE_DEFS = [
  { label: "Default Admin",  key: "DEFAULT_ADMIN_ROLE" },
  { label: "Mint",           key: "MINT_ROLE"          },
  { label: "Burn",           key: "BURN_ROLE"          },
  { label: "Burn Blocked",   key: "BURN_BLOCKED_ROLE"  },
  { label: "Pause",          key: "PAUSE_ROLE"         },
  { label: "Unpause",        key: "UNPAUSE_ROLE"       },
  { label: "Metadata",       key: "METADATA_ROLE"      },
] as const;

// ── Policy scope labels ───────────────────────────────────────────────────────

export const POLICY_SCOPE_KEYS = [
  "transferSender",
  "transferReceiver",
  "transferExecutor",
  "mintReceiver",
] as const;
export type PolicyScopeKey = typeof POLICY_SCOPE_KEYS[number];

export const POLICY_SCOPE_LABELS: Record<PolicyScopeKey, string> = {
  transferSender:   "Transfer Sender",
  transferReceiver: "Transfer Receiver",
  transferExecutor: "Transfer Executor",
  mintReceiver:     "Mint Receiver",
};
