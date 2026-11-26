/**
 * GET /api/chat/venice-status
 *
 * Exposes safe operational health of Blue Chat's Venice DIEM / USD inference
 * funding layer (via `GET /api/v1/billing/balance`), without leaking API keys.
 */
import { NextResponse } from "next/server";
import { readVeniceBillingBalance } from "@/lib/venice-privacy";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET() {
  const billing = await readVeniceBillingBalance();
  return NextResponse.json(
    {
      ok: billing.status === "ok" || billing.status === "low_balance",
      status: billing.status,
      canConsume: billing.canConsume,
      consumptionCurrency: billing.consumptionCurrency,
      diemEpochAllocation: billing.diemEpochAllocation,
      checkedAt: billing.checkedAt,
      cached: billing.cached,
    },
    {
      status: billing.status === "ok" || billing.status === "low_balance" ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
