/**
 * B20 Role Checker — hasRole multicall for 7 roles on a token+wallet pair.
 * Server-side only (uses Node.js / viem).
 *
 * Roles checked:
 *   DEFAULT_ADMIN_ROLE, MINT_ROLE, BURN_ROLE, BURN_BLOCKED_ROLE,
 *   PAUSE_ROLE, UNPAUSE_ROLE, METADATA_ROLE
 *
 * Note: B20 omits AccessControlEnumerable — there is no way to enumerate
 * all holders of a role. This tool checks if a SPECIFIC wallet holds each role.
 */

import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";
import { TOKEN_READ_ABI } from "./inspect-abi";

// ── Network config ─────────────────────────────────────────────────────────────

const NETS = {
  mainnet: { chain: base,        rpc: "https://mainnet.base.org"  },
  sepolia: { chain: baseSepolia, rpc: "https://sepolia.base.org"  },
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RoleEntry {
  name:    string;          // human-readable role name
  roleKey: string;          // function name on the token contract
  hash:    string | null;   // bytes32 hash returned by the token (or null on failure)
  held:    boolean | null;  // null = could not determine
}

export interface B20RolesResult {
  token:      string;
  wallet:     string;
  network:    "mainnet" | "sepolia";
  roles:      RoleEntry[];
  checkedAt:  number;
}

// ── Role definitions ──────────────────────────────────────────────────────────

const ROLE_DEFS: Array<{ name: string; key: string }> = [
  { name: "Default Admin",   key: "DEFAULT_ADMIN_ROLE" },
  { name: "Mint",            key: "MINT_ROLE"          },
  { name: "Burn",            key: "BURN_ROLE"          },
  { name: "Burn Blocked",    key: "BURN_BLOCKED_ROLE"  },
  { name: "Pause",           key: "PAUSE_ROLE"         },
  { name: "Unpause",         key: "UNPAUSE_ROLE"       },
  { name: "Metadata",        key: "METADATA_ROLE"      },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok<T>(r: unknown): T | undefined {
  const entry = r as { status: string; result?: T };
  return entry.status === "success" ? entry.result : undefined;
}

// ── Core ──────────────────────────────────────────────────────────────────────

/**
 * Checks which of the 7 B20 roles a wallet holds on a given token.
 * Uses two multicall rounds: (1) fetch role hashes, (2) hasRole per hash.
 */
export async function checkB20Roles(
  token:   string,
  wallet:  string,
  network: "mainnet" | "sepolia",
): Promise<B20RolesResult> {
  const net    = NETS[network];
  const client = createPublicClient({ chain: net.chain, transport: http(net.rpc, { timeout: 15_000 }) });
  const addr   = token  as `0x${string}`;
  const acct   = wallet as `0x${string}`;

  // ── Round 1: fetch role hash constants from the token ─────────────────────
  const hashResults = await client.multicall({
    allowFailure: true,
    contracts: [
      { address: addr, abi: TOKEN_READ_ABI, functionName: "DEFAULT_ADMIN_ROLE" },
      { address: addr, abi: TOKEN_READ_ABI, functionName: "MINT_ROLE"          },
      { address: addr, abi: TOKEN_READ_ABI, functionName: "BURN_ROLE"          },
      { address: addr, abi: TOKEN_READ_ABI, functionName: "BURN_BLOCKED_ROLE"  },
      { address: addr, abi: TOKEN_READ_ABI, functionName: "PAUSE_ROLE"         },
      { address: addr, abi: TOKEN_READ_ABI, functionName: "UNPAUSE_ROLE"       },
      { address: addr, abi: TOKEN_READ_ABI, functionName: "METADATA_ROLE"      },
    ],
  });

  // DEFAULT_ADMIN_ROLE is always 0x00…00 even if the call fails
  const DEFAULT_ADMIN_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;
  const hashes: Array<`0x${string}` | null> = hashResults.map((r, i) => {
    const h = ok<`0x${string}`>(r);
    if (h) return h;
    return i === 0 ? DEFAULT_ADMIN_HASH : null;
  });

  // ── Round 2: hasRole(hash, wallet) for each role ──────────────────────────
  const hasRoleContracts = hashes.map(hash => ({
    address:      addr,
    abi:          TOKEN_READ_ABI,
    functionName: "hasRole" as const,
    args:         [hash ?? DEFAULT_ADMIN_HASH, acct] as [`0x${string}`, `0x${string}`],
  }));

  const hasRoleResults = await client.multicall({
    allowFailure: true,
    contracts: hasRoleContracts,
  });

  const roles: RoleEntry[] = ROLE_DEFS.map((def, i) => ({
    name:    def.name,
    roleKey: def.key,
    hash:    hashes[i] ?? null,
    held:    hashes[i] === null ? null : (ok<boolean>(hasRoleResults[i]) ?? null),
  }));

  return { token, wallet, network, roles, checkedAt: Date.now() };
}
