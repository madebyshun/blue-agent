/**
 * Weekend scorecard — does the price Base trades a stock at on Sunday night
 * say anything about where the stock opens on Monday?
 *
 * ── What is measured, and from where ─────────────────────────────────────────
 * Coinbase B20 stocks trade on Base (8453) 24/7. Their Chainlink feeds are 24/5:
 * the last round lands Friday evening ET and the feed then holds still until the
 * overnight session reopens Sunday 20:00 ET (00:00 / 01:00 UTC Monday). So for
 * the whole weekend there are two prices for one share:
 *   • `close_usd`  — the frozen oracle, i.e. Friday's last print;
 *   • `dex_usd`    — the deepest Base pool, which keeps trading.
 * At SUNDAY 22:00 UTC (before the feed can wake under either DST offset) the
 * gap between them is Base's "weekend call". The call is graded against the
 * oracle's first round inside Monday's regular session (`open_usd`).
 *
 * Every number is read, none is modelled:
 *   • weekend + open prices: the Base desk archive (`bh:base:series:day:*`,
 *     hourly, permanent since 2026-08-28 — see `base-series.ts`);
 *   • an archive hole on the opening day falls back to the same Chainlink feed
 *     and B20 `multiplier()` read on chain AT the historical block;
 *   • BTC / ETH weekend moves (context only): Coinbase Exchange hourly candles.
 *
 * ── Rules fixed BEFORE looking at the result ─────────────────────────────────
 *   • A row is a CALL only when |weekend move| ≥ 0.5%. That is the Chainlink
 *     B20 feed's own deviation step, not a fitted number: a smaller move is one
 *     the oracle itself would not have republished. Below it the row is FLAT and
 *     is not graded for direction.
 *   • A row whose oracle moved during the weekend (corporate action, a late
 *     round) is EXCLUDED — then "close" is not Friday's close.
 *   • The open is per ticker: the first archived regular-session point whose
 *     oracle round is dated at or after that day's 09:30 ET. A Monday holiday
 *     therefore grades against Tuesday's open, which is the next real open.
 *   • Headline hit rate is gated like Blue Hood's: below MIN_CALLS it ships the
 *     count and `needed`, never a percentage.
 */
import { createPublicClient, http, type Address, type PublicClient } from "viem";
import { base } from "viem/chains";
import { kvGetProbe, kvSet } from "@/lib/kv";
import { readBaseSeriesDays } from "@/lib/base-stocks/base-series";
import { BASE_STOCKS } from "@/lib/base-stocks/registry";
import { sharePriceFromFeed } from "@/lib/base-stocks/b20-quote";
import { binomialTestTwoSided, wilsonInterval } from "@/lib/blue-hood/cohort-stats";
import type { SeriesPoint } from "@/lib/blue-hood/types";
import type { DiaryEntry } from "./diary";
import { BASE_SERIES_ARCHIVE_START, yyyymmdd } from "@/lib/blue-hood/kv-keys";

export const CALL_MIN_ABS_PCT = 0.5;
export const MIN_CALLS = 30;
/** Sunday 22:00 UTC: before the 24/5 feed can reopen (00:00 UTC under EDT). */
export const CALL_HOUR_UTC = 22;
export const KV_WEEKEND = "weekend:scorecard:v1";
export const SCORECARD_VERSION = 1;

export type CallDir = "UP" | "DOWN" | "FLAT";

export interface CallRow {
  ticker: string;
  token: Address;
  close_usd: number;
  /** Unix seconds of the frozen round behind `close_usd`. */
  close_round_at: number;
  dex_usd: number;
  weekend_move_pct: number;
  call: CallDir;
}

export interface GradedRow extends CallRow {
  open_usd: number;
  open_round_at: number;
  open_source: "archive" | "chain";
  open_gap_pct: number;
  /** null when the call was FLAT. */
  hit: boolean | null;
  /** |open − dex| and |open − close| as % of close: which price was nearer. */
  dex_error_pct: number;
  flat_error_pct: number;
}

export interface WeekendCall {
  /** Friday of the weekend, YYYY-MM-DD (the label, even when it was a holiday). */
  friday: string;
  call_at: string;
  source: "live" | "archive";
  rows: CallRow[];
  excluded: { ticker: string; reason: string }[];
  crypto: { btc_pct: number | null; eth_pct: number | null; from: string; to: string } | null;
}

export interface GradedWeekend extends Omit<WeekendCall, "rows"> {
  graded_at: string;
  rows: GradedRow[];
  ungraded: { ticker: string; reason: string }[];
}

export interface WeekendStore {
  v: number;
  pending: WeekendCall | null;
  weekends: GradedWeekend[];
  /** Blue's paper book, forward only — see `diary.ts`. */
  diary: DiaryEntry[];
}

export const emptyStore = (): WeekendStore => ({ v: SCORECARD_VERSION, pending: null, weekends: [], diary: [] });

// ── time ─────────────────────────────────────────────────────────────────────

/** Offset of America/New_York from UTC at `d`, in hours (4 under EDT, 5 under EST). */
export function nyOffsetHours(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(d);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"));
  return Math.round((d.getTime() - asUtc) / 3_600_000);
}

/** 09:30 New York on the UTC calendar day `yyyy-mm-dd`, as a Date. */
export function nyOpenUtc(day: string): Date {
  const noon = new Date(`${day}T12:00:00Z`);
  const off = nyOffsetHours(noon);
  return new Date(Date.parse(`${day}T09:30:00Z`) + off * 3_600_000);
}

const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const compact = (day: string) => day.replaceAll("-", "");

/** The Friday that labels the weekend containing `now` (Fri–Mon), else the last one. */
export function fridayOf(now: Date): string {
  const dow = now.getUTCDay(); // 0 Sun … 6 Sat
  const back = (dow + 2) % 7;  // Fri→0, Sat→1, Sun→2, Mon→3, Tue→4 …
  return addDays(now.toISOString().slice(0, 10), -back);
}

export const callInstant = (friday: string) =>
  new Date(Date.parse(`${addDays(friday, 2)}T${String(CALL_HOUR_UTC).padStart(2, "0")}:00:00Z`));

// ── pure grading ─────────────────────────────────────────────────────────────

const pct = (a: number, b: number) => (a / b - 1) * 100;
const r4 = (x: number) => Math.round(x * 10_000) / 10_000;

export function direction(movePct: number): CallDir {
  if (Math.abs(movePct) < CALL_MIN_ABS_PCT) return "FLAT";
  return movePct > 0 ? "UP" : "DOWN";
}

interface RowInput {
  ticker: string;
  oracle_usd: number | null;
  dex_usd: number | null;
  oracle_updated_at?: number | null;
}

/**
 * Build the call from one reading taken at Sunday 22:00 UTC. A row only enters
 * if both prices exist and the oracle round predates Saturday 02:00 UTC (after the feed's Friday 20:00 ET stop) — a
 * round dated inside the weekend means the "close" is not Friday's.
 */
export function buildCall(
  friday: string,
  callAt: string,
  rows: RowInput[],
  source: WeekendCall["source"],
): Pick<WeekendCall, "rows" | "excluded"> & { friday: string; call_at: string; source: WeekendCall["source"] } {
  // The 24/5 feed's week ends Friday 20:00 ET = Saturday 00:00 (EDT) or 01:00
  // (EST) UTC, so the cutoff sits after both: Saturday 02:00 UTC.
  const weekendStart = Date.parse(`${addDays(friday, 1)}T02:00:00Z`) / 1000;
  const out: CallRow[] = [];
  const excluded: { ticker: string; reason: string }[] = [];
  for (const s of BASE_STOCKS) {
    const r = rows.find((x) => x.ticker === s.ticker);
    if (!r || r.oracle_usd == null || r.dex_usd == null) {
      excluded.push({ ticker: s.ticker, reason: "no oracle or DEX price at the call" });
      continue;
    }
    if (r.oracle_updated_at == null) {
      excluded.push({ ticker: s.ticker, reason: "oracle round undated" });
      continue;
    }
    if (r.oracle_updated_at >= weekendStart) {
      excluded.push({ ticker: s.ticker, reason: "oracle moved during the weekend" });
      continue;
    }
    const move = pct(r.dex_usd, r.oracle_usd);
    out.push({
      ticker: s.ticker, token: s.token,
      close_usd: r.oracle_usd, close_round_at: r.oracle_updated_at,
      dex_usd: r.dex_usd, weekend_move_pct: r4(move), call: direction(move),
    });
  }
  return { friday, call_at: callAt, source, rows: out, excluded };
}

export function gradeRow(c: CallRow, open: { usd: number; round_at: number; source: "archive" | "chain" }): GradedRow {
  const gap = pct(open.usd, c.close_usd);
  return {
    ...c,
    open_usd: open.usd,
    open_round_at: open.round_at,
    open_source: open.source,
    open_gap_pct: r4(gap),
    hit: c.call === "FLAT" ? null : (c.call === "UP") === gap > 0,
    dex_error_pct: r4(Math.abs(open.usd - c.dex_usd) / c.close_usd * 100),
    flat_error_pct: r4(Math.abs(open.usd - c.close_usd) / c.close_usd * 100),
  };
}

/**
 * The first archived regular-session reading per ticker whose oracle round is
 * dated at/after that day's 09:30 ET, searching days in order.
 */
export function findOpens(
  points: SeriesPoint[],
  tickers: string[],
  days: string[],
): Map<string, { usd: number; round_at: number; day: string }> {
  const found = new Map<string, { usd: number; round_at: number; day: string }>();
  const sorted = [...points].sort((a, b) => a.hour.localeCompare(b.hour));
  for (const day of days) {
    const openS = nyOpenUtc(day).getTime() / 1000;
    for (const p of sorted) {
      if (!p.hour.startsWith(compact(day)) || p.session !== "regular") continue;
      for (const r of p.rows) {
        if (!tickers.includes(r.ticker) || found.has(r.ticker)) continue;
        if (r.oracle_usd == null || r.oracle_updated_at == null || r.oracle_updated_at < openS) continue;
        found.set(r.ticker, { usd: r.oracle_usd, round_at: r.oracle_updated_at, day });
      }
    }
  }
  return found;
}

export interface Summary {
  weekends: number;
  rows_graded: number;
  calls: number;
  hits: number;
  ready: boolean;
  needed: number;
  hit_rate: number | null;
  ci95: { lo: number; hi: number } | null;
  p_value_two_sided: number | null;
  dex_nearer: number;
  flat_nearer: number;
  mean_dex_error_pct: number | null;
  mean_flat_error_pct: number | null;
  by_size: { bucket: string; calls: number; hits: number }[];
}

export function summarize(weekends: GradedWeekend[]): Summary {
  const rows = weekends.flatMap((w) => w.rows);
  const calls = rows.filter((r) => r.hit !== null);
  const hits = calls.filter((r) => r.hit).length;
  const ready = calls.length >= MIN_CALLS;
  const mean = (xs: number[]) => (xs.length ? r4(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const bucket = (lo: number, hi: number) => {
    const c = calls.filter((r) => Math.abs(r.weekend_move_pct) >= lo && Math.abs(r.weekend_move_pct) < hi);
    return { bucket: hi === Infinity ? `≥${lo}%` : `${lo}–${hi}%`, calls: c.length, hits: c.filter((r) => r.hit).length };
  };
  const ci = ready ? wilsonInterval(hits, calls.length) : null;
  return {
    weekends: weekends.length,
    rows_graded: rows.length,
    calls: calls.length,
    hits,
    ready,
    needed: MIN_CALLS,
    hit_rate: ready ? r4(hits / calls.length) : null,
    ci95: ci ? { lo: r4(ci.lo), hi: r4(ci.hi) } : null,
    p_value_two_sided: ready ? r4(binomialTestTwoSided(hits, calls.length, 0.5)) : null,
    dex_nearer: rows.filter((r) => r.dex_error_pct < r.flat_error_pct).length,
    flat_nearer: rows.filter((r) => r.flat_error_pct < r.dex_error_pct).length,
    mean_dex_error_pct: mean(rows.map((r) => r.dex_error_pct)),
    mean_flat_error_pct: mean(rows.map((r) => r.flat_error_pct)),
    by_size: [bucket(CALL_MIN_ABS_PCT, 1), bucket(1, 2), bucket(2, Infinity)],
  };
}

// ── IO ───────────────────────────────────────────────────────────────────────

export async function loadStore(): Promise<WeekendStore | "error"> {
  const p = await kvGetProbe<WeekendStore>(KV_WEEKEND);
  if (p.status === "error") return "error";
  if (p.status === "miss") return emptyStore();
  return { ...emptyStore(), ...p.value };
}

export async function saveStore(s: WeekendStore): Promise<void> {
  // No TTL: this is a record, like the archive it is graded from.
  await kvSet(KV_WEEKEND, { ...s, weekends: [...s.weekends].sort((a, b) => a.friday.localeCompare(b.friday)) });
}

export async function readPoints(days: string[]): Promise<{ points: SeriesPoint[]; missing: string[] }> {
  const reads = await readBaseSeriesDays(days.map(compact));
  const points: SeriesPoint[] = [];
  const missing: string[] = [];
  for (const r of reads) {
    if (r.status === "hit") points.push(...r.value.points);
    else missing.push(r.day);
  }
  return { points, missing };
}

/** Context only: BTC and ETH move from `fromIso` to `toIso` (Coinbase Exchange hourly closes). */
export async function cryptoMove(fromIso: string, toIso: string): Promise<WeekendCall["crypto"]> {
  const one = async (pair: string): Promise<number | null> => {
    const closeAt = async (iso: string) => {
      const t = Date.parse(iso);
      const start = new Date(t - 3_600_000).toISOString();
      const u = `https://api.exchange.coinbase.com/products/${pair}/candles?granularity=3600&start=${start}&end=${iso}`;
      const r = await fetch(u, { headers: { accept: "application/json", "user-agent": "blueagent-weekend/1" }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) return null;
      const rows = (await r.json()) as number[][];
      const last = rows.filter((x) => x[0] * 1000 <= t).sort((a, b) => b[0] - a[0])[0];
      return last ? last[4] : null;
    };
    try {
      const [a, b] = await Promise.all([closeAt(fromIso), closeAt(toIso)]);
      return a && b ? r4(pct(b, a)) : null;
    } catch {
      return null;
    }
  };
  const [btc, eth] = await Promise.all([one("BTC-USD"), one("ETH-USD")]);
  return { btc_pct: btc, eth_pct: eth, from: fromIso, to: toIso };
}

// ── chain fallback for an archive hole on the opening day ───────────────────

/** Base switched from 2 s to 0.2 s blocks at this block (2026-11-05). */
const FAST_BLOCKS_FROM = 53_556_344n;
const FEED_ABI = [
  { name: "latestRoundData", type: "function", stateMutability: "view", inputs: [], outputs: [
    { name: "roundId", type: "uint80" }, { name: "answer", type: "int256" }, { name: "startedAt", type: "uint256" },
    { name: "updatedAt", type: "uint256" }, { name: "answeredInRound", type: "uint80" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;
const MULT_ABI = [{ name: "multiplier", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }] as const;

let archiveClient: PublicClient | null = null;
function client(): PublicClient {
  // publicnode serves historical eth_call; mainnet.base.org does not reliably.
  archiveClient ??= createPublicClient({ chain: base, transport: http("https://base-rpc.publicnode.com", { retryCount: 2, timeout: 10_000 }) }) as PublicClient;
  return archiveClient;
}

export async function blockAt(ts: number): Promise<bigint> {
  const c = client();
  const head = await c.getBlock();
  const switchBlock = await c.getBlock({ blockNumber: FAST_BLOCKS_FROM });
  let est = ts >= Number(switchBlock.timestamp)
    ? head.number - BigInt(Math.round((Number(head.timestamp) - ts) / 0.2))
    : FAST_BLOCKS_FROM - BigInt(Math.round((Number(switchBlock.timestamp) - ts) / 2));
  for (let i = 0; i < 3; i++) {
    const b = await c.getBlock({ blockNumber: est });
    const diff = ts - Number(b.timestamp);
    if (Math.abs(diff) <= 2) break;
    est += BigInt(Math.round(diff / (est >= FAST_BLOCKS_FROM ? 0.2 : 2)));
  }
  return est;
}

/** Oracle share price on chain at `ts`, multiplier divided out exactly as the live read does. */
export async function chainPriceAt(ticker: string, ts: number): Promise<{ usd: number; round_at: number } | null> {
  const s = BASE_STOCKS.find((x) => x.ticker === ticker);
  if (!s) return null;
  const c = client();
  const blockNumber = await blockAt(ts);
  const [round, dec, mult] = await Promise.all([
    c.readContract({ address: s.chainlinkFeed, abi: FEED_ABI, functionName: "latestRoundData", blockNumber }),
    c.readContract({ address: s.chainlinkFeed, abi: FEED_ABI, functionName: "decimals", blockNumber }),
    c.readContract({ address: s.token, abi: MULT_ABI, functionName: "multiplier", blockNumber }),
  ]);
  return { usd: sharePriceFromFeed(round[1], Number(dec), mult), round_at: Number(round[3]) };
}

// ── the two steps the cron runs ──────────────────────────────────────────────

/** The call from the archive's Sunday 22:00 UTC point (backfill path). */
export async function callFromArchive(friday: string): Promise<WeekendCall | null> {
  const sunday = addDays(friday, 2);
  if (compact(sunday) < BASE_SERIES_ARCHIVE_START) return null;
  const { points } = await readPoints([sunday]);
  const hour = `${compact(sunday)}${CALL_HOUR_UTC}`;
  const p = points.find((x) => x.hour === hour);
  if (!p) return null;
  const built = buildCall(friday, p.at, p.rows, "archive");
  const freeze = built.rows.length ? Math.max(...built.rows.map((r) => r.close_round_at)) : null;
  const crypto = freeze ? await cryptoMove(new Date(freeze * 1000).toISOString(), p.at) : null;
  return { ...built, crypto };
}

/**
 * Grade a call. Returns null while the next open has not happened yet (or the
 * archive is still catching up), so the cron simply tries again next hour.
 */
export async function gradeCall(call: WeekendCall, now: Date): Promise<GradedWeekend | null> {
  const monday = addDays(call.friday, 3);
  const days = [monday, addDays(monday, 1), addDays(monday, 2)];
  // Give the first regular hour time to land in the archive before judging.
  if (now.getTime() < nyOpenUtc(monday).getTime() + 90 * 60_000) return null;

  const tickers = call.rows.map((r) => r.ticker);
  const { points } = await readPoints(days.filter((d) => compact(d) <= yyyymmdd(now)));

  const ungraded: { ticker: string; reason: string }[] = [];
  const rows: GradedRow[] = [];
  // Day by day, in order: a day the archive covers is read from the archive;
  // a day it missed (no regular-session point at all) is read from chain. The
  // first day that yields a post-09:30 round wins, so an archive hole on
  // Monday is filled from Monday's chain, never skipped to Tuesday's archive.
  for (const c of call.rows) {
    let got: { usd: number; round_at: number; source: "archive" | "chain" } | null = null;
    for (const d of days) {
      const open = nyOpenUtc(d).getTime();
      if (now.getTime() < open + 90 * 60_000) break;
      const dayHasRegular = points.some((p) => p.hour.startsWith(compact(d)) && p.session === "regular");
      if (dayHasRegular) {
        const a = findOpens(points, [c.ticker], [d]).get(c.ticker);
        if (a) { got = { usd: a.usd, round_at: a.round_at, source: "archive" }; break; }
        continue; // archive saw the session, the feed never moved: a holiday
      }
      for (const after of [30, 60, 90]) {
        try {
          const x = await chainPriceAt(c.ticker, Math.floor((open + after * 60_000) / 1000));
          if (x && x.round_at * 1000 >= open) { got = { ...x, source: "chain" }; break; }
        } catch { /* try the next slot */ }
      }
      if (got) break;
    }
    if (got) rows.push(gradeRow(c, got));
    else ungraded.push({ ticker: c.ticker, reason: "no opening round found yet" });
  }
  // Wait while anything is still findable later in the window.
  const lastDayOver = now.getTime() > nyOpenUtc(days[2]).getTime() + 90 * 60_000;
  if (ungraded.length && !lastDayOver) return null;
  return { ...call, graded_at: now.toISOString(), rows, ungraded };
}

export function publicCall(c: WeekendCall) {
  return { ...c, rows: c.rows.map((r) => ({ ...r, explorer: `https://basescan.org/token/${r.token}` })) };
}

export function publicWeekend(w: GradedWeekend) {
  return { ...w, rows: w.rows.map((r) => ({ ...r, explorer: `https://basescan.org/token/${r.token}` })) };
}

export const METHOD = {
  chain: "base",
  chain_id: 8453,
  call_at: "Sunday 22:00 UTC, before the 24/5 Chainlink feed reopens",
  weekend_move: "Base DEX price ÷ frozen Chainlink price (Friday's last round) − 1",
  call_threshold_abs_pct: CALL_MIN_ABS_PCT,
  call_threshold_why: "the Chainlink B20 feed's own 0.5% deviation step; smaller moves are FLAT and not graded",
  open: "Chainlink price at the first hourly reading of the next regular session whose round is dated after 09:30 ET, about 30 minutes after the bell (a Monday holiday grades on Tuesday)",
  sources: ["Base desk hourly archive (bh:base:series:day:*)", "Chainlink feed + B20 multiplier() on chain for archive holes", "Coinbase Exchange hourly candles (BTC/ETH context only)"],
  gate: `hit rate is published only from ${MIN_CALLS} graded calls; below that: calls, hits and needed`,
} as const;
