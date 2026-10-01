/**
 * GET /api/cron/watches — the 5-minute pass over price watches and
 * automations (lib/watches/tick.ts). Scheduled in vercel.json.
 *
 * Its own route since 2026-10-01 (review): it first rode /api/cron/user-tasks,
 * whose 300 s budget is sized for exactly three prompt runs (3 × 95 s). A slow
 * RPC or price API could stretch the watch pass enough to kill that function
 * mid-run — after a prompt run had been debited and before its result was
 * saved. Here it has its own budget and a hard deadline of its own.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET` (what Vercel Cron sends), or
 * `?secret=` for a manual run. Open only outside production when no secret is
 * set, the same rule as the other cron routes.
 */
import { NextRequest, NextResponse } from "next/server";
import { runWatchTick } from "@/lib/watches/tick";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The pass gives up (and reports it) well inside maxDuration. */
const DEADLINE_MS = 45_000;

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
    const result = await Promise.race([
      runWatchTick(started, started + DEADLINE_MS),
      new Promise<null>((res) => setTimeout(() => res(null), DEADLINE_MS + 5_000)),
    ]);
    if (result === null) {
      console.error("[cron:watches] pass exceeded its deadline");
      return NextResponse.json({ status: "timeout", ms: Date.now() - started });
    }
    return NextResponse.json({ status: "ok", ms: Date.now() - started, ...result });
  } catch (e) {
    const msg = (e as Error).message.replace(/0x[a-fA-F0-9]{40}/g, "0x…").slice(0, 300);
    console.error(`[cron:watches] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const POST = GET;
