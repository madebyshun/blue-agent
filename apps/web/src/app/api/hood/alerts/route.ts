/**
 * Blue Hood — per-wallet alert feed (2.1 expose surface).
 *
 * Thin HTTP skin over `lib/blue-hood/alerts.ts`. Returns the recent
 * watchlist-targeted alerts for one wallet — the CHANNEL-AGNOSTIC records the
 * alert engine writes when an arrow fires for a ticker the wallet watches. The
 * Telegram bot (2.2) consumes the same records via the lib's pending-queue
 * drain; web push (later) reads THIS shape + a delivered.webpush cursor. This
 * route is the human/inspection read — no delivery side effects.
 *
 * SIWE-gated since 2026-09-30, mirroring the watchlist route's trust model
 * (plan §2, W0-6). The alerts are about PUBLIC arrows, but the list of which
 * ones reached a wallet is that wallet's watchlist by another name, so it is
 * read only for the wallet the session proves.
 */
import { NextResponse, type NextRequest } from "next/server";
import { resolveActingWallet, actingWalletRefusal } from "@/lib/acting-wallet";
import { getAlertsForAddress } from "@/lib/blue-hood/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

/** GET /api/hood/alerts?address=0x…&limit=50 → { ok, alerts } newest-first. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const acting = await resolveActingWallet(req, url.searchParams.get("address"));
  if (acting.status !== "ok") return actingWalletRefusal(acting);
  const address = acting.wallet;
  // Clamp limit to a sane window so a caller can't ask for the whole KV history.
  const rawLimit = Number(url.searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(100, Math.trunc(rawLimit))) : 50;

  const alerts = await getAlertsForAddress(address, limit);
  return NextResponse.json({ ok: true, alerts }, { headers: NO_STORE });
}
