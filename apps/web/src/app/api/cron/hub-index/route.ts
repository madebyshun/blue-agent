/**
 * Cron: Blue Hub exchange — walks Base blocks forward and folds x402 settlements to listed payTos into day blobs (lib/hub/exchange.ts). Every 10 min; at the head it costs one RPC call.
 * Auth: `Authorization: Bearer $CRON_SECRET` (what Vercel Cron sends).
 */
import { NextRequest, NextResponse } from "next/server";
import { indexStep } from "@/lib/hub/exchange";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const started = Date.now();
  try {
    const result = await indexStep(started + (60 - 5) * 1000);
    return NextResponse.json({ status: "ok", ms: Date.now() - started, ...result });
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    console.error(`[cron:hub-index] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const POST = GET;
