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

// Nullable everywhere — M5 can return a shape with `verdict: "ERROR"` or
// `INSUFFICIENT_DATA` where these nested objects are missing/undefined.
// gradeOne must not assume any field is present; the pre-merge blocker
// (grader crashed on #0008 PLTR "Cannot read properties of null") was
// caused by treating these as guaranteed.
interface M5Response {
  verdict?: M5Verdict;
  ticker?: string;
  market?: { is_open?: boolean; session?: string };
  delta?: { pct?: number };
  chainlink?: { price_usd?: number };
  dex?: { price_usd?: number };
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
  //
  // Widen try/catch scope: covers KV reads + Date parsing + gradeOne
  // + KV writes. Reviewer's rule: "grader runs 24/7 — one bad record
  // must not break the whole pass." A single crashed arrow lands in
  // `errored[]`; the loop continues.
  for (const id of feed.slice(0, 200)) {
    try {
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
      if (!Number.isFinite(readyAt)) {
        // Malformed `fired_at` — log + skip; never crash. Grader must
        // stay green for legit arrows.
        console.warn(`[grader] arrow ${id} has malformed fired_at="${arrow.fired_at}" — skipping`);
        continue;
      }
      if (Date.now() < readyAt) { still_open++; continue; }

      const outcome = await gradeOne(arrow);
      if (!outcome) { still_open++; continue; }
      const nowIso = new Date().toISOString();
      const closed: Arrow = { ...arrow, status: "graded", outcome: outcome.outcome, graded_at: nowIso, outcome_detail: outcome.detail };
      await kvSet(kvArrow(id), closed);
      // Clear the open-index so a new arrow of same (ticker, type) can fire.
      await kvSet(kvArrowOpenIndex(arrow.ticker, arrow.type), null, 1);
      graded.push(closed);
    } catch (e) {
      // Any unexpected exception per-arrow — record and move on. The
      // outer runPollCycle wrapper is the last safety net but we should
      // never reach it for grader work.
      errored.push(`${id}: ${(e as Error).message}`);
      console.warn(`[grader] crash on ${id}: ${(e as Error).message}`);
    }
  }

  console.log(`[grader] graded=${graded.length} still_open=${still_open} skipped_seeded=${skipped_seeded} errored=${errored.length}`);

  return { graded, still_open, errored };
}

// ── Per-arrow grading ──────────────────────────────────────────────────────
async function gradeOne(arrow: Arrow): Promise<{ outcome: ArrowOutcome; detail: string } | null> {
  const r = await callTool<M5Response>("rh-stock-arb", { ticker: arrow.ticker });
  // Downgraded to a soft skip: throwing here dumped the arrow into
  // `errored[]` every cycle forever, and one bad ticker's rate-limit
  // could parade through the log endlessly. Return null → try again on
  // the next grader pass. `errored[]` is reserved for true crashes.
  if (!r.ok) return null;
  const now = r.data;

  // Pre-merge blocker fix — M5 sometimes returns partial data (missing
  // chainlink or dex object, or missing delta). The grader crashed on
  // #0008 PLTR with "Cannot read properties of null (reading
  // 'price_usd')" — one bad row must NEVER throw and break the whole
  // grader pass. Every M5 field is optional-chained; when we can't get
  // a usable read we return null (skip = try again next cycle) instead
  // of throwing.
  if (!now || typeof now !== "object") return null;
  const dex = now.dex?.price_usd ?? null;
  const oracle = now.chainlink?.price_usd ?? null;
  const deltaPct = typeof now.delta?.pct === "number" ? now.delta.pct : null;
  if (typeof dex !== "number" || dex <= 0) return null;
  if (typeof oracle !== "number" || oracle <= 0) return null;
  if (deltaPct === null) return null;

  if (arrow.type === "arb") {
    const spreadPct = Math.abs(deltaPct);
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
    const nowGapPct = Math.abs(deltaPct);
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
