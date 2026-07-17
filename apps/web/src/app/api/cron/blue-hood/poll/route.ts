/**
 * Blue Hood — Poll cycle endpoint.
 *
 * Called by the 60s scheduler (GitHub Actions in prod, manual POST in dev).
 * Auth: `Authorization: Bearer $CRON_SECRET` or `?secret=$CRON_SECRET`.
 *
 * Response is intentionally minimal — the useful state lives in KV. The
 * caller only needs to know: did the cycle finish, how long did it take,
 * how many tickers errored.
 */
import { NextRequest, NextResponse } from "next/server";
import { persistSnapshot, runPollCycle } from "@/lib/blue-hood/poller";
import { TOOL_CALLER_MODE } from "@/lib/blue-hood/tool-caller";

export const runtime = "nodejs";
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET ?? "";

function isAuthorized(req: NextRequest): boolean {
  // Allow-list dev without a secret set (so `npm run dev` "just works").
  if (!CRON_SECRET) return process.env.NODE_ENV !== "production";
  const authHeader = req.headers.get("authorization") ?? "";
  const secretParam = new URL(req.url).searchParams.get("secret") ?? "";
  return authHeader === `Bearer ${CRON_SECRET}` || secretParam === CRON_SECRET;
}

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snap = await runPollCycle();
    await persistSnapshot(snap);
    return NextResponse.json({
      ok: true,
      mode: TOOL_CALLER_MODE,
      cycle_id: snap.cycle_id,
      duration_ms: snap.duration_ms,
      tokens_watched: snap.metrics.tokens_watched,
      tokens_errored: snap.metrics.tokens_errored,
      market_is_open: snap.metrics.market_is_open,
      market_session: snap.metrics.market_session,
      tvl_scanned_usd: Math.round(snap.metrics.tvl_scanned_usd),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message, stack: (e as Error).stack?.slice(0, 400) },
      { status: 500 },
    );
  }
}

// POST is the primary path (CI + Vercel Cron). GET is allowed for the same
// bearer so a human can hit it in a browser tab during local dev — same
// pattern as the other cron routes.
export const POST = handle;
export const GET = handle;
