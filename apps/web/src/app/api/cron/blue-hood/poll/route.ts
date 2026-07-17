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
import { runRuleEngine } from "@/lib/blue-hood/rule-engine";
import { runGrader } from "@/lib/blue-hood/grader";
import { TOOL_CALLER_MODE } from "@/lib/blue-hood/tool-caller";

export const runtime = "nodejs";
// 24 tokens × 3s stagger + M5 wall time + 429 retry waits ≈ 90-120s per
// cycle. maxDuration=180 gives 60s buffer for anomalous slow responses.
// Vercel Pro allows up to 300; we don't need the whole runway.
export const maxDuration = 180;

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
    // 1. Fresh snapshot (M5 for the whole watchlist).
    const snap = await runPollCycle();
    await persistSnapshot(snap);

    // 2. Rule engine — fires arrows for any row that matches drift/arb rules.
    //    Deduped against open arrows via `bh:arrow:open:{ticker}:{type}`.
    const engine = await runRuleEngine(snap);

    // 3. Grader — closes any arrow whose grading window has elapsed.
    //    Runs after the engine so a just-fired arrow can't be graded in the
    //    same cycle (its window hasn't elapsed yet — guaranteed by construction).
    const grader = await runGrader();

    return NextResponse.json({
      ok: true,
      mode: TOOL_CALLER_MODE,
      cycle_id: snap.cycle_id,
      duration_ms: snap.duration_ms,
      registry_total: snap.metrics.registry_total,
      tokens_watched: snap.metrics.tokens_watched,
      tokens_no_feed: snap.metrics.tokens_no_feed,
      tokens_errored: snap.metrics.tokens_errored,
      market_is_open: snap.metrics.market_is_open,
      market_session: snap.metrics.market_session,
      tvl_scanned_usd: Math.round(snap.metrics.tvl_scanned_usd),
      engine: {
        // Matches the structured `[engine]` log line one-to-one so responses
        // and logs can never disagree.
        candidates_over_threshold: engine.candidates_over_threshold,
        skipped_dust: engine.skipped_dust,
        skipped_feed_stale: engine.skipped_feed_stale,
        below_threshold: engine.below_threshold,
        deduped: engine.deduped,
        fired: engine.fired,
        arrows: engine.arrows_fired.map((a) => ({ serial: a.serial, ticker: a.ticker, type: a.type, expected: a.expected_direction })),
      },
      grader: {
        graded: grader.graded.map((a) => ({ serial: a.serial, ticker: a.ticker, type: a.type, outcome: a.outcome, detail: a.outcome_detail })),
        still_open: grader.still_open,
        errored: grader.errored,
      },
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
