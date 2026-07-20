/**
 * Blue Hood — arrow grader.
 *
 * Iterates every currently-open arrow whose `grading_window_h` has elapsed
 * and hands it a verdict against a FRESH snapshot / M5 read. The engine
 * NEVER decides the outcome from stale numbers — we always re-read the
 * tool that fired it (spec: "graded by the same tools that fired it").
 *
 * Grading rules (spec Block 1.4):
 *   • drift: HIT if in the first 2h of the next regular session the gap
 *     DEX↔oracle has closed ≥ 50% vs fire time.
 *   • arb:   HIT if the spread falls below 0.5% within 4h.
 *   • flow:  HIT if DEX price moves ≥ 1% in the expected direction within
 *            24h before moving ≥ 1% the opposite way (arrives in the flow
 *            commit).
 *
 * All outcomes are hard-mapped in code; the LLM never sees these.
 */
import { kvGet, kvSet } from "@/lib/kv";
import { callTool } from "./tool-caller";
import { kvArrow, kvArrowOpenIndex, KV_ARROW_FEED } from "./kv-keys";
import type { Arrow, ArrowOutcome, M5Verdict } from "./types";

interface M5Response {
  verdict: M5Verdict;
  ticker: string;
  market: { is_open: boolean; session: string };
  delta: { pct: number };
  chainlink: { price_usd: number };
  dex: { price_usd: number };
}

const ARB_HIT_SPREAD_PCT = 0.5;
const DRIFT_HIT_GAP_CLOSE_PCT = 0.5;

// ── Public API ─────────────────────────────────────────────────────────────
export interface GraderReport {
  graded: Arrow[];
  still_open: number;
  errored: string[]; // arrow ids that failed to grade this pass
}

export async function runGrader(): Promise<GraderReport> {
  const feed = (await kvGet<string[]>(KV_ARROW_FEED)) ?? [];
  const graded: Arrow[] = [];
  const errored: string[] = [];
  let still_open = 0;
  let skipped_seeded = 0;

  // Cap this pass at 200 arrows — grading is fast but we don't want a
  // 60s cron cycle to time out on an unbounded backlog.
  for (const id of feed.slice(0, 200)) {
    const arrow = await kvGet<Arrow>(kvArrow(id));
    if (!arrow || arrow.status !== "open") continue;

    // Bug fix (2026-07-21, pre-merge task #2): the poller was grading
    // seeded arrows (dummy `reference_price=100`) as HIT because
    // `gap closed 99%` was computed against fake input — e.g. #0006 SPY
    // "gap closed 99% (86.62% → 0.57%)" was purely `|100 - real_spy_price|`.
    // Public feed already filters origin !== "engine" so no user saw the
    // fake HITs, but the KV was polluted. Skip at the top of the loop so
    // seeded arrows never touch grader math again.
    //
    // Back-compat: legacy arrows without `origin` field are treated as
    // engine (per T-A #1) — the guard only skips EXPLICIT non-engine.
    if (arrow.origin && arrow.origin !== "engine") { skipped_seeded++; continue; }

    const readyAt = new Date(arrow.fired_at).getTime() + arrow.grading_window_h * 3_600_000;
    if (Date.now() < readyAt) { still_open++; continue; }

    try {
      const outcome = await gradeOne(arrow);
      if (!outcome) { still_open++; continue; }
      const now = new Date().toISOString();
      const closed: Arrow = { ...arrow, status: "graded", outcome: outcome.outcome, graded_at: now, outcome_detail: outcome.detail };
      await kvSet(kvArrow(id), closed);
      // Clear the open-index so a new arrow of same (ticker, type) can fire.
      await kvSet(kvArrowOpenIndex(arrow.ticker, arrow.type), null, 1);
      graded.push(closed);
    } catch (e) {
      errored.push(`${id}: ${(e as Error).message}`);
    }
  }

  console.log(`[grader] graded=${graded.length} still_open=${still_open} skipped_seeded=${skipped_seeded} errored=${errored.length}`);

  return { graded, still_open, errored };
}

// ── Per-arrow grading ──────────────────────────────────────────────────────
async function gradeOne(arrow: Arrow): Promise<{ outcome: ArrowOutcome; detail: string } | null> {
  const r = await callTool<M5Response>("rh-stock-arb", { ticker: arrow.ticker });
  if (!r.ok) throw new Error(`M5 read failed: ${r.error}`);
  const now = r.data;

  const dex = now.dex.price_usd;
  const oracle = now.chainlink.price_usd;
  if (!(dex > 0) || !(oracle > 0)) return null;

  if (arrow.type === "arb") {
    const spreadPct = Math.abs(now.delta.pct);
    if (spreadPct < ARB_HIT_SPREAD_PCT) {
      return { outcome: "hit", detail: `spread narrowed to ${spreadPct.toFixed(3)}% (< ${ARB_HIT_SPREAD_PCT}%)` };
    }
    return { outcome: "miss", detail: `spread still ${spreadPct.toFixed(3)}% (≥ ${ARB_HIT_SPREAD_PCT}%) after ${arrow.grading_window_h}h` };
  }

  if (arrow.type === "drift") {
    // Gap DEX↔oracle at fire time vs now. Positive gap on fire (DEX > oracle
    // by X%) closes ≥ 50% means |now_pct| ≤ 0.5 * |fire_pct|.
    // We don't store fire_pct explicitly (spec says "reference_price" is the
    // DEX price at fire), so approximate: we treat the current M5 spread as
    // the residual and compare to the reference_price / oracle ratio.
    const nowGapPct = Math.abs(now.delta.pct);
    const refPrice = arrow.reference_price;
    const fireGapPct = refPrice > 0 ? Math.abs((refPrice - oracle) / oracle) * 100 : 0;
    if (fireGapPct <= 0) return { outcome: "miss", detail: "no measurable fire-time gap" };
    const closedBy = 1 - nowGapPct / fireGapPct;
    if (closedBy >= DRIFT_HIT_GAP_CLOSE_PCT) {
      return { outcome: "hit", detail: `gap closed ${(closedBy * 100).toFixed(0)}% (${fireGapPct.toFixed(2)}% → ${nowGapPct.toFixed(2)}%)` };
    }
    return { outcome: "miss", detail: `gap only closed ${(closedBy * 100).toFixed(0)}% (${fireGapPct.toFixed(2)}% → ${nowGapPct.toFixed(2)}%)` };
  }

  // flow / whale — not yet in this commit; leave open.
  return null;
}
