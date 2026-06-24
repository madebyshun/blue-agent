/**
 * B20 Inspector Engine — reads live token state from Base RPC.
 * ZERO LLM. All data from on-chain multicall.
 *
 * Usage:
 *   import { inspectB20 } from "@/lib/b20/inspect";
 *   const info = await inspectB20("0xabc...", "mainnet");
 */

import { createPublicClient, http, formatUnits } from "viem";
import { base, baseSepolia } from "viem/chains";
import {
  B20_FACTORY_ADDRESS,
  POLICY_REGISTRY_ADDRESS,
  ALWAYS_ALLOW_POLICY_ID,
  SUPPLY_CAP_UNCAPPED,
  PAUSABLE_FEATURE,
  FACTORY_ABI,
  TOKEN_READ_ABI,
  ASSET_ABI,
  STABLECOIN_ABI,
  POLICY_REGISTRY_ABI,
} from "./inspect-abi";

// ── Network config ─────────────────────────────────────────────────────────────

const NETS = {
  mainnet: { chain: base,        rpc: "https://mainnet.base.org",  explorer: "https://basescan.org"         },
  sepolia: { chain: baseSepolia, rpc: "https://sepolia.base.org",  explorer: "https://sepolia.basescan.org" },
} as const;

// ── Output types ──────────────────────────────────────────────────────────────

export interface PolicyInfo {
  policyId:   string;   // uint64 as decimal string
  restricted: boolean;  // true when policyId !== 0 (ALWAYS_ALLOW)
  admin?:     string;   // policy admin address — set when restricted
}

export interface B20Inspection {
  address:  string;
  network:  "mainnet" | "sepolia";
  isB20:    boolean;
  initialized?: boolean;

  // Token basics — populated when isB20 = true
  name?:    string;
  symbol?:  string;
  decimals?: number;
  totalSupply?:          string;  // raw wei as decimal string
  totalSupplyFormatted?: string;  // human-readable (e.g. "1000000.0")

  // Variant
  variant?: "ASSET" | "STABLECOIN" | "UNKNOWN";
  multiplier?: string;  // ASSET only — raw uint256 as string (1e18 = no rebase)
  currency?:   string;  // STABLECOIN only — ISO currency code (e.g. "USD")

  // Supply cap
  supplyCap?:          string;  // raw uint256 as decimal string
  supplyCapFormatted?: string;  // human-readable or "uncapped"
  supplyCapUncapped?:  boolean;

  // Pause status for each feature
  paused?: {
    transfer: boolean;
    mint:     boolean;
    burn:     boolean;
  };

  // Policy gating for each scope
  policies?: {
    transferSender:   PolicyInfo;
    transferReceiver: PolicyInfo;
    transferExecutor: PolicyInfo;
    mintReceiver:     PolicyInfo;
  };

  // Basescan link
  explorerUrl: string;

  // Limitations disclosure
  _note: string;

  timestamp:    number;
  rpcLatencyMs: number;
}

// ── Helper ────────────────────────────────────────────────────────────────────

/** Extract result from a viem multicall entry (allowFailure: true) */
function ok<T>(r: unknown): T | undefined {
  const entry = r as { status: string; result?: T };
  return entry.status === "success" ? entry.result : undefined;
}

function safeFormat(raw: bigint, dec: number): string {
  try { return formatUnits(raw, dec); } catch { return raw.toString(); }
}

// ── Core ──────────────────────────────────────────────────────────────────────

export async function inspectB20(
  address: string,
  network: "mainnet" | "sepolia" = "mainnet",
): Promise<B20Inspection> {
  const t0      = Date.now();
  const net     = NETS[network];
  const client  = createPublicClient({ chain: net.chain, transport: http(net.rpc) });
  const addr    = address as `0x${string}`;
  const factory = B20_FACTORY_ADDRESS as `0x${string}`;
  const pReg    = POLICY_REGISTRY_ADDRESS as `0x${string}`;
  const explorer= `${net.explorer}/token/${address}`;

  // ── Round 1 ──────────────────────────────────────────────────────────────
  // Factory isB20 check + ERC-20 basics + pause + policy scope constants +
  // variant-specific reads (multiplier/currency, both with allowFailure).
  const r1 = await client.multicall({
    allowFailure: true,
    contracts: [
      // [0]  factory: isB20
      { address: factory, abi: FACTORY_ABI, functionName: "isB20",            args: [addr] },
      // [1]  factory: isB20Initialized
      { address: factory, abi: FACTORY_ABI, functionName: "isB20Initialized", args: [addr] },
      // [2]  name
      { address: addr, abi: TOKEN_READ_ABI, functionName: "name" },
      // [3]  symbol
      { address: addr, abi: TOKEN_READ_ABI, functionName: "symbol" },
      // [4]  decimals
      { address: addr, abi: TOKEN_READ_ABI, functionName: "decimals" },
      // [5]  totalSupply
      { address: addr, abi: TOKEN_READ_ABI, functionName: "totalSupply" },
      // [6]  supplyCap
      { address: addr, abi: TOKEN_READ_ABI, functionName: "supplyCap" },
      // [7]  isPaused(TRANSFER=0)
      { address: addr, abi: TOKEN_READ_ABI, functionName: "isPaused", args: [PAUSABLE_FEATURE.TRANSFER] },
      // [8]  isPaused(MINT=1)
      { address: addr, abi: TOKEN_READ_ABI, functionName: "isPaused", args: [PAUSABLE_FEATURE.MINT] },
      // [9]  isPaused(BURN=2)
      { address: addr, abi: TOKEN_READ_ABI, functionName: "isPaused", args: [PAUSABLE_FEATURE.BURN] },
      // [10] TRANSFER_SENDER_POLICY bytes32
      { address: addr, abi: TOKEN_READ_ABI, functionName: "TRANSFER_SENDER_POLICY" },
      // [11] TRANSFER_RECEIVER_POLICY bytes32
      { address: addr, abi: TOKEN_READ_ABI, functionName: "TRANSFER_RECEIVER_POLICY" },
      // [12] TRANSFER_EXECUTOR_POLICY bytes32
      { address: addr, abi: TOKEN_READ_ABI, functionName: "TRANSFER_EXECUTOR_POLICY" },
      // [13] MINT_RECEIVER_POLICY bytes32
      { address: addr, abi: TOKEN_READ_ABI, functionName: "MINT_RECEIVER_POLICY" },
      // [14] multiplier — Asset only; fails for Stablecoin
      { address: addr, abi: ASSET_ABI,      functionName: "multiplier" },
      // [15] currency — Stablecoin only; fails for Asset
      { address: addr, abi: STABLECOIN_ABI, functionName: "currency" },
    ],
  });

  // Fail-fast if factory confirms this is not a B20
  const isB20Val    = ok<boolean>(r1[0]);
  const initialized = ok<boolean>(r1[1]);

  if (!isB20Val) {
    return {
      address, network, isB20: false, initialized: false,
      explorerUrl: explorer,
      _note:       "Address is not registered as a B20 token by the B20Factory.",
      timestamp:   Date.now(),
      rpcLatencyMs: Date.now() - t0,
    };
  }

  // Parse Round 1 results
  const name        = ok<string>(r1[2]);
  const symbol      = ok<string>(r1[3]);
  const decimals    = ok<number>(r1[4]) ?? 18;
  const totalSupply = ok<bigint>(r1[5]);
  const supplyCap   = ok<bigint>(r1[6]);
  const pauseXfer   = ok<boolean>(r1[7]) ?? false;
  const pauseMint   = ok<boolean>(r1[8]) ?? false;
  const pauseBurn   = ok<boolean>(r1[9]) ?? false;
  const scopeSender = ok<`0x${string}`>(r1[10]);
  const scopeRcvr   = ok<`0x${string}`>(r1[11]);
  const scopeExec   = ok<`0x${string}`>(r1[12]);
  const scopeMint   = ok<`0x${string}`>(r1[13]);
  const multiplier  = ok<bigint>(r1[14]);
  const currency    = ok<string>(r1[15]);

  // Variant: prefer currency() (stablecoin) over multiplier() (asset)
  const variant: "ASSET" | "STABLECOIN" | "UNKNOWN" =
    currency    !== undefined ? "STABLECOIN" :
    multiplier  !== undefined ? "ASSET"      : "UNKNOWN";

  // Supply cap formatting
  const supplyCapUncapped   = supplyCap !== undefined && supplyCap >= SUPPLY_CAP_UNCAPPED;
  const supplyCapFormatted  = supplyCap === undefined ? undefined
    : supplyCapUncapped ? "uncapped"
    : safeFormat(supplyCap, decimals);

  // ── Round 2 — policyId per scope ─────────────────────────────────────────
  // Requires scope bytes32 values from Round 1.
  let policies: B20Inspection["policies"] | undefined;

  if (scopeSender && scopeRcvr && scopeExec && scopeMint) {
    const r2 = await client.multicall({
      allowFailure: true,
      contracts: [
        { address: addr, abi: TOKEN_READ_ABI, functionName: "policyId", args: [scopeSender] },
        { address: addr, abi: TOKEN_READ_ABI, functionName: "policyId", args: [scopeRcvr]   },
        { address: addr, abi: TOKEN_READ_ABI, functionName: "policyId", args: [scopeExec]   },
        { address: addr, abi: TOKEN_READ_ABI, functionName: "policyId", args: [scopeMint]   },
      ],
    });

    const pidSender = ok<bigint>(r2[0]) ?? ALWAYS_ALLOW_POLICY_ID;
    const pidRcvr   = ok<bigint>(r2[1]) ?? ALWAYS_ALLOW_POLICY_ID;
    const pidExec   = ok<bigint>(r2[2]) ?? ALWAYS_ALLOW_POLICY_ID;
    const pidMintR  = ok<bigint>(r2[3]) ?? ALWAYS_ALLOW_POLICY_ID;

    // ── Round 3 — policyAdmin for restricted policies ─────────────────────
    const uniqueRestricted = [
      ...new Set(
        [pidSender, pidRcvr, pidExec, pidMintR]
          .filter(id => id !== ALWAYS_ALLOW_POLICY_ID),
      ),
    ];

    const adminMap: Record<string, string> = {};
    if (uniqueRestricted.length > 0) {
      const r3 = await client.multicall({
        allowFailure: true,
        contracts: uniqueRestricted.map(id => ({
          address: pReg,
          abi:     POLICY_REGISTRY_ABI,
          functionName: "policyAdmin" as const,
          args: [id],
        })),
      });
      uniqueRestricted.forEach((id, i) => {
        const a = ok<string>(r3[i]);
        if (a) adminMap[id.toString()] = a;
      });
    }

    const mkPolicy = (id: bigint): PolicyInfo => ({
      policyId:   id.toString(),
      restricted: id !== ALWAYS_ALLOW_POLICY_ID,
      admin:      id !== ALWAYS_ALLOW_POLICY_ID ? adminMap[id.toString()] : undefined,
    });

    policies = {
      transferSender:   mkPolicy(pidSender),
      transferReceiver: mkPolicy(pidRcvr),
      transferExecutor: mkPolicy(pidExec),
      mintReceiver:     mkPolicy(pidMintR),
    };
  }

  return {
    address,
    network,
    isB20:       true,
    initialized,
    name,
    symbol,
    decimals,
    totalSupply:          totalSupply?.toString(),
    totalSupplyFormatted: totalSupply !== undefined ? safeFormat(totalSupply, decimals) : undefined,
    variant,
    multiplier:   multiplier?.toString(),
    currency,
    supplyCap:          supplyCap?.toString(),
    supplyCapFormatted,
    supplyCapUncapped,
    paused:  { transfer: pauseXfer, mint: pauseMint, burn: pauseBurn },
    policies,
    explorerUrl: explorer,
    // Role enumeration is intentionally absent — B20 does not expose
    // getRoleMemberCount / getRoleMembers (no AccessControlEnumerable).
    // Use hasRole(role, address) via the TOKEN_READ_ABI to verify specific accounts.
    _note: "Role holders cannot be enumerated — B20 omits AccessControlEnumerable. Call hasRole(role, address) for specific account checks.",
    timestamp:    Date.now(),
    rpcLatencyMs: Date.now() - t0,
  };
}
