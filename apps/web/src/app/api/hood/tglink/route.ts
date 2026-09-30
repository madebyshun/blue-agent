/**
 * Blue Hood — Telegram wallet-link: mint a link code.
 *
 * Web side of the handshake defined in `lib/blue-hood/watchlist.ts`. The
 * connected wallet POSTs here; we mint a short-lived code (TTL 10m) and return
 * a `t.me/<bot>?start=link_<code>` DEEP LINK. The user taps it, hits Start, and
 * the bot's `/start link_<code>` handler (2.2b) consumes it via
 * `consumeTgLinkCode` — NO code to copy or type. We return the deep link built
 * server-side (never a bare code the UI has to render) so the /hood button is
 * one tap: "no wallet paste, no code typed". `link` is null when the bot
 * username env is unset — the client then shows "unavailable", never the code.
 * The manual `/link <code>` path still works as a fallback. Non-custodial: the
 * link stores only { address, tgUserId } — never a key. The tg id is a routing
 * handle for alerts, not an authz token for funds.
 *
 * Trust model — SIWE since 2026-09-30 (plan §2, W0-6). Until then the route
 * trusted the `address` in the body, which nothing proved: the wagmi connection
 * is a claim the browser makes about itself. Anyone could mint a code for a
 * stranger's wallet and link it to their own Telegram, receiving that wallet's
 * alerts. The code is now minted only for the wallet the session proves
 * (lib/acting-wallet.ts), as this header said it would be "when wallet auth
 * (SIWE) lands".
 */
import { NextResponse, type NextRequest } from "next/server";
import { resolveActingWallet, actingWalletRefusal } from "@/lib/acting-wallet";
import { issueTgLinkCode } from "@/lib/blue-hood/watchlist";
import { botDeepLink, BOT_USERNAME } from "@/lib/telegram/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

/** POST /api/hood/tglink { address } → { code, link, expiresAt } */
export async function POST(req: NextRequest) {
  let body: { address?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: NO_STORE });
  }
  const acting = await resolveActingWallet(req, body.address);
  if (acting.status !== "ok") return actingWalletRefusal(acting);

  const res = await issueTgLinkCode(acting.wallet);
  if ("error" in res) {
    return NextResponse.json({ ok: false, error: res.error.message, code: res.error.code }, { status: 400, headers: NO_STORE });
  }
  // Build the deep link server-side so the UI never has to render a bare code.
  // Null when the bot username env is unset → client shows "unavailable".
  const link = BOT_USERNAME ? botDeepLink(`link_${res.code}`) : null;
  return NextResponse.json({ ok: true, code: res.code, link, expiresAt: res.expiresAt }, { headers: NO_STORE });
}
