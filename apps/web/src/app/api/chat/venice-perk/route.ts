/**
 * GET /api/chat/venice-perk?address=0x...
 *
 * Returns a Base 8453 wallet's VVV / sVVV / DIEM balances and whether it
 * qualifies for 0-credit Private TEE access on Blue Chat.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import {
  VENICE_BASE_TOKENS,
  VVV_PERK_THRESHOLDS,
  evaluateVeniceHolderPerk,
  readVeniceOnchainBalances,
} from "@/lib/venice-vvv";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const address = (req.nextUrl.searchParams.get("address") ?? "").trim();
  if (!isAddress(address)) {
    return NextResponse.json({ ok: false, error: "Valid Base 0x address required." }, { status: 400 });
  }

  const balances = await readVeniceOnchainBalances(address);
  const perk = evaluateVeniceHolderPerk(balances);

  return NextResponse.json(
    {
      ok: balances !== null,
      address,
      balances,
      perk,
      thresholds: VVV_PERK_THRESHOLDS,
      contracts: VENICE_BASE_TOKENS,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
