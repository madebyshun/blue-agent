/**
 * Validation of a watch rule — shared by /api/watches (POST) and the chat
 * tool that drafts one, so chat can never offer a rule the API would refuse.
 */
import type { WatchCheckAt, WatchDirection, WatchKind, WatchTrade, WatchWindow } from "./types";
import { QUANTITY_WORD_RE, wordToBps } from "@/lib/wallet/amount";

export function parseRule(b: Record<string, unknown>): { kind: WatchKind; direction: WatchDirection; threshold: number; window?: WatchWindow } | { error: string } {
  const kind = b.kind === "change" ? "change" : b.kind === "price" ? "price" : null;
  if (!kind) return { error: "kind must be 'price' or 'change'" };
  const threshold = Number(b.threshold);
  if (!Number.isFinite(threshold) || threshold <= 0) return { error: "threshold must be a positive number" };
  if (kind === "price") {
    if (b.direction !== "above" && b.direction !== "below") return { error: "a price watch is 'above' or 'below'" };
    if (threshold > 1e12) return { error: "threshold is out of range" };
    return { kind, direction: b.direction, threshold };
  }
  if (b.direction !== "up" && b.direction !== "down") return { error: "a change watch is 'up' or 'down'" };
  if (threshold < 1 || threshold > 1000) return { error: "a change threshold is between 1% and 1000%" };
  const window = b.window === "1h" ? "1h" : b.window === "24h" ? "24h" : null;
  if (!window) return { error: "a change watch needs window '1h' or '24h'" };
  return { kind, direction: b.direction, threshold, window };
}


/** A trade to prepare: buy = a dollar amount of the chain's cash; sell = a
 *  token amount or a quantity word (all / max / half / N%). Missing → none. */
export function parseTrade(v: unknown): { trade?: WatchTrade } | { error: string } {
  if (v == null || v === "") return {};
  if (typeof v !== "object") return { error: "trade must be { side, amount }" };
  const t = v as Record<string, unknown>;
  if (t.side !== "buy" && t.side !== "sell") return { error: "trade side is 'buy' or 'sell'" };
  const amount = String(t.amount ?? "").trim().replace(/^\$/, "");
  if (t.side === "buy") {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) return { error: "a buy needs a dollar amount between 0 and 1,000,000" };
    return { trade: { side: "buy", amount: String(n) } };
  }
  // Quantity words are lib/wallet/amount.ts's set — the same one the trade
  // cards resolve against the live balance, so the card can honour any word
  // accepted here. wordToBps rejects 0% and anything over 100%.
  // wordToBps caps "150%" at everything (right for a live card, where the user
  // is looking at it); a standing instruction refuses it instead, so what was
  // saved is what was meant.
  if (QUANTITY_WORD_RE.test(amount)) {
    const overHundred = amount.endsWith("%") && parseFloat(amount) > 100;
    return wordToBps(amount) != null && !overHundred
      ? { trade: { side: "sell", amount: amount.toLowerCase() } }
      : { error: "a sell percentage is between 0% and 100%" };
  }
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return { error: "a sell needs a token amount, or all / half / N%" };
  return { trade: { side: "sell", amount: String(n) } };
}

/** A fixed check time (daily/weekly at HH:MM in an IANA zone). Missing → every 5 min. */
export function parseCheckAt(v: unknown): { checkAt?: WatchCheckAt } | { error: string } {
  if (v == null || v === "") return {};
  if (typeof v !== "object") return { error: "check_at must be { schedule, time }" };
  const c = v as Record<string, unknown>;
  const schedule = c.schedule === "weekly" ? "weekly" : c.schedule === "daily" ? "daily" : null;
  if (!schedule) return { error: "check_at.schedule is 'daily' or 'weekly'" };
  const time = String(c.time ?? "");
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return { error: "check_at.time is HH:MM" };
  const tz = typeof c.tz === "string" && /^[A-Za-z_]+(\/[A-Za-z_+-]+)*$/.test(c.tz) && c.tz.length <= 64 ? c.tz : undefined;
  return { checkAt: { schedule, time: `${m[1].padStart(2, "0")}:${m[2]}`, ...(tz ? { tz } : {}) } };
}
