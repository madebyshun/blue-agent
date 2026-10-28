/**
 * Cron: Blue Hub exchange — re-pulls the CDP Bazaar and rewrites the Base provider list (lib/hub/exchange.ts). Daily. A partial pull never replaces the stored list.
 * Auth: `Authorization: Bearer $CRON_SECRET` (what Vercel Cron sends).
 */
import { NextRequest, NextResponse } from "next/server";
import { refreshProviders } from "@/lib/hub/exchange";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const started = Date.now();
  try {
    const result = await refreshProviders(started + (300 - 5) * 1000);
    return NextResponse.json({ status: "ok", ms: Date.now() - started, ...result });
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    console.error(`[cron:hub-providers] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const POST = GET;
