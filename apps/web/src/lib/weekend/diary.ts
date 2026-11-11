/**
 * Blue's weekend book — a public paper portfolio with a diary.
 *
 * The agent does NOT pick trades. One rule, fixed on 2026-11-11 before any
 * forward entry existed, decides every position in code:
 *
 *   For each Base stock whose weekend call is UP or DOWN (|move| ≥ 0.5%, the
 *   scorecard's own threshold), take a $1,000 PAPER position in the direction
 *   Base priced it, entered at the Sunday 22:00 UTC Base DEX price and closed
 *   at the next regular-session open (the oracle's first round after 09:30 ET).
 *
 * Paper because shorting a B20 stock on Base needs a borrow, and because a real
 * book would need a wallet — custody is not something this file decides.
 *
 * What the model does: it writes two short diary notes (one at the call, one
 * after the grade) from the numbers it is handed, at temperature 0, and the
 * entry ships them as `note_model_generated`. It never sees anything it could
 * turn into a number of its own, and if the model is unavailable the entry
 * stands without a note.
 *
 * The rule was backtested on the archive before going live and it LOST money
 * there; that result is published with the diary (`BACKTEST`) rather than
 * tuned away. The forward record starts with the first live Sunday.
 */
import { callLLM } from "@/app/api/_lib/llm";
import type { GradedWeekend, WeekendCall } from "./scorecard";

export const STAKE_USD = 1000;
export const RULE =
  "Every Base stock whose Sunday 22:00 UTC weekend call is UP or DOWN (|DEX vs frozen Chainlink| ≥ 0.5%) gets a $1,000 paper position in that direction, entered at the Base DEX price and closed at the next regular-session open. No discretion, no sizing, no stops.";
export const RULE_FIXED_AT = "2026-11-11";

/**
 * In-sample result of RULE on the Base desk archive, measured 2026-11-11 with
 * this module's own grader over the 11 weekends 2026-08-28 … 2026-11-06
 * (86 graded rows, Monday 2026-11-09 read from chain because of an archive
 * hole). Published so the forward record is read against it, not instead of it.
 */
export const BACKTEST = {
  measured_at: "2026-11-11",
  weekends: 11,
  trades: 35,
  wins: 14,
  avg_return_pct: -0.79,
  pnl_usd: -276,
  note: "in-sample, before the rule went live; the rule was not changed after seeing it. Same 35 calls as the scorecard, scored differently: a scorecard hit is the open's direction vs Friday's close (20 of 35); a trade win is the open vs the Base DEX entry, so a right call that Base had already priced past still loses (14 of 35)",
} as const;

export interface Position {
  ticker: string;
  side: "LONG" | "SHORT";
  entry_usd: number;
  stake_usd: number;
}

export interface DiaryEntry {
  friday: string;
  opened_at: string;
  positions: Position[];
  note_open: string | null;
  closed_at: string | null;
  results: { ticker: string; side: Position["side"]; entry_usd: number; exit_usd: number; return_pct: number; pnl_usd: number }[] | null;
  pnl_usd: number | null;
  note_close: string | null;
  note_model_generated: true;
}

export interface DiaryStore {
  v: 1;
  entries: DiaryEntry[];
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function positionsFor(call: WeekendCall): Position[] {
  return call.rows
    .filter((r) => r.call !== "FLAT")
    .map((r) => ({ ticker: r.ticker, side: r.call === "UP" ? "LONG" : "SHORT", entry_usd: r.dex_usd, stake_usd: STAKE_USD }));
}

export function settle(entry: DiaryEntry, graded: GradedWeekend): DiaryEntry["results"] {
  return entry.positions.flatMap((p) => {
    const g = graded.rows.find((r) => r.ticker === p.ticker);
    if (!g) return [];
    const raw = (g.open_usd / p.entry_usd - 1) * 100;
    const ret = p.side === "LONG" ? raw : -raw;
    return [{ ticker: p.ticker, side: p.side, entry_usd: p.entry_usd, exit_usd: g.open_usd, return_pct: r2(ret), pnl_usd: r2((ret / 100) * p.stake_usd) }];
  });
}

const SYSTEM =
  "You are Blue, an agent that keeps a public paper trading diary for tokenized stocks on Base. " +
  "Write 2-3 plain sentences in first person. Use ONLY the numbers given; never add a price, percentage, forecast or reason that is not in the input. " +
  "Do not use em dashes. Do not give advice. If there are no positions, say so plainly.";

async function note(user: string): Promise<string | null> {
  try {
    const r = await callLLM({ system: SYSTEM, user, temperature: 0, maxTokens: 220, reasoningEffort: "none" });
    const t = r.text.trim().replace(/—/g, ",");
    return t.length ? t.slice(0, 600) : null;
  } catch {
    return null;
  }
}

export async function openEntry(call: WeekendCall, now: Date): Promise<DiaryEntry> {
  const positions = positionsFor(call);
  const flat = call.rows.filter((r) => r.call === "FLAT").map((r) => r.ticker);
  const lines = call.rows.map((r) => `${r.ticker}c: Base DEX ${r.weekend_move_pct.toFixed(2)}% vs Friday close (${r.call})`);
  const crypto = call.crypto ? `BTC ${call.crypto.btc_pct ?? "n/a"}%, ETH ${call.crypto.eth_pct ?? "n/a"}% over the same window.` : "";
  const note_open = await note(
    `Weekend of ${call.friday}. Rule: ${RULE}\nReadings:\n${lines.join("\n")}\n${crypto}\n` +
      `Positions taken: ${positions.map((p) => `${p.side} ${p.ticker}c at $${p.entry_usd}`).join(", ") || "none"}. Flat: ${flat.join(", ") || "none"}.`,
  );
  return {
    friday: call.friday, opened_at: now.toISOString(), positions, note_open,
    closed_at: null, results: null, pnl_usd: null, note_close: null, note_model_generated: true,
  };
}

export async function closeEntry(entry: DiaryEntry, graded: GradedWeekend, now: Date): Promise<DiaryEntry> {
  const results = settle(entry, graded) ?? [];
  const pnl = r2(results.reduce((a, r) => a + r.pnl_usd, 0));
  const note_close = await note(
    `Weekend of ${entry.friday}, closed at the open. Results: ` +
      (results.map((r) => `${r.side} ${r.ticker}c ${r.return_pct}% ($${r.pnl_usd})`).join(", ") || "no positions") +
      `. Total paper P&L $${pnl}.`,
  );
  return { ...entry, closed_at: now.toISOString(), results, pnl_usd: pnl, note_close };
}

export function diaryTotals(entries: DiaryEntry[]) {
  const closed = entries.filter((e) => e.results);
  const trades = closed.flatMap((e) => e.results ?? []);
  return {
    weekends_closed: closed.length,
    trades: trades.length,
    wins: trades.filter((t) => t.pnl_usd > 0).length,
    pnl_usd: r2(trades.reduce((a, t) => a + t.pnl_usd, 0)),
    avg_return_pct: trades.length ? r2(trades.reduce((a, t) => a + t.return_pct, 0) / trades.length) : null,
  };
}
