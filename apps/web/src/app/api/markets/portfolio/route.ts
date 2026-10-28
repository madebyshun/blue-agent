/**
 * GET /api/markets/portfolio?address=0x… — a wallet's ETH, stable and stock-token
 * balances on Base 8453 and Robinhood Chain 4663 (lib/markets.ts readPortfolio).
 * Balances are public chain state, so no session; nothing is stored. A chain whose
 * RPC could not be read is named in `unread`, never shown as an empty wallet.
 */
import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { readPortfolio } from "@/lib/markets";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const a = new URL(req.url).searchParams.get("address") ?? "";
  if (!isAddress(a)) return NextResponse.json({ error: "address must be a 0x address." }, { status: 400 });
  const p = await readPortfolio(getAddress(a));
  return NextResponse.json({ address: getAddress(a), ...p, readAt: new Date().toISOString() });
}
