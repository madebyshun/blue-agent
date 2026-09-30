// GET /api/wallet/spend?address=0x…
//
// The payer's own x402 receipts — what each USDC payment to the Blue Agent
// treasury actually BOUGHT. On Base a Hub tool call is indistinguishable from
// any other transfer (`0xUSER → 0x0295…, 0.05 USDC`); the tool id exists only in
// the request that triggered it. `lib/wallet/spend-log.ts` writes that join at
// settle time and this route hands it back so /wallet can render
// "Blue Hub · Honeypot Check · $0.05" where every other wallet shows hex.
//
// Tool ids are resolved to display names HERE, against the live AGENT_TOOLS
// catalog, for two reasons: the catalog is ~2k lines and has no business in a
// client bundle, and a name must be looked up rather than typed — a hand-kept
// id→label map in the UI is the exact defect class this wallet work has been
// removing. An id with no catalog entry (retired tool) returns `name: null`
// and the client prints the raw id. It never guesses a label.
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
import { getSpendLog } from "@/lib/wallet/spend-log";
import { AGENT_TOOLS } from "@/lib/agent-tools";

// Per-address read — never cache one wallet's receipts onto another's request.
export const dynamic = "force-dynamic";

const NAMES = new Map(AGENT_TOOLS.map(t => [t.id, t.name] as const));

export async function GET(req: NextRequest) {
  const acting = await resolveActingWallet(req, new URL(req.url).searchParams.get("address"));
  if (acting.status !== "ok") return actingWalletRefusal(acting);

  const rows = await getSpendLog(acting.wallet);

  // `null` from getSpendLog means KV was unreachable — WE DO NOT KNOW, which is
  // not the same claim as "there are none". It travels to the client as
  // `known: false` so a KV outage cannot silently tell a paying user that none
  // of their payments ever bought anything.
  if (rows == null)
    return NextResponse.json({ receipts: [], known: false, error: "store unavailable" });

  return NextResponse.json({
    known: true,
    receipts: rows.map(r => ({
      ts:    r.ts,
      tool:  r.tool,
      // Community slugs are a DIFFERENT namespace and must not be looked up
      // here — a hosted tool slugged "token-price" would otherwise borrow the
      // first-party tool's name and tell the user they bought the wrong thing.
      // They render as their slug, which is already human-written.
      name:  r.src === "community" ? null : NAMES.get(r.tool) ?? null,
      units: r.units,
      usd:   r.units / 1_000_000,
      tx:    r.tx ?? null,
    })),
    ts: Date.now(),
  });
}
