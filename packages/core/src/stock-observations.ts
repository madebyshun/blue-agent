/** Public observation policy shared by the Base drift board and draft evidence. */
export const STOCK_OBSERVATION_VERSION = 1;
export const STOCK_SNAPSHOT_MAX_AGE_MS = 15 * 60_000;

export function requireFreshStockSnapshot(asOf: string, now: Date): void {
  const age = now.getTime() - Date.parse(asOf);
  if (!Number.isFinite(age) || age < 0 || age > STOCK_SNAPSHOT_MAX_AGE_MS) {
    throw new Error("stock snapshot missing, future-dated or older than 15 minutes");
  }
}

/** A timestamp proves when the last round landed, not why a feed is paused. */
export function stockOracleState(updatedAt: number | null, observedAt: string): "unavailable" | "updated_since_weekend" | "pre_weekend_reference" | "dated_reference" {
  const at = Date.parse(observedAt);
  if (updatedAt == null || !Number.isFinite(updatedAt) || updatedAt <= 0 || !Number.isFinite(at) || updatedAt * 1000 > at) return "unavailable";
  const date = new Date(at);
  const dow = date.getUTCDay();
  if (dow !== 0 && dow !== 1 && dow !== 6) return "dated_reference";
  const friday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - ((dow + 2) % 7) * 86_400_000);
  const cutoff = friday.getTime() + 26 * 3_600_000; // Saturday 02:00 UTC, after Fri 20:00 ET in either DST offset.
  return updatedAt * 1000 >= cutoff ? "updated_since_weekend" : "pre_weekend_reference";
}

export interface StockDraftEvidence {
  source: string;
  as_of: string;
  inputs: unknown;
  method: string;
}

/** Coinbase candle timestamps are bucket STARTS. Never use an unfinished hour. */
export function lastClosedHourlyCandle(rows: number[][], at: string): { close: number; closed_at: string } | null {
  const end = Date.parse(at) / 1000;
  const row = rows.filter((r) => r.length >= 5 && Number.isFinite(r[0]) && r[0] + 3600 <= end && Number.isFinite(r[4]) && r[4] > 0)
    .sort((a, b) => b[0] - a[0])[0];
  if (!row || end - (row[0] + 3600) > 3600) return null;
  return { close: row[4], closed_at: new Date((row[0] + 3600) * 1000).toISOString() };
}
