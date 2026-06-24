/**
 * B20 Transfer Simulator — uses viem simulateContract (eth_call) to predict
 * whether a token transfer will succeed or revert and why.
 *
 * Server-side only (uses Node.js / viem).
 *
 * Note: this is a READ-ONLY simulation — no transaction is broadcast.
 * The simulation runs in the current block state:
 *   - If the token is paused   → revert classified as "paused"
 *   - If policy forbids it     → revert classified as "policy_forbids"
 *   - If sender lacks balance  → revert classified as "insufficient_balance"
 *   - Other revert             → "other_revert"
 *   - No revert                → "success"
 */

import { createPublicClient, http, parseUnits } from "viem";
import { base, baseSepolia } from "viem/chains";

// ── Network config ─────────────────────────────────────────────────────────────

const NETS = {
  mainnet: { chain: base,        rpc: "https://mainnet.base.org"  },
  sepolia: { chain: baseSepolia, rpc: "https://sepolia.base.org"  },
} as const;

// ── ABIs ──────────────────────────────────────────────────────────────────────

const TRANSFER_ABI = [
  {
    type: "function" as const,
    name: "transfer",
    stateMutability: "nonpayable" as const,
    inputs:  [{ name: "to", type: "address" as const }, { name: "amount", type: "uint256" as const }],
    outputs: [{ type: "bool" as const }],
  },
] as const;

const DECIMALS_ABI = [
  {
    type: "function" as const,
    name: "decimals",
    stateMutability: "view" as const,
    inputs:  [],
    outputs: [{ type: "uint8" as const }],
  },
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export type SimulateOutcome =
  | "success"
  | "paused"
  | "policy_forbids"
  | "insufficient_balance"
  | "other_revert";

export interface B20SimulateResult {
  token:        string;
  sender:       string;
  receiver:     string;
  amount:       string;  // as user entered
  amountWei:    string;  // parsed bigint string
  network:      "mainnet" | "sepolia";
  outcome:      SimulateOutcome;
  revertReason?: string;
  gasEstimate?:  string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function classifyRevert(msg: string): SimulateOutcome {
  const m = msg.toLowerCase();
  if (m.includes("paused") || m.includes("pause"))
    return "paused";
  if (
    m.includes("policy")   || m.includes("forbidden") ||
    m.includes("not allowed") || m.includes("unauthorized") ||
    m.includes("allowlist") || m.includes("blocklist") ||
    m.includes("blocked")  || m.includes("restrict")
  )
    return "policy_forbids";
  if (m.includes("insufficient") || m.includes("balance") || m.includes("exceeds"))
    return "insufficient_balance";
  return "other_revert";
}

// ── Core ──────────────────────────────────────────────────────────────────────

/**
 * Simulates `token.transfer(receiver, amount)` sent from `sender`.
 * `amount` is a human-readable number (e.g. "100" or "0.5").
 * The token's decimals are fetched first to convert to wei.
 */
export async function simulateB20Transfer(
  token:    string,
  sender:   string,
  receiver: string,
  amount:   string,
  network:  "mainnet" | "sepolia",
): Promise<B20SimulateResult> {
  const net    = NETS[network];
  const client = createPublicClient({ chain: net.chain, transport: http(net.rpc, { timeout: 15_000 }) });
  const addr   = token    as `0x${string}`;
  const from   = sender   as `0x${string}`;
  const to     = receiver as `0x${string}`;

  // 1. Fetch decimals
  let decimals = 18;
  try {
    decimals = await client.readContract({
      address:      addr,
      abi:          DECIMALS_ABI,
      functionName: "decimals",
    }) as number;
  } catch { /* use default 18 */ }

  // 2. Parse amount to wei
  let amountWei: bigint;
  try {
    amountWei = parseUnits(amount.trim(), decimals);
  } catch {
    // Fallback: treat as integer wei string
    try { amountWei = BigInt(amount.trim()); }
    catch { amountWei = 1n; }
  }

  // 3. Simulate the transfer
  try {
    await client.simulateContract({
      address:      addr,
      abi:          TRANSFER_ABI,
      functionName: "transfer",
      args:         [to, amountWei],
      account:      from,
    });

    // Estimate gas on success
    let gasEstimate: string | undefined;
    try {
      const gas = await client.estimateContractGas({
        address:      addr,
        abi:          TRANSFER_ABI,
        functionName: "transfer",
        args:         [to, amountWei],
        account:      from,
      });
      gasEstimate = gas.toString();
    } catch { /* gas estimate is optional */ }

    return {
      token, sender, receiver, amount,
      amountWei: amountWei.toString(),
      network,
      outcome:     "success",
      gasEstimate,
    };
  } catch (e: unknown) {
    const msg = (e instanceof Error) ? e.message : String(e);
    return {
      token, sender, receiver, amount,
      amountWei: amountWei.toString(),
      network,
      outcome:      classifyRevert(msg),
      revertReason: msg.slice(0, 500),
    };
  }
}
