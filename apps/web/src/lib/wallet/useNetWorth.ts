"use client";

/**
 * Cross-chain net worth, for the browser — one fetch of /api/wallet/net-worth,
 * exposed with the same three-state honesty the rest of the wallet uses.
 *
 * Types come in via `import type` ONLY: `net-worth.ts` pulls in Moralis, the RH
 * Blockscout client and the equity pricer, none of which may run client-side.
 * `import type` is erased before bundling, so the shape crosses the boundary
 * while the server code never does.
 *
 * This hook DERIVES nothing about money — it just carries the server's figures
 * and its `isFloor` verdict to the view. The summation, the de-dup, and the
 * "is this a lower bound" decision all live once, server-side, in net-worth.ts.
 */

import { useEffect, useState } from "react";
import type { NetWorth, NetWorthChain, ChainWorth } from "@/lib/wallet/net-worth";

export interface UseNetWorth {
  data: NetWorth | null;
  /** A request is in flight and no response has landed yet. */
  loading: boolean;
  /** A response arrived — even an error one. Distinct from `loading` so the view
   *  can tell "still reading" from "read, and here is what we got". */
  received: boolean;
  /** The response carried an `error` — the whole read failed. */
  failed: boolean;
  /** Per-chain figure, or undefined if that chain was absent (e.g. error read). */
  chain: (c: NetWorthChain) => ChainWorth | undefined;
}

export function useNetWorth(address?: string): UseNetWorth {
  const [data, setData] = useState<NetWorth | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) { setData(null); setLoading(false); return; }
    let off = false;
    setLoading(true);
    setData(null);
    fetch(`/api/wallet/net-worth?address=${address}`)
      .then((r) => r.json())
      .then((d: NetWorth) => { if (!off) setData(d); })
      .catch(() => {
        if (!off) setData({ address, chains: [], total: { usd: 0, isFloor: false }, ts: Date.now(), error: "load failed" });
      })
      .finally(() => { if (!off) setLoading(false); });
    return () => { off = true; };
  }, [address]);

  return {
    data,
    loading,
    received: data !== null,
    failed: !!data?.error,
    chain: (c: NetWorthChain): ChainWorth | undefined => data?.chains.find((x) => x.chain === c),
  };
}
