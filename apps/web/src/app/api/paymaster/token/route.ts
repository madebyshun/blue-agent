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

import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import {
  mintPaymasterToken,
  paymasterUpstream,
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

  const token = mintPaymasterToken(session.wallet, network);
  if (!token) {
    return NextResponse.json({ token: null, reason: "token_unavailable" }, { status: 503 });
  }
  return NextResponse.json(
    { token, wallet: session.wallet, network, expires_in_s: PAYMASTER_TOKEN_TTL_MS / 1000 },
    { headers: { "Cache-Control": "no-store" } },
  );
}
