/**
 * Cron: walks Base 8453 forward for corporate-action announcements on every
 * Coinbase Tokenized Stock (lib/base-stocks/corporate-actions.ts) and stores new
 * action ids in KV. Every 30 min: ~900 new blocks, 34 getLogs calls.
 * Auth: `Authorization: Bearer $CRON_SECRET` (what Vercel Cron sends).
 */
import { NextRequest, NextResponse } from "next/server";
import { scanActions } from "@/lib/base-stocks/corporate-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const started = Date.now();
  try {
    const r = await scanActions(started + maxDuration * 1000);
    return NextResponse.json({ status: "ok", ms: Date.now() - started, ...r });
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    console.error(`[cron:stock-actions] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const POST = GET;
