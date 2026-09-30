/**
 * DCA (Dollar-Cost Average) schedule types.
 *
 * A schedule is a recurring buy authorized by the user via ERC-20 approve()
 * on their sell-side token (e.g. USDC). A per-user keeper wallet, derived
 * deterministically from `KEEPER_MASTER_KEY` + userAddress, executes the buy
 * on a cron by pulling `sellAmountPerRun` via `transferFrom`, then swapping
 * through the 0x API and forwarding the received `buyToken` to the user.
 *
 * Storage: schedules live in KV under `dca:schedule:<id>`. A user index at
 * `dca:user:<address>:schedules` (list of IDs) enables cheap per-user lookup.
 * The active set `dca:active` was the cron's work queue.
 *
 * RETIRED 2026-09-30 (docs/rebuild-5-tang-2026-09-30.md §1): no schedule is
 * created or executed any more. The records stay in KV as evidence, and these
 * types stay because the exit (list / logs / cancel, and the DcaCard revoke)
 * still reads them.
 */

import type { Address, Hex } from "viem";

export type DcaStatus = "active" | "paused" | "cancelled" | "expired" | "failed";

export type DcaFrequency = "hourly" | "6h" | "12h" | "daily" | "weekly";

export type DcaSchedule = {
  id: string;                    // uuid v4
  userAddress: Address;          // owner (lowercased)
  keeperAddress: Address;        // per-user derived session key
  chainId: number;               // 8453 for Base v1

  sellToken: Address;
  sellTokenSymbol: string;
  sellTokenDecimals: number;
  sellAmountPerRun: string;      // bigint string, in sell-token base units

  buyToken: Address;
  buyTokenSymbol: string;
  buyTokenDecimals: number;

  frequency: DcaFrequency;
  frequencySec: number;          // resolved from frequency
  slippageBps: number;           // 100 = 1%

  totalAllowance: string;        // bigint string — sellAmount × totalRuns (with fee)
  totalRuns: number;             // planned runs
  expiresAt: number;             // unix sec — schedule auto-expires

  feeBps: number;                // 50 = 0.5% keeper reimbursement markup

  status: DcaStatus;
  createdAt: number;             // unix sec
  lastRunAt: number | null;
  nextRunAt: number;             // next scheduled execution unix sec
  runsCompleted: number;
  runsFailed: number;
  totalSpent: string;            // bigint string
  totalBought: string;           // bigint string
  lastError: string | null;
};

export type DcaExecutionLog = {
  scheduleId: string;
  runNumber: number;
  timestamp: number;
  txHash: Hex | null;
  approveHash: Hex | null;       // if keeper had to approve 0x allowance target
  status: "success" | "failed" | "skipped";
  sellAmount: string;            // bigint
  buyAmount: string;             // bigint (0 on non-success)
  effectivePrice: string | null; // human decimal price (buy per sell)
  gasSpentWei: string;
  error: string | null;
};
