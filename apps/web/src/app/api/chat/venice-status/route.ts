/**
 * GET /api/chat/venice-status
 *
 * Exposes safe operational health of Blue Chat's Venice inference funding
 * layer (via `GET /api/v1/billing/balance`), without leaking API keys or
 * Blue's private DIEM/USD billing balances.
 */
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getIdentifier } from "@/lib/rate-limit";
import { readVeniceBillingBalance } from "@/lib/venice-privacy";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  // Uses Blue's Venice key upstream: rate-limited like chat (review 2026-11-28).
  if (!(await rateLimit(getIdentifier(req), "chat")).success) return NextResponse.json({ ok: false, error: "Too many requests." }, { status: 429 });
  const billing = await readVeniceBillingBalance();
  return NextResponse.json(
    {
      ok: billing.status === "ok" || billing.status === "low_balance",
      status: billing.status,
      canConsume: billing.canConsume,
      checkedAt: billing.checkedAt,
      cached: billing.cached,
    },
    {
      status: billing.status === "ok" || billing.status === "low_balance" ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
