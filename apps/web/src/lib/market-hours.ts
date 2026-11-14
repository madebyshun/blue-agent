// NYSE trading clock — DST-correct, holiday-aware.
//
// Why this file exists: the old helper in `lib/robinhood/rwa-market.ts` read
// New York time as `now − 4h`, a fixed UTC-4 literal with a comment admitting
// it ignored DST edges and holidays. The US switched to EST on 2026-11-01, so
// from then until the March switch the whole desk opened and closed one hour
// early: 13:30Z/20:00Z instead of 14:30Z/21:00Z. That mislabelled rows in five
// shipped places (`base-poller`, `rh-stock-arb`, `rh-stock-agent-brief`,
// `brief/stocks`, `pre-trade-check`) — a "regular session" label on an hour
// that is not regular.
//
// Two rules this module keeps:
//
//   1. Derive the offset, never assume it. `Intl` with `America/New_York` is
//      the system's own answer and it handles every DST edge. No table, no
//      arithmetic on month numbers.
//   2. Say when the calendar is unknown. Holidays are a published list, not a
//      rule, and this repo has no calendar feed. Past its last known year the
//      clock still reads the session correctly but sets `calendar_known:
//      false` rather than guessing that a given weekday is a trading day.
//
// This module is deliberately import-free and side-effect-free so it can be
// exercised directly by `scripts/nyse-clock-check.ts` with real timestamps.

export type NyseSession = "regular" | "premarket" | "afterhours" | "weekend" | "holiday";

export interface NyseMarketStatus {
  is_open: boolean;
  session: NyseSession;
  /** New York wall-clock time, carried in the ISO fields (see note below). */
  ny_time_iso: string;
  /** Hours New York is behind UTC: 4 under EDT, 5 under EST. */
  utc_offset_hours: number;
  /** False when the date falls outside the holiday list in this file. */
  calendar_known: boolean;
}

const REGULAR_OPEN_MIN = 9 * 60 + 30;  // 09:30 ET
const REGULAR_CLOSE_MIN = 16 * 60;     // 16:00 ET

/**
 * Full-day NYSE closures. Source: NYSE/ICE 2026–2028 holiday calendar
 * ("dates correct as of Dec 10 2025, subject to change"). Only the years the
 * source states are here — 2027 and 2028 are partial on purpose, and the
 * entries the source truncated were left out rather than assumed.
 */
const FULL_CLOSURES = new Set<string>([
  // 2026
  "2026-01-01", // New Year's Day
  "2026-01-19", // Martin Luther King Jr. Day
  "2026-02-16", // Washington's Birthday
  "2026-04-03", // Good Friday
  "2026-05-25", // Memorial Day
  "2026-06-19", // Juneteenth
  "2026-07-03", // Independence Day (observed)
  "2026-09-07", // Labor Day
  "2026-11-26", // Thanksgiving
  "2026-12-25", // Christmas
  // 2027
  "2027-01-01",
  "2027-01-18",
  "2027-02-15",
  "2027-03-26",
  "2027-05-31",
  // 2028
  "2028-01-17",
  "2028-02-21",
  "2028-04-14",
]);

/** Early closes: 13:00 ET for cash equities. */
const EARLY_CLOSES = new Map<string, number>([
  ["2026-11-27", 13 * 60], // day after Thanksgiving
  ["2026-12-24", 13 * 60], // Christmas Eve
]);

const CALENDAR_FIRST_YEAR = 2026;
const CALENDAR_LAST_YEAR = 2028;

const NY_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

interface WallClock {
  y: number;
  m: number;
  d: number;
  /** Minutes since midnight, New York. */
  minutes: number;
  /** 0 Sun … 6 Sat, New York. */
  weekday: number;
  /** YYYY-MM-DD in New York. */
  date: string;
}

function wallClock(now: Date): WallClock {
  const parts = NY_PARTS.formatToParts(now);
  const got = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  // `hour12: false` renders midnight as 24 in some ICU builds; fold it back.
  const hour = got("hour") % 24;
  const minute = got("minute");
  const y = got("year");
  const m = got("month");
  const d = got("day");
  // Weekday from the New York calendar date, so a 23:30Z Saturday that is
  // still Friday in New York answers Friday.
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { y, m, d, minutes: hour * 60 + minute, weekday, date: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
}

/**
 * Hours to ADD to New York wall time to get UTC: 4 under EDT, 5 under EST.
 * Same sign convention as `nyOffsetHours` in `lib/weekend/scorecard.ts`, so a
 * reader who has met one has met both.
 */
export function nyUtcOffsetHours(now: Date): number {
  const p = wallClock(now);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, Math.floor(p.minutes / 60), p.minutes % 60);
  return Math.round((now.getTime() - asUtc) / 3_600_000);
}

/**
 * The NYSE session at `now`.
 *
 * `ny_time_iso` keeps the convention the rest of the repo already stores: the
 * New York wall clock carried in the ISO fields (a "fake Z"). It is a label,
 * never an instant to be parsed back — changing the convention would silently
 * reinterpret every value already written into the rule fire record.
 */
export function nyseMarketStatus(now: Date = new Date()): NyseMarketStatus {
  const p = wallClock(now);
  const offset = nyUtcOffsetHours(now);
  const ny_time_iso = new Date(now.getTime() - offset * 3_600_000).toISOString();
  const calendar_known = p.y >= CALENDAR_FIRST_YEAR && p.y <= CALENDAR_LAST_YEAR;
  const base = { ny_time_iso, utc_offset_hours: -offset, calendar_known };

  if (p.weekday === 0 || p.weekday === 6) {
    return { ...base, is_open: false, session: "weekend" };
  }
  if (FULL_CLOSURES.has(p.date)) {
    return { ...base, is_open: false, session: "holiday" };
  }

  const close = EARLY_CLOSES.get(p.date) ?? REGULAR_CLOSE_MIN;
  if (p.minutes < REGULAR_OPEN_MIN) return { ...base, is_open: false, session: "premarket" };
  if (p.minutes >= close) return { ...base, is_open: false, session: "afterhours" };
  return { ...base, is_open: true, session: "regular" };
}
