// GET /api/wallet/net-worth?address=0x…
//
// Cross-chain net worth: one dollar figure for the whole wallet, across both
// live chains (Base 8453 + Robinhood Chain 4663) and both asset classes (crypto
// tokens + tokenized stocks). This is the aggregate the per-chain balance
// headline and the CHAINS switcher sit beside — NOT a replacement for either.
//
// Everything is derived by lib/wallet/net-worth.ts from three vetted readers
// (checkWallet · readRhHoldings · readStockHoldings). ZERO fabrication: an
// unpriced row, an unreachable chain, or a truncated list turns `usd` into a
// lower bound with `isFloor:true` plus reasons, never a made-up number.

import { NextResponse } from "next/server";
import { readNetWorth } from "@/lib/wallet/net-worth";

// Per-address wallet read — never cache across addresses.
export const dynamic = "force-dynamic";
// Fans out to Moralis (Base tokens), Blockscout (RH tokens), and the equity
// pricer (Chainlink + DEX per held ticker, both venues). Same ceiling as
// /api/wallet/stocks — comfortably under it, but not under the 10s default.
export const maxDuration = 60;

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address") ?? "";

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({
      address, chains: [], total: { usd: 0, isFloor: false }, ts: Date.now(), error: "invalid address",
    });
  }

  try {
    return NextResponse.json(await readNetWorth(address));
  } catch (e) {
    return NextResponse.json({
      address, chains: [], total: { usd: 0, isFloor: false }, ts: Date.now(), error: (e as Error).message,
    });
  }
}
