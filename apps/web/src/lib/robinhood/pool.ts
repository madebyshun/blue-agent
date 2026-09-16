// Robinhood Chain (4663) pool discovery + price helpers for the swap UI.
//
// Kept server-side + non-custodial: no signing keys, no wallet state — just
// public RPC reads. The router itself (see swap.ts) is what actually executes
// the swap under the user's own wallet.

import { createPublicClient, http, getAddress } from "viem";
import { robinhoodMainnet } from "./chains";
import {
  ROBINHOOD_MAINNET_VERIFIED_FACTORY,
  ROBINHOOD_MAINNET_VERIFIED_WETH9,
} from "./swap";

// Uniswap V3's four canonical fee tiers, in hundredths of a bip.
export const V3_FEE_TIERS = [100, 500, 3000, 10000] as const;
export type V3FeeTier = (typeof V3_FEE_TIERS)[number];

const FACTORY_ABI = [
  {
    type: "function",
    name: "getPool",
    stateMutability: "view",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "fee", type: "uint24" },
    ],
    outputs: [{ type: "address" }],
  },
] as const;

const POOL_ABI = [
  {
    type: "function",
    name: "liquidity",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint128" }],
  },
  {
    type: "function",
    name: "token0",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "token1",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

// One shared viem client for all pool reads. Robinhood's mainnet RPC is
// public + rate-limited generously enough for on-demand modal reads.
const client = createPublicClient({
  chain: robinhoodMainnet,
  transport: http("https://rpc.mainnet.chain.robinhood.com"),
});

export interface PoolInfo {
  fee: V3FeeTier;
  address: `0x${string}`;
  liquidity: string; // uint128 as decimal string
  token0: `0x${string}`;
  token1: `0x${string}`;
}

/**
 * Probe every Uniswap V3 fee tier for a token/WETH pool on Robinhood Chain.
 * Returns every pool that (a) exists (factory.getPool != 0) and (b) has
 * non-zero active liquidity. Callers pick the deepest one (max liquidity).
 *
 * Non-custodial + read-only. If the token has no pool at all, returns [].
 */
export async function findWethPools(
  token: `0x${string}`,
): Promise<PoolInfo[]> {
  const weth = ROBINHOOD_MAINNET_VERIFIED_WETH9 as `0x${string}`;
  const factory = ROBINHOOD_MAINNET_VERIFIED_FACTORY as `0x${string}`;

  // getPool for all 4 tiers in parallel.
  const addresses = await Promise.all(
    V3_FEE_TIERS.map((fee) =>
      client
        .readContract({
          address: factory,
          abi: FACTORY_ABI,
          functionName: "getPool",
          args: [token, weth, fee],
        })
        .catch(() => "0x0000000000000000000000000000000000000000" as `0x${string}`),
    ),
  );

  // For every non-zero pool, read liquidity + token0/1 in parallel.
  const live = await Promise.all(
    addresses.map(async (addr, i): Promise<PoolInfo | null> => {
      if (addr === "0x0000000000000000000000000000000000000000") return null;
      try {
        const [liq, token0, token1] = await Promise.all([
          client.readContract({ address: addr, abi: POOL_ABI, functionName: "liquidity" }),
          client.readContract({ address: addr, abi: POOL_ABI, functionName: "token0" }),
          client.readContract({ address: addr, abi: POOL_ABI, functionName: "token1" }),
        ]);
        if ((liq as bigint) === 0n) return null;
        return {
          fee: V3_FEE_TIERS[i],
          address: getAddress(addr) as `0x${string}`,
          liquidity: (liq as bigint).toString(),
          token0: getAddress(token0 as string) as `0x${string}`,
          token1: getAddress(token1 as string) as `0x${string}`,
        };
      } catch {
        return null;
      }
    }),
  );

  return live.filter((p): p is PoolInfo => !!p);
}

/**
 * Pick the pool with the deepest liquidity from a set returned by findWethPools.
 * Undefined if the input is empty.
 */
export function bestPool(pools: PoolInfo[]): PoolInfo | undefined {
  if (!pools.length) return undefined;
  return pools.reduce((best, p) =>
    BigInt(p.liquidity) > BigInt(best.liquidity) ? p : best,
  );
}

// ── Three-state probe ────────────────────────────────────────────────────────
//
// `findWethPools` above catches EVERY read error into a skipped tier and returns
// `[]`, so "this token has no pool" and "the RPC would not talk to us" arrive as
// the same value. That is the right shape for its five paid callers — they want
// a route or nothing — and the wrong shape for a UI gate, for one specific
// reason: the gate does not just decide whether to draw a button, it decides
// what SENTENCE sits in the button's place. "No pool to sell into" is a claim
// about the chain; an RPC timeout cannot support it. Same defect as reading a
// rate-limited balance call as 0n (#259), one layer up.
//
// So this returns the third state instead of rounding it into the second. The
// BUTTON treats `unreadable` exactly like `none` — fail closed, no affordance we
// cannot back — while the LABEL says which of the two it actually is.

export type SellProbe =
  /** Measured: a V3 token/WETH pool with non-zero liquidity. Sellable. */
  | { state: "pool"; fee: V3FeeTier; address: `0x${string}`; liquidity: string }
  /** Measured: every fee tier answered, none holds a live pool. */
  | { state: "none" }
  /** NOT measured. Never render this as a fact about the token. */
  | { state: "unreadable"; reason: string };

/**
 * Can this token be sold for ETH on Robinhood Chain right now?
 *
 * Exactly the question `/api/robinhood/router/swap-prepare` asks in its `sell`
 * mode: that path builds ONE `swapExactInputSingleForETH` against a fee tier, so
 * a live token/WETH pool is not merely a good sign — it is the whole route. No
 * pool, no fill.
 *
 * Read-only: `getPool` + `liquidity`, no keys, no funds, nothing signed.
 *
 * The failure accounting is the point. A tier that THREW is not a tier that said
 * "no": if three tiers report no pool and the fourth times out, the fourth is
 * where the pool would be, and answering `none` would be asserting something we
 * did not read. Any unread tier, with no live pool found elsewhere, resolves to
 * `unreadable`.
 */
export async function probeWethPool(token: `0x${string}`): Promise<SellProbe> {
  const weth = ROBINHOOD_MAINNET_VERIFIED_WETH9 as `0x${string}`;
  const factory = ROBINHOOD_MAINNET_VERIFIED_FACTORY as `0x${string}`;
  const ZERO = "0x0000000000000000000000000000000000000000";

  // Selling WETH for ETH is an unwrap, not a swap — there is no WETH/WETH pool
  // and the router would have nothing to route. Answered here rather than left
  // to produce a confusing `none`.
  if (token.toLowerCase() === weth.toLowerCase()) {
    return { state: "none" };
  }

  type Tier = { ok: true; addr: string } | { ok: false };
  const tiers: Tier[] = await Promise.all(
    V3_FEE_TIERS.map((fee) =>
      client
        .readContract({
          address: factory,
          abi: FACTORY_ABI,
          functionName: "getPool",
          args: [token, weth, fee],
        })
        .then((addr): Tier => ({ ok: true, addr: addr as string }))
        // NOT folded into ZERO. A refused call is not a factory saying "none" —
        // that conflation is the whole reason this function exists.
        .catch((): Tier => ({ ok: false })),
    ),
  );

  // Nothing answered at all: the RPC is down, not the pools.
  if (tiers.every((t) => !t.ok)) {
    return { state: "unreadable", reason: "Robinhood Chain RPC did not answer" };
  }

  type Live = { fee: V3FeeTier; address: `0x${string}`; liquidity: bigint };
  type Read = { live: Live } | { empty: true } | { failed: true };

  const reads: Read[] = await Promise.all(
    tiers.map(async (t, i): Promise<Read> => {
      if (!t.ok) return { failed: true };
      if (t.addr === ZERO) return { empty: true };
      try {
        const liq = (await client.readContract({
          address: t.addr as `0x${string}`,
          abi: POOL_ABI,
          functionName: "liquidity",
        })) as bigint;
        // A deployed pool with zero active liquidity is a real, measured "you
        // cannot fill here" — the pool exists and has nothing in it.
        if (liq === 0n) return { empty: true };
        return { live: { fee: V3_FEE_TIERS[i], address: getAddress(t.addr) as `0x${string}`, liquidity: liq } };
      } catch {
        return { failed: true };
      }
    }),
  );

  const live = reads.flatMap((r) => ("live" in r ? [r.live] : []));
  if (live.length) {
    // Deepest wins, same rule as `bestPool` — the fee tier travels with the
    // answer because swap-prepare needs it to build the call.
    const best = live.reduce((a, b) => (b.liquidity > a.liquidity ? b : a));
    return { state: "pool", fee: best.fee, address: best.address, liquidity: best.liquidity.toString() };
  }

  // No live pool, and at least one tier we never actually read. The pool could
  // be in the tier that failed, so "none" is not ours to say.
  if (reads.some((r) => "failed" in r)) {
    return { state: "unreadable", reason: "one or more fee tiers could not be read" };
  }

  return { state: "none" };
}
