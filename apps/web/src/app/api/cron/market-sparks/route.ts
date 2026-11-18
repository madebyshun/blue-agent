/**
 * Cron: sample Base stock token prices into the 24h sparkline store
 * (lib/markets-sparks.ts). Every 15 minutes; one point per token per hour.
 * Auth: `Authorization: Bearer $CRON_SECRET`.
 */
import { NextRequest, NextResponse } from "next/server";
import { recordSparks } from "@/lib/markets-sparks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const okAuth = secret ? (req.headers.get("authorization") ?? "") === `Bearer ${secret}` : process.env.NODE_ENV !== "production";
  if (!okAuth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json({ status: "ok", ...(await recordSparks()) }); }
  catch (e) { return NextResponse.json({ status: "error", error: (e as Error).message.slice(0, 160) }, { status: 502 }); }
}

export const POST = GET;
