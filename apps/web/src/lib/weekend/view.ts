/**
 * The two public views over the weekend record, shared by the $0.00 x402 ids
 * (weekend-scorecard, weekend-diary) and the /markets/weekend page, so the page
 * can never show a different number from the API. Each returns "error" when the
 * record is unreadable — callers answer 503 / show an outage, never an empty card.
 */
import { kvGetProbe } from "@/lib/kv";
import { KV_BASE_ROWS_LATEST, BASE_ROWS_MAX_AGE_MS } from "@/lib/blue-hood/kv-keys";
import type { BaseDeskLatest } from "@/lib/blue-hood/types";
import {
  METHOD, buildCall, fridayOf, loadStore, nyOpenUtc, publicCall, publicWeekend, readPoints, summarize,
} from "./scorecard";
import { BACKTEST, RULE, RULE_FIXED_AT, STAKE_USD, diaryTotals } from "./diary";

const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export const WEEKEND_PAGE = "https://blueagent.dev/markets/weekend";

/** Saturday 00:00 UTC → the next Monday 09:30 ET: the window a live view means something. */
export function inWeekendWindow(now: Date): boolean {
  const friday = fridayOf(now);
  const start = Date.parse(`${addDays(friday, 1)}T00:00:00Z`);
  return now.getTime() >= start && now.getTime() < nyOpenUtc(addDays(friday, 3)).getTime();
}

async function liveView(now: Date) {
  if (!inWeekendWindow(now)) return null;
  const p = await kvGetProbe<BaseDeskLatest>(KV_BASE_ROWS_LATEST);
  if (p.status !== "hit") return null;
  const age = now.getTime() - Date.parse(p.value.started_at);
  if (!(age >= 0 && age <= BASE_ROWS_MAX_AGE_MS)) return null;
  const c = buildCall(fridayOf(now), p.value.started_at, p.value.rows, "live");
  return { ...publicCall({ ...c, crypto: null }), provisional: true as const, note: "Reading right now, not the graded call. The call is taken Sunday 22:00 UTC." };
}

export async function scorecardView(opts: { ticker?: string | null; limit?: number } = {}) {
  const store = await loadStore();
  if (store === "error") return "error" as const;
  const ticker = opts.ticker ?? null;
  const limit = opts.limit ?? 12;
  const pick = <T extends { rows: { ticker: string }[] }>(x: T): T => (ticker ? { ...x, rows: x.rows.filter((r) => r.ticker === ticker) } : x);
  const all = [...store.weekends].sort((a, b) => b.friday.localeCompare(a.friday)).map(pick);
  const live = await liveView(new Date()).catch(() => null);
  return {
    chain: "base" as const,
    chain_id: 8453,
    ticker,
    method: METHOD,
    summary: summarize(all),
    live: live ? pick(live) : null,
    pending: store.pending ? pick(publicCall(store.pending)) : null,
    weekends: all.slice(0, limit).map(publicWeekend),
    weekends_total: all.length,
    page: WEEKEND_PAGE,
  };
}

export async function diaryView(opts: { limit?: number } = {}) {
  const store = await loadStore();
  if (store === "error") return "error" as const;
  const entries = [...store.diary].sort((a, b) => b.friday.localeCompare(a.friday));
  return {
    chain: "base" as const,
    chain_id: 8453,
    book: "paper" as const,
    stake_usd: STAKE_USD,
    rule: RULE,
    rule_fixed_at: RULE_FIXED_AT,
    backtest: BACKTEST,
    forward: diaryTotals(entries),
    entries: entries.slice(0, opts.limit ?? 12),
    entries_total: entries.length,
    notes: "Positions, prices and P&L are computed in code. Each note is model-generated from those numbers (note_model_generated: true).",
    page: WEEKEND_PAGE,
  };
}

/**
 * Hourly oracle vs Base DEX for one ticker across one weekend (Friday 12:00
 * UTC → the open + 3h), straight from the Base desk archive. Four KV reads;
 * the page calls it for ONE weekend only.
 */
export async function weekendReplay(friday: string, ticker: string) {
  const days = [0, 1, 2, 3].map((n) => addDays(friday, n));
  const { points } = await readPoints(days);
  const from = Date.parse(`${friday}T12:00:00Z`);
  const to = nyOpenUtc(addDays(friday, 3)).getTime() + 3 * 3_600_000;
  return points
    .filter((p) => { const t = Date.parse(p.at); return t >= from && t <= to; })
    .sort((a, b) => a.at.localeCompare(b.at))
    .flatMap((p) => {
      const r = p.rows.find((x) => x.ticker === ticker);
      return r && r.oracle_usd != null && r.dex_usd != null ? [{ at: p.at, oracle: r.oracle_usd, dex: r.dex_usd, session: p.session }] : [];
    });
}
