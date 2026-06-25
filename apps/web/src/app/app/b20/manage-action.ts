"use server";

/**
 * Server action — loads all data needed for the Manage panel:
 *   inspect result, connected-wallet roles, policy scope hashes, token balance.
 */

import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";
import { inspectB20, type B20Inspection } from "@/lib/b20/inspect";
import { checkB20Roles, type B20RolesResult } from "@/lib/b20/roles";
import { TOKEN_READ_ABI } from "@/lib/b20/inspect-abi";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ScopeHashes {
  transferSender:   string;
  transferReceiver: string;
  transferExecutor: string;
  mintReceiver:     string;
}

export interface ManageData {
  inspect:     B20Inspection;
  roles:       B20RolesResult;
  scopeHashes: ScopeHashes;
  balance:     string;  // wallet token balance — raw uint256 as decimal string
}

// ── Network config ─────────────────────────────────────────────────────────────

const NETS = {
  mainnet: { chain: base,        rpc: "https://mainnet.base.org"  },
  sepolia: { chain: baseSepolia, rpc: "https://sepolia.base.org"  },
} as const;

// ── Balance ABI (minimal, not in TOKEN_READ_ABI) ──────────────────────────────

const BALANCE_ABI = [{
  type: "function" as const, name: "balanceOf" as const, stateMutability: "view" as const,
  inputs:  [{ name: "account", type: "address" as const }],
  outputs: [{ type: "uint256" as const }],
}] as const;

// ── Helper ─────────────────────────────────────────────────────────────────────

function ok<T>(r: unknown): T | undefined {
  const e = r as { status: string; result?: T };
  return e.status === "success" ? e.result : undefined;
}

// ── Core ──────────────────────────────────────────────────────────────────────

/**
 * Fetches inspect + wallet roles + policy scope hashes + wallet balance in one shot.
 * Used by the Manage tab and the Scanner inline panel.
 */
export async function runB20ManageLoad(
  token:   string,
  wallet:  string,
  network: "mainnet" | "sepolia",
): Promise<ManageData> {
  if (!/^0x[a-fA-F0-9]{40}$/.test(token)) {
    throw new Error("Invalid token address");
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    throw new Error("Invalid wallet address");
  }

  // Run inspect + roles concurrently
  const [inspect, roles] = await Promise.all([
    inspectB20(token, network),
    checkB20Roles(token, wallet, network),
  ]);

  if (!inspect.isB20) {
    return {
      inspect,
      roles,
      scopeHashes: { transferSender: "", transferReceiver: "", transferExecutor: "", mintReceiver: "" },
      balance: "0",
    };
  }

  // Fetch scope hashes + wallet balance in one multicall
  const net    = NETS[network];
  const client = createPublicClient({ chain: net.chain, transport: http(net.rpc, { timeout: 15_000 }) });
  const addr   = token  as `0x${string}`;
  const acct   = wallet as `0x${string}`;

  const results = await client.multicall({
    allowFailure: true,
    contracts: [
      { address: addr, abi: TOKEN_READ_ABI, functionName: "TRANSFER_SENDER_POLICY"   },
      { address: addr, abi: TOKEN_READ_ABI, functionName: "TRANSFER_RECEIVER_POLICY" },
      { address: addr, abi: TOKEN_READ_ABI, functionName: "TRANSFER_EXECUTOR_POLICY" },
      { address: addr, abi: TOKEN_READ_ABI, functionName: "MINT_RECEIVER_POLICY"     },
      { address: addr, abi: BALANCE_ABI,    functionName: "balanceOf", args: [acct]  },
    ],
  });

  const scopeHashes: ScopeHashes = {
    transferSender:   (ok<string>(results[0]) ?? "") as string,
    transferReceiver: (ok<string>(results[1]) ?? "") as string,
    transferExecutor: (ok<string>(results[2]) ?? "") as string,
    mintReceiver:     (ok<string>(results[3]) ?? "") as string,
  };
  const balance = (ok<bigint>(results[4]) ?? 0n).toString();

  return { inspect, roles, scopeHashes, balance };
}

/**
 * Lightweight roles-only load — used by the Scanner inline panel
 * to check if the connected wallet holds any management role.
 */
export async function runB20WalletRoles(
  token:   string,
  wallet:  string,
  network: "mainnet" | "sepolia",
): Promise<B20RolesResult> {
  if (!/^0x[a-fA-F0-9]{40}$/.test(token)  ) throw new Error("Invalid token");
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) throw new Error("Invalid wallet");
  return checkB20Roles(token, wallet, network);
}
