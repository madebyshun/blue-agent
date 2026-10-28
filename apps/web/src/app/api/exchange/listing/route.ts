/**
 * /api/exchange/listing — Sell services (lib/hub/listings.ts). The signed-in
 * wallet IS the payTo being listed. GET: its listing and pending claim.
 * POST {action:"start", domain} | {action:"verify", name, description} | {action:"unlist"}.
 */
import { NextResponse, type NextRequest } from "next/server";
import { resolveActingWallet, actingWalletRefusal } from "@/lib/acting-wallet";
import { readListing, startClaim, unlist, verifyClaim } from "@/lib/hub/listings";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const who = await resolveActingWallet(req);
  if (who.status !== "ok") return actingWalletRefusal(who);
  return NextResponse.json({ wallet: who.wallet, listing: await readListing(who.wallet) });
}

export async function POST(req: NextRequest) {
  const who = await resolveActingWallet(req);
  if (who.status !== "ok") return actingWalletRefusal(who);
  const b = (await req.json().catch(() => ({}))) as { action?: string; domain?: string; name?: string; description?: string };
  if (b.action === "start") {
    const r = await startClaim(who.wallet, String(b.domain ?? ""));
    return typeof r === "string" ? NextResponse.json({ error: r }, { status: 400 }) : NextResponse.json(r);
  }
  if (b.action === "verify") {
    const r = await verifyClaim(who.wallet, String(b.name ?? ""), String(b.description ?? ""));
    return typeof r === "string" ? NextResponse.json({ error: r }, { status: 400 }) : NextResponse.json({ listing: r });
  }
  if (b.action === "unlist") { await unlist(who.wallet); return NextResponse.json({ ok: true }); }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
