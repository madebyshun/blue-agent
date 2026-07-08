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
