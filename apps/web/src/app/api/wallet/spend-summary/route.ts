// GET /api/wallet/spend-summary?address=0x…
//
// The spend console's data: both payment rails for one wallet, grouped by tool
// and by day. `/api/wallet/spend` answers "name THIS transaction"; this answers
// "where has the money gone" — hence a second route rather than a fatter one.
//
// Display names are resolved HERE, against the live AGENT_TOOLS catalog, for
// the same two reasons as the sibling route: the catalog is ~2k lines and has
// no business in a client bundle, and a name must be LOOKED UP rather than
// typed. An id with no catalog entry (a retired tool) returns `name: null` and
// the client prints the raw id — it never guesses a label.
//
// Community rows deliberately skip the lookup. A Hub slug is free-form and
// lives in a different namespace, so a hosted tool slugged "token-price" would
// otherwise borrow the first-party tool's name and tell the user they bought
// something they did not.
//
// `creditsPerUsdc` is SHIPPED IN THE PAYLOAD rather than hard-coded in the UI
// so the console cannot drift from the rate the top-up flow actually charges.
// It converts `credits.paidAllTime` and nothing else — see spend-summary.ts on
// why no single credit event has a dollar value.
//
// OWNER-ONLY since 2026-09-30 (plan §2, W0-6). This line used to argue for a
// PUBLIC read — anyone with an address could read which Hub tools it bought —
// on the grounds that the credits rail published the same join, so gating one
// alone would be theatre. Both went private in the same commit: this route,
// /api/wallet/spend-summary, and the per-event `recent` list of
// /api/credits/balance/[address] (its aggregate balance stays public). The
// wallet comes from the SIWE session (lib/acting-wallet.ts); `address`, when
// sent, must match it.

import { NextResponse, type NextRequest } from "next/server";
import { resolveActingWallet, actingWalletRefusal } from "@/lib/acting-wallet";
import { getSpendSummary } from "@/lib/wallet/spend-summary";
import { CREDITS_PER_USDC } from "@/lib/payments";
import { AGENT_TOOLS } from "@/lib/agent-tools";

// Per-address read — never cache one wallet's spending onto another's request.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NAMES = new Map(AGENT_TOOLS.map(t => [t.id, t.name] as const));

export async function GET(req: NextRequest) {
  const acting = await resolveActingWallet(req, new URL(req.url).searchParams.get("address"));
  if (acting.status !== "ok") return actingWalletRefusal(acting);

  const s = await getSpendSummary(acting.wallet);

  return NextResponse.json({
    ...s,
    creditsPerUsdc: CREDITS_PER_USDC,
    tools: s.tools.map(t => ({
      ...t,
      name: t.src === "community" ? null : NAMES.get(t.tool) ?? null,
    })),
  });
}
