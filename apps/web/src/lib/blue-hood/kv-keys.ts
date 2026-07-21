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

/** T-B1 — hourly sparkline series per ticker. 24 close prices from M2.
 *  Refreshed by a separate cron (not the hot 72s poll cycle) so cycle
 *  time stays flat. See `sparkline-refresh` route + `getSparklineCached`. */
export const kvSparkline = (ticker: string) => `bh:spark:${ticker.toUpperCase()}`;

/** T-D D1 — per-address inbox "last-read" bookmark. Stores an ISO
 *  timestamp; UI treats any arrow with `fired_at > last_read` as unread.
 *  Anonymous callers share the "public" key so a fresh session at least
 *  sees the badge; connected wallets get their own scoped bookmark. */
export const kvInboxLastRead = (userId: string) =>
  `bh:inbox:last_read:${userId.toLowerCase()}`;

/** T-D D3 — a single web-push subscription. Serialized full
 *  `PushSubscription` JSON (endpoint + keys). Keyed by endpoint hash
 *  so re-subscribing from the same browser overwrites. */
export const kvPushSub = (endpointHash: string) => `bh:push:sub:${endpointHash}`;

/** T-D D3 — set of active push endpoint hashes (used by the fan-out
 *  when an engine arrow fires). Value = string[] of hashes. */
export const KV_PUSH_SUB_INDEX = "bh:push:index";

/** T-D D2 — Blue Chat card payload for one arrow. Written at fire time
 *  by the engine; Blue Chat pulls by arrow id when the LLM (or a chat
 *  hood tool) references it. Kept separate from the raw `bh:arrow:{id}`
 *  record so the chat consumer only touches a pre-shaped, chat-safe
 *  subset (never the raw brief chain of thought). */
export const kvChatCard = (arrowId: string) => `bh:chat:card:${arrowId}`;

/** T-D D2 — rolling list of chat-card ids (newest first) so the chat
 *  can page/enumerate without walking the whole arrow feed. Trim policy
 *  matches KV_ARROW_FEED (unbounded for now). */
export const KV_CHAT_CARD_FEED = "bh:chat:feed";

/** T-D async-brief queue (reviewer's "pre-prod TODO"). List of arrow
 *  ids whose brief has NOT been attached yet — `fireArrow` appends,
 *  `/api/cron/blue-hood/brief-worker` pops. Kept FIFO so the oldest
 *  pending brief attaches first. */
export const KV_BRIEF_QUEUE = "bh:brief:queue";

/** Pre-merge task #3 — cycle overlap guard. When a poll cycle starts
 *  it takes this lock (TTL 5 min via kvSetNX). Next-tick cron calls
 *  see the lock and no-op with a `[poller] skipped, previous cycle
 *  still running (Xs)` log. Prevents the 246s prod cycle overlapping
 *  the 5-minute schedule (see vercel.json crons; poll runs once every
 *  5 minutes) and bursting GT rate limits. */
export const KV_POLL_LOCK = "bh:poll:lock";
export const TTL_POLL_LOCK = 60 * 5; // 5 min — matches the cron cadence

/** TTL constants (seconds). */
export const TTL_SNAPSHOT_HOUR = 60 * 60 * 25; // 25h so we always have a full 24h window
export const TTL_ARROW_INDEX = 60 * 60 * 24 * 30; // 30d — grading windows are at most 24h
export const TTL_SPARKLINE = 60 * 20; // 20 min — hourly candles don't need to be fresher than that
export const TTL_PUSH_SUB = 60 * 60 * 24 * 90; // 90d — browser subs expire on their own well before this
export const TTL_CHAT_CARD = 60 * 60 * 24 * 30; // 30d — matches TTL_ARROW_INDEX so cards don't outlive arrows

/** Utility: format a Date into `YYYYMMDDHH` for the ring-buffer bucket. */
export function yyyymmddhh(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  return `${y}${m}${day}${h}`;
}
