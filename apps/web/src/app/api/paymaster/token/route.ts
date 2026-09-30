// POST /api/paymaster/token  { network: "base" | "baseSepolia" }
//
// Issues the short-lived sponsorship token the page embeds in the paymaster URL
// it hands the wallet (see lib/paymaster-token.ts for why a token and not the
// cookie). Same-origin, so the SIWE session cookie IS present here — this is the
// one place the paymaster learns who the user is.
//
// Every refusal is a normal answer, not an error the UI should shout about: the
// client reads "no token" as "send without sponsorship", which is exactly what a
// wallet with no paymaster capability already does.
//
// That includes a wallet whose hourly sponsorship budget (lib/rate-limit.ts,
// tier "paymaster") has no room for one more send. Before this check the token
// was minted regardless, so a wallet past its budget kept its "gas sponsored"
// badge and kept handing its wallet a paymaster the paymaster then refused —
// and a wallet rejects a batch whose paymaster fails, so every send failed
// until the window rolled over. Reading the budget here is read-only (it spends
// none of it); an UNREADABLE budget mints nothing either, because the paymaster
// fails closed on the same KV error.

import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { peekRateLimit } from "@/lib/rate-limit";
import {
  mintPaymasterToken,
  paymasterUpstream,
  PAYMASTER_CALLS_PER_SEND,
  PAYMASTER_TOKEN_TTL_MS,
  type PaymasterNetwork,
} from "@/lib/paymaster-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { network?: unknown } = {};
  try { body = await req.json(); } catch { /* empty body → default network */ }
  const network: PaymasterNetwork = body.network === "baseSepolia" ? "baseSepolia" : "base";

  if (!paymasterUpstream(network)) {
    return NextResponse.json({ token: null, reason: "paymaster_not_configured" }, { status: 200 });
  }

  const session = await readSession(req);
  if (session.status === "unavailable") {
    return NextResponse.json({ token: null, reason: "session_unavailable" }, { status: 503 });
  }
  if (session.status !== "active") {
    return NextResponse.json(
      { token: null, reason: "not_signed_in", hint: "Sign in with your wallet to get sponsored gas." },
      { status: 401 },
    );
  }

  // Same identifier /api/paymaster counts under: the token's wallet, lowercased.
  const budget = await peekRateLimit(session.wallet.toLowerCase(), "paymaster");
  if (budget.status === "unavailable") {
    return NextResponse.json({ token: null, reason: "sponsorship_unavailable" }, { status: 503 });
  }
  if (budget.remaining < PAYMASTER_CALLS_PER_SEND) {
    return NextResponse.json(
      { token: null, reason: "sponsorship_limit_reached", hint: "Sponsored-gas allowance used up for now — sends go out with gas you pay." },
      { status: 429 },
    );
  }

  const token = mintPaymasterToken(session.wallet, network);
  if (!token) {
    return NextResponse.json({ token: null, reason: "token_unavailable" }, { status: 503 });
  }
  return NextResponse.json(
    { token, wallet: session.wallet, network, expires_in_s: PAYMASTER_TOKEN_TTL_MS / 1000 },
    { headers: { "Cache-Control": "no-store" } },
  );
}
