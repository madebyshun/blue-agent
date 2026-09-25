/**
 * Blue Hood — ACP job state read straight from the contract.
 *
 * WHY THIS EXISTS. The seller cron drives itself from `agent.sessions`, which is
 * hydrated from `getActiveJobs()`. A job that reaches a terminal state leaves
 * that set IMMEDIATELY, while the cron only looks every 2 minutes — so the tick
 * that would have recorded "completed" usually never sees the job at all.
 * MEASURED 2026-09-25 across three jobs: 81118's rejection was caught (timing
 * luck), 81125's rejection was missed, and 81132's completion was missed even
 * though 0.45 USDC really arrived. Left alone, the ledger under-reports its own
 * revenue permanently, and the public read says the seller has earned nothing.
 *
 * So terminal state is reconciled from the chain instead of from the active set.
 * `getJob` is a view call with no credentials attached — the seller's signer is
 * not involved and nothing here can move funds.
 *
 * The contract address and ABI are NOT hardcoded here: they are passed in from
 * the SDK's own `ACP_CONTRACT_ADDRESSES` / `ACP_ABI` by the caller, which already
 * holds the runtime-imported module. That keeps the heavy SDK out of this file's
 * import graph (the seller is inert until configured, and a static import here
 * would silently undo that), and it means a redeployed ACP contract moves this
 * read with it rather than stranding a hex literal.
 */
import { createPublicClient, http, type Abi } from "viem";
import { base } from "viem/chains";

/** Mirrors `AgenticCommerceV3.JobStatus`. Index IS the on-chain uint8. */
const JOB_STATUS = ["open", "funded", "submitted", "completed", "rejected", "expired"] as const;

export type OnChainJobStatus = (typeof JOB_STATUS)[number];

export interface OnChainJob {
  status: OnChainJobStatus;
  /**
   * Escrow budget in whole USDC — the GROSS figure, not what the provider nets.
   * MEASURED on job 81132: budget 0.5, of which the provider received 0.45, a
   * fee recipient took 0.025, and 0.025 went to an address that is both the
   * job's `client` and its `evaluator` — so that leg cannot be classified as a
   * refund or an evaluator fee from this job alone. `getJob` exposes no net
   * field, and one observation is not a fee rate, so callers must not derive
   * earnings from this number.
   */
  budget_usdc: number;
}

/** USDC is 6-decimal on every chain ACP settles on. */
const USDC_DECIMALS = 6;

/**
 * Read one job's settled state. Returns null when the state is UNKNOWN — an
 * unsupported chain, an RPC failure, or a response that does not decode. Null
 * means "did not learn anything", never "not completed": the caller leaves the
 * ledger untouched rather than writing a guess.
 */
export async function readJobOnChain(args: {
  jobId: string;
  chainId: number;
  contract: string;
  /**
   * Taken as an opaque array so the SDK's `readonly [...]` const tuple passes
   * without the caller casting. The cast to viem's `Abi` is done here, beside
   * `decodeJob` — the runtime check that makes an untyped result safe.
   */
  abi: readonly unknown[];
}): Promise<OnChainJob | null> {
  if (args.chainId !== base.id) return null;
  // `BigInt("")` and `BigInt("  ")` are 0n, not a throw — so a blank id would
  // sail past the catch below and spend a real RPC call asking about job 0.
  if (!/^\d+$/.test(args.jobId.trim())) return null;
  let id: bigint;
  try {
    id = BigInt(args.jobId.trim());
  } catch {
    return null;
  }

  try {
    const client = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });
    const raw = await client.readContract({
      address: args.contract as `0x${string}`,
      abi: args.abi as Abi,
      functionName: "getJob",
      args: [id],
    });
    return decodeJob(raw);
  } catch {
    return null;
  }
}

/**
 * The ABI arrives as a runtime value, so viem cannot type the result and this
 * has to be checked rather than asserted. A malformed response reads as unknown
 * state, which the caller already handles safely.
 */
function decodeJob(raw: unknown): OnChainJob | null {
  if (typeof raw !== "object" || raw === null) return null;
  const job = raw as { status?: unknown; budget?: unknown };
  const idx = typeof job.status === "number" ? job.status : Number(job.status);
  if (!Number.isInteger(idx) || idx < 0 || idx >= JOB_STATUS.length) return null;
  if (typeof job.budget !== "bigint") return null;
  return {
    status: JOB_STATUS[idx],
    budget_usdc: Number(job.budget) / 10 ** USDC_DECIMALS,
  };
}
