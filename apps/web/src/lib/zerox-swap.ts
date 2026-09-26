/**
 * 0x Swap API (v2, AllowanceHolder) response helpers for Base 8453.
 *
 * Lives here rather than inside `app/api/mcp/route.ts` for two reasons: a Next
 * App Router route file may not carry arbitrary named exports without failing
 * the build's route-type check, and this logic is the kind that needs a test
 * pointed straight at it — see `scripts/swap-native-token-test.ts`.
 */
import { buildErc20ApproveData } from "@/lib/robinhood/swap";

/** Base mainnet. Stated, never inferred — CLAUDE.md hard rule #1. */
const BASE_CHAIN_ID = 8453;

export type SwapApprove = {
  /** Retained from the original shape so existing readers keep working. */
  token: string;
  spender: string;
  /** Added: the actual signable transaction, same shape as blue_bridge_tx's. */
  to: string;
  data: `0x${string}`;
  value: string;
  chainId: number;
  amount: string;
  note: string;
};

/**
 * The ERC-20 approve an AllowanceHolder swap needs first — as SIGNABLE CALLDATA.
 *
 * ── Two defects fixed here (P1-4), and the first one is the quiet one ────────
 *
 * 1. WRONG FIELD, so this was ALWAYS null. The old code read
 *    `data.allowanceTarget`, which is a 0x Swap API **v1** field. The route
 *    calls v2 (`0x-version: v2`), and v2 reports the allowance requirement at
 *    `issues.allowance.spender` — as `app/bank/SwapCard.tsx` has always known;
 *    its own `Quote` type declares `issues.allowance` and nothing else. So
 *    `approve` was not merely thin, it was absent on every ERC-20 sell, telling
 *    the agent no approval was needed at the exact moment one was. The browser
 *    card read this correctly and the agent path did not, from the very same
 *    upstream response. v1's field is kept as a fallback below purely so a
 *    future downgrade degrades instead of silently re-breaking.
 *
 * 2. NO CALLDATA. Even populated, `{ token, spender }` is a description of a
 *    transaction, not a transaction. An agent cannot sign a sentence — it had
 *    to know the ERC-20 ABI and encode `approve` itself, which is a correctness
 *    problem and not an inconvenience: an approve encoded under the wrong
 *    exponent is either 10^n too small (the swap reverts AFTER the user has
 *    already paid gas for the approve) or 10^n too large (a standing grant over
 *    a balance they meant to spend a slice of). `blue_bridge_tx` already
 *    returns its approve as `{ to, data, value, chainId }`; that shape is
 *    matched verbatim here so an agent holding both needs one code path.
 *
 * The amount approved is EXACTLY `amountInBase` — the same base-unit integer
 * that was quoted and that the swap will pull, scaled from decimals read off
 * the token contract on Base. Never unlimited: this tool hands back an unsigned
 * transaction, and quietly widening it to an infinite allowance would grant
 * something the user never asked for.
 *
 * Returns null for native ETH (not an ERC-20, can never need an allowance) and
 * for a quote that reports no allowance issue — null here means "0x did not ask
 * for one", which is a real answer, not a missing one.
 */
export function buildBaseApprove(
  quote: Record<string, unknown>,
  tokenIn: string,
  amountInBase: string,
  inIsNative: boolean,
): SwapApprove | null {
  if (inIsNative) return null;

  const issues = (quote.issues ?? {}) as Record<string, unknown>;
  const allowance = (issues.allowance ?? null) as { spender?: string } | null;
  const spender = allowance?.spender ?? (quote.allowanceTarget as string | undefined);
  if (!spender || !/^0x[a-fA-F0-9]{40}$/.test(spender)) return null;
  if (!/^\d+$/.test(amountInBase)) return null;

  // Chain-agnostic ERC-20 `approve` encoder. It sits under lib/robinhood/
  // because that is where its first caller was, but nothing in it is
  // RH-specific — approve(address,uint256) is the same four bytes on Base 8453.
  // Reused rather than re-encoded so this repo has one ERC-20 ABI, not two.
  const data = buildErc20ApproveData(spender as `0x${string}`, BigInt(amountInBase));
  return {
    token: tokenIn,
    spender,
    to: tokenIn,
    data,
    value: "0",
    chainId: BASE_CHAIN_ID,
    amount: amountInBase,
    note: "Approve before the swap if current allowance is short. Unsigned — sign it in your own wallet on Base 8453.",
  };
}
