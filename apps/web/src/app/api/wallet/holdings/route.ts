// GET /api/wallet/holdings?address=0x…&network=base|baseSepolia
//
// Full live token holdings for the Wallet portfolio table, via checkWallet().
// THREE sources in descending order of what they establish — Moralis, then
// keyless on-chain discovery (explorer names the candidates, Multicall3 reads
// every balance), then the curated-majors RPC read. The latter two are flagged
// `partial` and carry `partialReason`, which the client renders verbatim rather
// than guessing why from `source`.
//
// ZERO fabrication: usdValue is whatever a vetted pricer returned (or omitted),
// never a guessed number. The client renders "—" for any token without a price.

import { NextResponse } from "next/server";
import { checkWallet } from "@/lib/wallet/holdings";

// Per-address wallet read — never cache across addresses.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const address = u.searchParams.get("address") ?? "";
  const network = u.searchParams.get("network") ?? "base";

  if (!/^0x[a-fA-F0-9]{40}$/.test(address))
    return NextResponse.json({ holdings: [], source: "rpc", partial: false, error: "invalid address" });

  try {
    const r = await checkWallet(address, network);
    return NextResponse.json({
      holdings:      r.holdings,
      source:        r.source,
      partial:       r.partial,
      partialReason: r.partialReason,
      explorer:   r.explorer,
      addressUrl: r.addressUrl,
      network:    r.network,
      error:      r.error,
      ts:         Date.now(),
    });
  } catch (e) {
    return NextResponse.json({ holdings: [], source: "rpc", partial: false, error: (e as Error).message });
  }
}
