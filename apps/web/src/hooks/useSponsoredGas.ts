"use client";

/**
 * Sponsored gas, client half (server half: lib/paymaster-token.ts).
 *
 * A wallet saying it SUPPORTS a paymaster is no longer enough to promise
 * "gasless": since 2026-09-30 /api/paymaster only sponsors a signed-in wallet's
 * own operations. So a card asks two questions — can the wallet do it (its
 * EIP-5792 capability), and will we sponsor THIS wallet (a token from
 * /api/paymaster/token, which reads the SIWE session) — and shows the badge
 * only when both are yes.
 *
 * `freshUrl()` mints a new token at send time rather than reusing the one the
 * badge was drawn from: tokens live 15 minutes, and a card can sit open longer.
 * Null means "send without sponsorship" — never an error: not signed in, a
 * DIFFERENT wallet signed in (the paymaster would refuse its sender), or no
 * paymaster configured.
 */
import { useCallback, useEffect, useState } from "react";

export type SponsoredNetwork = "base" | "baseSepolia";

export async function fetchSponsoredPaymasterUrl(
  network: SponsoredNetwork,
  account: string | undefined,
): Promise<string | null> {
  if (!account || typeof window === "undefined") return null;
  try {
    const r = await fetch("/api/paymaster/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ network }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { token?: unknown; wallet?: unknown };
    if (typeof j.token !== "string" || typeof j.wallet !== "string") return null;
    if (j.wallet.toLowerCase() !== account.toLowerCase()) return null;
    return `${window.location.origin}/api/paymaster?network=${network}&t=${encodeURIComponent(j.token)}`;
  } catch {
    return null;
  }
}

export function useSponsoredGas(
  network: SponsoredNetwork,
  account: string | undefined,
  walletSupportsPaymaster: boolean,
) {
  const [sponsored, setSponsored] = useState(false);

  useEffect(() => {
    let live = true;
    if (!walletSupportsPaymaster || !account) {
      setSponsored(false);
      return;
    }
    fetchSponsoredPaymasterUrl(network, account).then((url) => {
      if (live) setSponsored(url !== null);
    });
    return () => { live = false; };
  }, [network, account, walletSupportsPaymaster]);

  const freshUrl = useCallback(
    () => (walletSupportsPaymaster ? fetchSponsoredPaymasterUrl(network, account) : Promise.resolve(null)),
    [network, account, walletSupportsPaymaster],
  );

  return { sponsored, freshUrl };
}
