/**
 * picks-check — Daily track record checker (NO LLM).
 *
 * Reads pending picks stored in KV (written by _shared.ts after base-token-scan).
 * Looks up current price 22h after the signal via GeckoTerminal.
 * Win = +3%, Loss = -3%, Neutral = between.
 *
 * KV keys:
 *  feed:picks:pending  — PendingPick[]  (7-day TTL, refreshed on each write)
 *  feed:picks:history  — PickOutcome[]  (30-day TTL, last 30 outcomes kept)
 *
 * Returns _noCard:true when there are no picks due this run.
 */
import { getBaseTrending } from "@/lib/market-data";
import { kvGet, kvSet }    from "@/lib/kv";

const PENDING_KEY = "feed:picks:pending";
const HISTORY_KEY = "feed:picks:history";
const WIN_PCT     =  3;  // +3% → WIN
const LOSS_PCT    = -3;  // -3% → LOSS

export type PendingPick = {
  symbol:          string;
  price_at_signal: number | null;
  signal_ts:       number;
  check_after:     number;  // epoch ms — when to evaluate
  volume_24h:      number | null;
  liquidity_usd:   number | null;
};

export type PickOutcome = PendingPick & {
  price_at_check: number | null;
  outcome_pct:    number | null;
  outcome:        "WIN" | "LOSS" | "NEUTRAL" | "UNKNOWN";
  checked_ts:     number;
};

function buildTrackRecord(history: PickOutcome[]) {
  const wins    = history.filter((o) => o.outcome === "WIN");
  const losses  = history.filter((o) => o.outcome === "LOSS");
  const neutral = history.filter((o) => o.outcome === "NEUTRAL");
  const known   = wins.length + losses.length;
  const avg = (arr: PickOutcome[]) =>
    arr.length ? +(arr.reduce((s, o) => s + (o.outcome_pct ?? 0), 0) / arr.length).toFixed(2) : null;
  return {
    total:        history.length,
    wins:         wins.length,
    losses:       losses.length,
    neutral:      neutral.length,
    win_rate:     known > 0 ? +(wins.length / known * 100).toFixed(1) : null,
    avg_win_pct:  avg(wins),
    avg_loss_pct: avg(losses),
  };
}

export default async function handler(_req: Request): Promise<Response> {
  try {
    const now     = Date.now();
    const pending = (await kvGet<PendingPick[]>(PENDING_KEY)) ?? [];
    const history = (await kvGet<PickOutcome[]>(HISTORY_KEY)) ?? [];

    const due          = pending.filter((p) => now >= p.check_after);
    const stillPending = pending.filter((p) => now <  p.check_after);

    if (due.length === 0) {
      return Response.json({
        tool:            "picks-check",
        _noCard:         true,
        reason:          "No picks are due for checking yet.",
        pending_count:   stillPending.length,
        track_record:    buildTrackRecord(history),
        timestamp:       new Date().toISOString(),
      });
    }

    // Price lookup via current GeckoTerminal trending
    const trending = await getBaseTrending(25).catch(() => []);
    const priceMap = new Map<string, number | null>(
      trending.map((p) => [p.baseSymbol.toUpperCase(), p.priceUsd])
    );

    const outcomes: PickOutcome[] = due.map((pick) => {
      const currentPrice = priceMap.get(pick.symbol.toUpperCase()) ?? null;
      let outcome_pct: number | null = null;
      let outcome: PickOutcome["outcome"] = "UNKNOWN";
      if (currentPrice != null && pick.price_at_signal != null && pick.price_at_signal > 0) {
        outcome_pct = +((currentPrice - pick.price_at_signal) / pick.price_at_signal * 100).toFixed(2);
        outcome     = outcome_pct >= WIN_PCT ? "WIN"
                    : outcome_pct <= LOSS_PCT ? "LOSS"
                    : "NEUTRAL";
      }
      return { ...pick, price_at_check: currentPrice, outcome_pct, outcome, checked_ts: now };
    });

    // Merge: new outcomes first, keep last 30
    const updatedHistory = [...outcomes, ...history].slice(0, 30);

    await Promise.all([
      kvSet(PENDING_KEY, stillPending,    7 * 24 * 3600),
      kvSet(HISTORY_KEY, updatedHistory, 30 * 24 * 3600),
    ]);

    const track   = buildTrackRecord(updatedHistory);
    const sorted  = [...outcomes].sort((a, b) => (b.outcome_pct ?? 0) - (a.outcome_pct ?? 0));
    const best    = sorted[0]    ?? null;
    const worst   = sorted[sorted.length - 1] ?? null;

    return Response.json({
      tool:      "picks-check",
      checked:   outcomes.length,
      track_record: track,
      best_pick: best  ? { symbol: best.symbol,  outcome_pct: best.outcome_pct,  outcome: best.outcome  } : null,
      worst_pick: worst ? { symbol: worst.symbol, outcome_pct: worst.outcome_pct, outcome: worst.outcome } : null,
      recent_picks: outcomes.map((o) => ({
        symbol:      o.symbol,
        outcome:     o.outcome,
        outcome_pct: o.outcome_pct,
        signal_ts:   o.signal_ts,
      })),
      pending_remaining: stillPending.length,
      dataSource: "GeckoTerminal (current price lookup)",
      timestamp:  new Date().toISOString(),
    });
  } catch (e) {
    return Response.json(
      { error: "picks-check failed", message: (e as Error).message },
      { status: 500 }
    );
  }
}
