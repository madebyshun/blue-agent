/**
 * Blue Hood — KV key conventions.
 *
 * Namespaced under `bh:` so this whole subsystem can be prefix-scanned or
 * flushed without touching other KV-backed features. Do NOT hardcode
 * these strings anywhere else — always import from here.
 */

/** Latest completed snapshot (written by the 60s poller). Readers of /hood + the alert engine hit this. */
export const KV_SNAPSHOT_LATEST = "bh:snapshot:latest";

/** Ring buffer entry for hour `H` (YYYYMMDDHH). Keep 24h for sparkline history. */
export const kvSnapshotHour = (yyyymmddhh: string) => `bh:snapshot:hour:${yyyymmddhh}`;

/** Monotonic counter for the aesthetic `#0001` serial. */
export const KV_ARROW_SERIAL_COUNTER = "bh:arrow:serial";

/** Individual arrow record. */
export const kvArrow = (id: string) => `bh:arrow:${id}`;

/** Index of currently-open (not yet graded) arrow ids per (ticker, type) — used for de-dup. */
export const kvArrowOpenIndex = (ticker: string, type: string) =>
  `bh:arrow:open:${ticker.toLowerCase()}:${type}`;

/** Rolling list of all arrow ids (newest first) — used by /hood feed + hit-rate math. */
export const KV_ARROW_FEED = "bh:arrow:feed";

/** TTL constants (seconds). */
export const TTL_SNAPSHOT_HOUR = 60 * 60 * 25; // 25h so we always have a full 24h window
export const TTL_ARROW_INDEX = 60 * 60 * 24 * 30; // 30d — grading windows are at most 24h

/** Utility: format a Date into `YYYYMMDDHH` for the ring-buffer bucket. */
export function yyyymmddhh(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  return `${y}${m}${day}${h}`;
}
