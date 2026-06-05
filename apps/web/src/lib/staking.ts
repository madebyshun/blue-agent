/**
 * staking.ts — BlueMarketStaking contract client
 *
 * Reads on-chain stake data and credit accrual from BlueMarketStaking.
 * Backend uses pendingCreditsSince() to check credits earned since last sync.
 *
 * Contract: 0x69e539684EE48F71eCDAd58618d8e8a2423E279d (Base mainnet)
 * BLUE:     0xf895783b2931c919955e18b5e3343e7c7c456ba3
 * USDC:     0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
 */

import { createPublicClient, http, parseAbi } from "viem";
import { base } from "viem/chains";

// ── Contract address ──────────────────────────────────────────────────────────

export const STAKING_ADDRESS = (
  process.env.NEXT_PUBLIC_STAKING_CONTRACT ?? ""
) as `0x${string}`;

// ── ABI (read functions only) ─────────────────────────────────────────────────

const STAKING_ABI = parseAbi([
  // Views
  "function totalCreditsAccrued(address user) view returns (uint256)",
  "function pendingCreditsSince(address user, uint256 since) view returns (uint256)",
  "function creditsPerDay(address user) view returns (uint256)",
  "function pendingYield(address user) view returns (uint256)",
  "function cooldownRemaining(address user) view returns (uint256)",
  "function stakeInfo(address user) view returns (uint256 amount, uint256 stakedAt, uint256 dailyCredits, uint256 cooldown, uint256 pendingUsdc)",
  "function totalStaked() view returns (uint256)",
  "function stakes(address) view returns (uint256 amount, uint256 stakedAt, uint256 lastAccruedAt, uint256 accruedCredits, uint256 unstakeRequestedAt, uint256 yieldDebt)",
]);

// ── RPC client ────────────────────────────────────────────────────────────────

const client = createPublicClient({
  chain:     base,
  transport: http("https://mainnet.base.org"),
});

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StakingInfo {
  amount:       bigint;   // BLUE staked (wei)
  stakedAt:     bigint;   // timestamp
  dailyCredits: bigint;   // credits per day at current stake
  cooldown:     bigint;   // seconds until unstake available (0 = none)
  pendingUsdc:  bigint;   // unclaimed USDC yield (6 decimals)
}

// ── Read functions ────────────────────────────────────────────────────────────

export async function getStakingInfo(address: `0x${string}`): Promise<StakingInfo | null> {
  if (!STAKING_ADDRESS) return null;
  try {
    const [amount, stakedAt, dailyCredits, cooldown, pendingUsdc] =
      await client.readContract({
        address: STAKING_ADDRESS,
        abi:     STAKING_ABI,
        functionName: "stakeInfo",
        args: [address],
      }) as [bigint, bigint, bigint, bigint, bigint];

    return { amount, stakedAt, dailyCredits, cooldown, pendingUsdc };
  } catch {
    return null;
  }
}

/**
 * Get credits earned since a specific timestamp.
 * Backend uses this to check new credits since last message.
 */
export async function getCreditsSince(
  address: `0x${string}`,
  since: number,
): Promise<bigint> {
  if (!STAKING_ADDRESS) return 0n;
  try {
    return await client.readContract({
      address: STAKING_ADDRESS,
      abi:     STAKING_ABI,
      functionName: "pendingCreditsSince",
      args: [address, BigInt(since)],
    }) as bigint;
  } catch {
    return 0n;
  }
}

/**
 * Total credits ever accrued (snapshotted + live).
 * Backend subtracts its own usage ledger to get available credits.
 */
export async function getTotalCreditsAccrued(address: `0x${string}`): Promise<bigint> {
  if (!STAKING_ADDRESS) return 0n;
  try {
    return await client.readContract({
      address: STAKING_ADDRESS,
      abi:     STAKING_ABI,
      functionName: "totalCreditsAccrued",
      args: [address],
    }) as bigint;
  } catch {
    return 0n;
  }
}

/**
 * Credits per day at current stake level.
 * Used for display in Blue Chat UI.
 */
export async function getCreditsPerDay(address: `0x${string}`): Promise<number> {
  if (!STAKING_ADDRESS) return 0;
  try {
    const cr = await client.readContract({
      address: STAKING_ADDRESS,
      abi:     STAKING_ABI,
      functionName: "creditsPerDay",
      args: [address],
    }) as bigint;
    return Number(cr);
  } catch {
    return 0;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format BLUE amount (wei) to human-readable string */
export function formatBlue(wei: bigint): string {
  const whole = Number(wei) / 1e18;
  if (whole >= 1_000_000) return (whole / 1_000_000).toFixed(1) + "M";
  if (whole >= 1_000)     return (whole / 1_000).toFixed(0) + "K";
  return whole.toFixed(0);
}

/** Format USDC (6 decimals) to human-readable string */
export function formatUsdc(micro: bigint): string {
  return "$" + (Number(micro) / 1_000_000).toFixed(2);
}
