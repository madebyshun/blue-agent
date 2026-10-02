/**
 * GET /api/connectors/coinbase/start — send the signed-in wallet to Coinbase's
 * sign-in, asking for READ scopes only (lib/connectors/coinbase.ts). A plain
 * top-level navigation, so the SIWE cookie comes along.
 */
import { NextResponse, type NextRequest } from "next/server";
import { readSession } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { isConfigured, startAuth } from "@/lib/connectors/coinbase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin;
  const back = (q: string) => NextResponse.redirect(`${origin}/app/connectors?coinbase=${q}`, 302);
  const s = await readSession(req);
  if (s.status !== "active") return back("signin");
  if (!isConfigured()) return back("unavailable");
  const rl = await rateLimit(`cbconn:${s.wallet.toLowerCase()}`, "device");
  if (!rl.success) return back("slow");
  try {
    return NextResponse.redirect(await startAuth(s.wallet, `${origin}/api/connectors/coinbase/callback`), 302);
  } catch (e) {
    console.error(`[coinbase-connector] start: ${(e as Error).message}`);
    return back("unavailable");
  }
}
