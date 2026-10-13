/**
 * GET /api/cron/brief — the hourly morning-brief pass (lib/brief/run.ts).
 * Scheduled in vercel.json. Each subscriber is sent once a day, at the first
 * pass at or after their hour (UTC); a pass that runs out of time leaves the
 * rest for the next hour.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET` (what Vercel Cron sends), or
 * `?secret=` for a manual run — the same rule as /api/cron/watches.
 */
import { NextRequest, NextResponse } from "next/server";
import { runBriefPass } from "@/lib/brief/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEADLINE_MS = 240_000;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const authHeader = req.headers.get("authorization") ?? "";
  const secretParam = new URL(req.url).searchParams.get("secret") ?? "";
  return authHeader === `Bearer ${secret}` || secretParam === secret;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const started = Date.now();
  try {
    const result = await runBriefPass(started, started + DEADLINE_MS);
    return NextResponse.json({ status: "ok", ms: Date.now() - started, ...result });
  } catch (e) {
    const msg = (e as Error).message.replace(/0x[a-fA-F0-9]{40}/g, "0x…").slice(0, 300);
    console.error(`[cron:brief] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const POST = GET;
