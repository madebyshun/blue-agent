// GET /api/wallet/rh-transactions?address=0x…
//
// Recent wallet activity on Robinhood Chain 4663, from that chain's Blockscout.
//
// This is a SECOND history read rather than a `network=` parameter on
// /api/wallet/transactions, for the same reason /api/wallet/rh-holdings is a
// third balance read: the two chains share no indexer and no shape.
//   /api/wallet/transactions  → Moralis      → Base only (Moralis does not index 4663)
//   this route                → Blockscout   → Robinhood only
// The Moralis route's own header explains why it REFUSES an unlisted network
// instead of defaulting to Base — folding 4663 into it would mean one endpoint
// whose rows came from two indexers with two trust models and two failure
// modes, and whose partial failure could not be attributed to a chain.
//
// The caller merges the two into one timeline and labels every row with the
// chain it came from, because an RH row rendered under a Basescan link is the
// #219/#230 defect (a fact from one chain presented under another's identity).
//
// ZERO fabrication: rows are Blockscout's own transfers and transactions, an
// amount that cannot be parsed stays null rather than becoming 0, and an
// explorer that did not answer returns `status:"unavailable"` — never an empty
// list, which the UI would render as a wallet that has never transacted.

import { NextResponse } from "next/server";
import { readRhAddressHistory } from "@/lib/robinhood/blockscout";
import { RH_CHAIN } from "@/lib/robinhood/rwa-registry";

// Per-address wallet read — never cache across addresses.
export const dynamic = "force-dynamic";
// Two Blockscout legs in parallel, each 8s with one retry (see
// `readRhAddressHistory`, which carries the measurements). Worst case is ~16s
// — both legs timing out on both attempts — and the response is still a real,
// correctly-flagged read rather than a hung request. The default 10s would cut
// that off mid-retry and turn a slow explorer into a failed one.
export const maxDuration = 30;

/** Shape-compatible failure: the UI branches on `status`, so it must always
 *  exist, and `transactions` must always be an array it can spread. */
function unavailable(address: string, error?: string) {
  return NextResponse.json({
    address,
    chain:    "robinhood" as const,
    chainId:  RH_CHAIN.chainId,
    label:    RH_CHAIN.name,
    explorer: RH_CHAIN.explorer,
    status:   "unavailable" as const,
    transactions: [],
    partial: false,
    capped:  false,
    ts: Date.now(),
    ...(error ? { error } : {}),
  });
}

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address") ?? "";

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return unavailable(address, "invalid address");
  }

  try {
    const read = await readRhAddressHistory(address);
    if (read.status !== "ok") return unavailable(address, "explorer unavailable");

    return NextResponse.json({
      address,
      chain:    "robinhood" as const,
      chainId:  RH_CHAIN.chainId,
      label:    RH_CHAIN.name,
      explorer: RH_CHAIN.explorer,
      status:   "ok" as const,
      // The chain is stamped HERE, by the reader that knows which index it
      // queried — not inferred by the component that renders the row. A row
      // that travels without its chain is one merge away from being drawn
      // under the wrong explorer, which is exactly #219/#230.
      transactions: read.rows.map(r => ({ ...r, chain: "robinhood" as const })),
      partial: read.partial,
      capped:  read.capped,
      ts: Date.now(),
    });
  } catch (e) {
    // Never a 500 into an empty list — the caller would render that as a wallet
    // with no history. Fail as "we could not check", which is what happened.
    return unavailable(address, (e as Error).message);
  }
}
