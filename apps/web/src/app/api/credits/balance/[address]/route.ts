/**
 * GET /api/credits/balance/[address]
 *
 * Returns the wallet's claimable credit balance:
 *
 *   accrued  — on-chain staking accrual (BlueMarketStaking.totalCreditsAccrued)
 *   topup    — off-chain credits added via USDC top-up
 *   spent    — off-chain credits debited via chat / tool runs
 *   balance  — max(0, accrued + topup - spent)
 *   recent   — last 10 ledger events
 *
 * Public read; cached for 15s so the dashboard doesn't hammer KV + RPC on
 * every render.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { getBalance } from "@/lib/credit-ledger";

export const runtime = "nodejs";
// One RPC roundtrip + one KV read — well under a second in practice.
export const maxDuration = 15;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  if (!isAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  const summary = await getBalance(address);
  return NextResponse.json(summary, {
    headers: {
      "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60",
    },
  });
}
