"use client";

import { useName } from "@coinbase/onchainkit/identity";
import { base } from "viem/chains";

/**
 * Resolve a connected wallet to its Basename (e.g. "shun.base") via Base's
 * L2 resolver. Read-only, cached by react-query. Returns `name: null` while
 * loading or when the wallet has no Basename — callers fall back to the
 * short 0x… form so the UI degrades gracefully.
 */
export function useBasename(address?: string): { name: string | null; loading: boolean } {
  const { data, isLoading } = useName(
    { address: (address ?? undefined) as `0x${string}` | undefined, chain: base },
    { enabled: !!address },
  );
  return { name: (data as string | null) ?? null, loading: isLoading };
}

/** Display helper — Basename if present, else the short 0x… form. */
export function shortAddr(addr?: string): string {
  if (!addr) return "";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}
