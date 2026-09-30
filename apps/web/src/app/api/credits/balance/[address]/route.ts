/**
 * GET /api/credits/balance/[address]
 *
 * Returns the wallet's claimable credit balance:
 *
 *   topup     — off-chain credits added via USDC top-up
 *   spent     — credits debited from the PAID pool only. NOT total usage: a
 *               debit drains the free daily bucket first and only the overflow
 *               lands here, so a wallet that never tops up reports 0 for ever.
 *   freeSpent — the other half, cumulative across days. May be absent (never
 *               measured, on rows written before the field existed) — and
 *               absent is not zero.
 *   pool      — max(0, topup - spent)
 *   balance   — pool + dailyRemaining, i.e. BOTH buckets. This line used to
 *               read `max(0, topup - spent)`, which is the pool alone.
 *   recent    — last 10 ledger events
 *
 * `accrued` is still present in the payload but is permanently 0: it used to be
 * an on-chain read of BlueMarketStaking.totalCreditsAccrued, and staking stopped
 * feeding credits well before the stake surface was retired. It is kept as a
 * zero rather than dropped so existing clients don't break on a missing field.
 *
 * Two answers since 2026-09-30 (plan §2, W0-6):
 *   default    — the AGGREGATE (balances, pool, daily), public, cached 15 s so
 *                the dashboard doesn't hammer KV on every render. Chat needs
 *                this number before the user has signed anything.
 *   ?detail=1  — the same plus `recent`, the per-event list. OWNER-ONLY: the
 *                SIWE session must be this wallet, and it is never cached.
 * `recent` names each debit ("tool:<id>", when) — the same join
 * /api/wallet/spend and /spend-summary publish, and all three went owner-only
 * together, as their headers required.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { getBalance } from "@/lib/credit-ledger";
import { resolveActingWallet, actingWalletRefusal } from "@/lib/acting-wallet";

export const runtime = "nodejs";
// One RPC roundtrip + one KV read — well under a second in practice.
export const maxDuration = 15;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  if (!isAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  const detail = new URL(req.url).searchParams.get("detail") === "1";
  if (detail) {
    const acting = await resolveActingWallet(req, address);
    if (acting.status !== "ok") return actingWalletRefusal(acting);
  }
  try {
    const summary = await getBalance(address);
    if (detail) {
      return NextResponse.json(summary, { headers: { "Cache-Control": "private, no-store" } });
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { recent: _perEvent, ...aggregate } = summary;
    return NextResponse.json(aggregate, {
      headers: {
        "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60",
      },
    });
  } catch (e) {
    // KV read failed. Deliberately return NO `balance` field: every client here
    // (ChatContext, WalletBar, /app/usage, the dashboard) only applies the value
    // when it parses as a finite number, so they keep the last known figure
    // instead of flashing a fabricated "0 credits" at a paying user.
    return NextResponse.json(
      { error: (e as Error).message, code: "LEDGER_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
