/**
 * Blue Hood — arrow rule engine.
 *
 * Walks a fresh snapshot, decides which tickers deserve an arrow, and hands
 * them to the persistence layer to fire. Every rule matches the public
 * spec exactly (see docs/blue-hood/arrow-rules.md). The engine NEVER
 * generates numbers on its own — thresholds are literal constants, the
 * snapshot fields are the source of truth.
 *
 * A single-cycle guarantee: dedup keys live in KV under
 * `bh:arrow:open:{ticker}:{type}`. If an open arrow already exists for
 * that (ticker, type) we do NOT fire again; the previous arrow will grade
 * itself before we look at that pair again.
 *
 * MVP note: this file lands drift + arb only. Flow (D2) needs D2 in the
 * snapshot; whale (D1) is informational and heavy (1h/cadence) — both
 * land in a follow-up commit so the drift board can ship first.
 */
import { kvGet, kvSet } from "@/lib/kv";
import { KV_ARROW_SERIAL_COUNTER, kvArrow, kvArrowOpenIndex, KV_ARROW_FEED, TTL_ARROW_INDEX } from "./kv-keys";
import type { Arrow, ArrowType, HoodSnapshot, TickerSnapshot } from "./types";
import { fetchArrowBrief } from "./brief";
import { pushArrowToAll } from "./push";

// ── Thresholds (from spec Block 1.2) ─────────────────────────────────────
const DRIFT_MIN_ABS_PCT = 2.0;   // |drift| ≥ 2% during premarket/afterhours
const ARB_MIN_ABS_PCT = 1.0;     // |delta| ≥ 1% during regular hours
const MIN_TVL_USD = 5_000;       // dust floor — same as M4/M5 already enforce

const DRIFT_GRADING_WINDOW_H = 6;   // grade after next-open + 2h (see grader.ts)
const ARB_GRADING_WINDOW_H = 4;

// ── Detection ──────────────────────────────────────────────────────────────

interface Candidate {
  type: ArrowType;
  expected_direction: "up" | "down";
  grading_window_h: number;
  reference_price: number;
}

/**
 * Given a snapshot row, decide if it's a candidate for firing an arrow
 * (before dust/dedup gates). Returns null if no rule TYPE matches for this
 * row. The distinction between "no candidate" and "candidate but dropped"
 * is what powers the structured `[engine]` log — see `runRuleEngine`.
 */
export function detectCandidate(row: TickerSnapshot): Candidate | null {
  if (row.verdict === "ERROR" || row.verdict === "INSUFFICIENT_DATA") return null;
  const drift = row.drift_pct ?? 0;
  const price = row.dex_usd ?? 0;
  if (price <= 0) return null;

  // ── drift: market CLOSED with a significant drift ─────────────────────
  if (!row.market.is_open && Math.abs(drift) >= DRIFT_MIN_ABS_PCT) {
    return {
      type: "drift",
      expected_direction: drift > 0 ? "down" : "up",
      grading_window_h: DRIFT_GRADING_WINDOW_H,
      reference_price: price,
    };
  }

  // ── arb: market OPEN with a LONG_DEX / SHORT_DEX verdict + threshold ──
  if (row.market.is_open && (row.verdict === "LONG_DEX" || row.verdict === "SHORT_DEX")) {
    if (Math.abs(drift) < ARB_MIN_ABS_PCT) return null;
    return {
      type: "arb",
      expected_direction: row.verdict === "LONG_DEX" ? "up" : "down",
      grading_window_h: ARB_GRADING_WINDOW_H,
      reference_price: price,
    };
  }

  return null;
}

/** Back-compat shim for callers that only want the "should fire?" answer
 *  after all gates. Prefer `detectCandidate` + explicit gate checks in
 *  new code so the engine can log the reason. */
export function detectArrow(row: TickerSnapshot): Candidate | null {
  const c = detectCandidate(row);
  if (!c) return null;
  if ((row.tvl_usd ?? 0) < MIN_TVL_USD) return null;
  if (c.type === "arb" && row.warnings.some((w) => w.startsWith("feed_abnormally_stale"))) return null;
  return c;
}

// ── Fire path ──────────────────────────────────────────────────────────────

async function nextSerial(): Promise<string> {
  const cur = (await kvGet<number>(KV_ARROW_SERIAL_COUNTER)) ?? 0;
  const next = cur + 1;
  await kvSet(KV_ARROW_SERIAL_COUNTER, next);
  return `#${String(next).padStart(4, "0")}`;
}

interface OpenIndex {
  arrow_id: string;
  fired_at: string;
}

/**
 * Idempotency: skip if (ticker, type) already has an open arrow. Otherwise
 * mint a serial, persist the arrow record, update the open-index + feed
 * list, and return the fresh arrow. Returns null on skip.
 *
 * `opts.test` marks the arrow as a synthetic UI smoke — the public feed
 * + hit-rate reader filter these out so a seeded HIT never lands in the
 * "first arrow in Blue Hood history" slot.
 */
/**
 * NOTE (T-A #3, deferred): A4 is currently awaited inline inside fireArrow
 * (~5-15s wall time per arrow). At current fire rates (0-2/cycle) that's
 * fine, but before we run prod 24/7 with expected 3+ arrows/cycle we need
 * to split this into a background job — persist barebones arrow first,
 * queue brief, worker updates `arrow.brief` async, UI shows a
 * `brief: pending…` state and refreshes on the next poll. Tracked as a
 * pre-prod TODO (not blocking T-B).
 */
export async function fireArrow(
  ticker: string,
  detected: Candidate,
  snapshot_ref: number,
  opts: { test?: boolean; origin?: "engine" | "seeded" } = {},
): Promise<Arrow | null> {
  const idxKey = kvArrowOpenIndex(ticker, detected.type);
  const existing = await kvGet<OpenIndex>(idxKey);
  if (existing) return null; // dedup — an open arrow already covers this pair

  const serial = await nextSerial();
  const id = cryptoUuid();
  const now = new Date().toISOString();
  // Reviewer T-A #1: `origin` is the primary "public feed eligibility"
  // flag. Default is "engine" — the only path that ever writes public
  // arrows. Legacy `test: true` is preserved during the migration window
  // for A4-skip purposes; new seeded arrows always carry both.
  const origin: "engine" | "seeded" = opts.origin ?? "engine";
  const arrow: Arrow = {
    id,
    serial,
    ticker,
    type: detected.type,
    expected_direction: detected.expected_direction,
    grading_window_h: detected.grading_window_h,
    reference_price: detected.reference_price,
    snapshot_refs: [snapshot_ref],
    fired_at: now,
    status: "open",
    outcome: null,
    graded_at: null,
    outcome_detail: null,
    brief: null,
    origin,
    ...(opts.test ? { test: true } : {}),
  };

  await kvSet(kvArrow(id), arrow);
  await kvSet(idxKey, { arrow_id: id, fired_at: now } satisfies OpenIndex, TTL_ARROW_INDEX);

  // Push id onto the feed list (newest-first). We keep the feed unbounded
  // for now; when it grows past ~500 we can trim in a follow-up.
  const feed = (await kvGet<string[]>(KV_ARROW_FEED)) ?? [];
  feed.unshift(id);
  await kvSet(KV_ARROW_FEED, feed);

  // T-A — attach A4 "why" brief. Skip on test arrows (would burn LLM $ for
  // nothing) and on any failure (arrow already fires; brief stays null).
  // Called EXACTLY ONCE per arrow at fire time; the UI reads the cached
  // field forever after.
  let finalArrow: Arrow = arrow;
  if (!opts.test) {
    try {
      const brief = await fetchArrowBrief(ticker);
      if (brief) {
        const enriched: Arrow = { ...arrow, brief };
        await kvSet(kvArrow(id), enriched);
        // Structured chain trace — reviewer T-A #2. Every attempt's
        // provider+status logged so a broken chain is grep-visible in prod.
        const chainStr = brief.llm_attempts
          .map((a) => `${a.provider}:${a.status}`)
          .join("→") || "n/a";
        console.log(`[brief] attached to ${serial} ${ticker} llm=${brief.llm_provider ?? "null"} chain=${chainStr} note_len=${brief.verdict_note.length}`);
        finalArrow = enriched;
      } else {
        console.log(`[brief] no brief for ${serial} ${ticker} (A4 returned null)`);
      }
    } catch (e) {
      console.warn(`[brief] fetch crashed for ${serial} ${ticker}: ${(e as Error).message}`);
    }
  }

  // T-D D3 — fan-out web push. Only engine origin, non-test arrows push
  // (guard also inside pushArrowToAll for defense-in-depth). Runs
  // synchronously inside the poll cycle; VAPID keys missing → silent
  // no-op so cron never turns red because of push infra alone.
  if (origin === "engine" && !opts.test) {
    try {
      await pushArrowToAll(finalArrow);
    } catch (e) {
      console.warn(`[push] fan-out crashed for ${serial} ${ticker}: ${(e as Error).message}`);
    }
  }

  return finalArrow;
}

function cryptoUuid(): string {
  try {
    const g = globalThis as { crypto?: { randomUUID?: () => string } };
    if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  } catch { /* fall through */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ── Engine driver ──────────────────────────────────────────────────────────
//
// Report shape mirrors the reviewer-mandated log line so the two never
// drift apart. Sanity property (guaranteed by construction, asserted in
// tests):
//   candidates_over_threshold = skipped_dust + skipped_feed_stale + deduped + fired
//   candidates_over_threshold + below_threshold = tokens_watched
//                                                 - tokens_errored

export interface RuleEngineReport {
  cycle_id: number;
  tokens_watched: number;
  tokens_errored: number;
  candidates_over_threshold: number;
  skipped_dust: number;
  skipped_feed_stale: number;
  below_threshold: number;
  deduped: number;
  fired: number;
  arrows_fired: Arrow[];
}

export async function runRuleEngine(snap: HoodSnapshot): Promise<RuleEngineReport> {
  let candidates_over_threshold = 0;
  let skipped_dust = 0;
  let skipped_feed_stale = 0;
  let below_threshold = 0;
  let deduped = 0;
  const fired: Arrow[] = [];

  for (const row of snap.tickers) {
    if (row.verdict === "ERROR") continue; // errored rows are tracked separately in metrics
    const candidate = detectCandidate(row);
    if (!candidate) { below_threshold++; continue; }
    candidates_over_threshold++;

    // Gates, in the order they short-circuit:
    if ((row.tvl_usd ?? 0) < MIN_TVL_USD) { skipped_dust++; continue; }
    if (candidate.type === "arb" && row.warnings.some((w) => w.startsWith("feed_abnormally_stale"))) {
      skipped_feed_stale++; continue;
    }

    const arrow = await fireArrow(row.ticker, candidate, snap.cycle_id);
    if (arrow) fired.push(arrow);
    else deduped++;
  }

  // Structured log — one line, machine-greppable. `firstError` is soft-off
  // in prod so a bad row doesn't kill the poll cycle.
  console.log(
    `[engine] cycle=${snap.cycle_id}` +
      ` candidates_over_threshold=${candidates_over_threshold}` +
      ` skipped_dust=${skipped_dust}` +
      ` skipped_feed_stale=${skipped_feed_stale}` +
      ` below_threshold=${below_threshold}` +
      ` fired=${fired.length}` +
      ` deduped=${deduped}`,
  );

  return {
    cycle_id: snap.cycle_id,
    tokens_watched: snap.metrics.tokens_watched,
    tokens_errored: snap.metrics.tokens_errored,
    candidates_over_threshold,
    skipped_dust,
    skipped_feed_stale,
    below_threshold,
    deduped,
    fired: fired.length,
    arrows_fired: fired,
  };
}
