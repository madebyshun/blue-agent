/**
 * When Base stock-token volume trades, by the NYSE clock.
 *
 * For each Base desk stock (Base 8453): the 3 deepest pools on GeckoTerminal,
 * hourly USD volume over the last 4 full UTC weeks (Monday 00:00 to Monday
 * 00:00), each hour bucketed in New York time:
 *   - open    : Mon-Fri 09:30-16:00
 *   - weekend : Friday 20:00 to Sunday 20:00
 *   - nights  : everything else (overnight, pre- and post-market)
 * An hour is bucketed by its start. A pool younger than the window simply had
 * no volume before it existed, so it is counted as is (the window is 672 h
 * and GeckoTerminal returns up to 1000 non-empty hours, so nothing is cut).
 * A record is stored only when EVERY ticker with a pool was read: a partial
 * read (GeckoTerminal 429s from shared Vercel IPs) is retried next run instead
 * of publishing a split built on whichever tickers happened to answer.
 * DEX volume includes arbitrage and bot flow; the record says so.
 *
 * Computed by /api/cron/weekend once per week (~30 GeckoTerminal calls),
 * stored at `weekend:sessions:v1`, read by /markets/weekend. No TTL.
 */
import { kvGetProbe, kvSet } from "@/lib/kv";
import { gtJson } from "@/lib/launchpads/gt";
import { BASE_STOCKS } from "@/lib/base-stocks/registry";
import { nyOffsetHours } from "./scorecard";

export const KV_SESSIONS = "weekend:sessions:v1";
export type Session = "open" | "nights" | "weekend";

export interface SessionSplit { open: number; nights: number; weekend: number }
export interface SessionVolume {
  computed_at: string;
  window: { from: string; to: string; weeks: number };
  total_usd: number;
  usd: SessionSplit;
  share: SessionSplit;
  tickers: { ticker: string; total_usd: number; usd: SessionSplit; share: SessionSplit }[];
  left_out: { ticker: string; reason: string }[];
  /** True only when every ticker with a pool was read. */
  complete: boolean;
  source: string;
  caveat: string;
}

export function sessionOf(utcSeconds: number): Session {
  const d = new Date(utcSeconds * 1000);
  const ny = new Date(d.getTime() - nyOffsetHours(d) * 3_600_000); // NY wall clock in UTC fields
  const wd = ny.getUTCDay(); // 0 Sun .. 6 Sat
  const h = ny.getUTCHours() + ny.getUTCMinutes() / 60;
  if ((wd === 5 && h >= 20) || wd === 6 || (wd === 0 && h < 20)) return "weekend";
  if (wd >= 1 && wd <= 5 && h >= 9.5 && h < 16) return "open";
  return "nights";
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const shareOf = (u: SessionSplit): SessionSplit => {
  const t = u.open + u.nights + u.weekend || 1;
  return { open: r1((u.open / t) * 100), nights: r1((u.nights / t) * 100), weekend: r1((u.weekend / t) * 100) };
};

/** Last Monday 00:00 UTC at or before `now`. */
export function lastMonday(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type TickerRead = { usd: SessionSplit } | { none: true };
export const KV_SESSIONS_PROGRESS = "weekend:sessions:progress:v1";
interface Progress { to: string; done: Record<string, TickerRead> }

/** Why the last ticker read failed — surfaced in the cron log, so a failure
 *  can be told apart (429 vs timeout vs empty) instead of guessed at. */
let lastFailure = "";

/**
 * GeckoTerminal GET with a 20 s timeout. `gtJson` (launchpads) aborts at 6 s,
 * which is built for a chat turn; a 1000-candle answer to Vercel's hkg1
 * region took longer and every read came back null (2026-11-11, 0 of 9).
 */
async function gt<T>(path: string): Promise<{ body: T | null }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`https://api.geckoterminal.com/api/v2${path}`, {
        headers: { Accept: "application/json", "User-Agent": "blueagent-weekend/1" },
        signal: AbortSignal.timeout(20_000), cache: "no-store",
      });
      if (r.ok) return { body: (await r.json()) as T };
      lastFailure = `HTTP ${r.status}`;
      if (r.status !== 429) return { body: null };
      await sleep(4000 * (attempt + 1));
    } catch (e) {
      lastFailure = (e as Error).name === "TimeoutError" ? "timeout 20s" : (e as Error).message.slice(0, 60);
    }
  }
  return { body: null };
}
void gtJson;

/** Read one ticker; null = not readable this time (retry on a later run). */
async function readTicker(token: string, fromS: number, toS: number): Promise<TickerRead | null> {
  const pools = await gt<{ data?: { attributes: { address: string; reserve_in_usd: string | null } }[] }>(
    `/networks/base/tokens/${token.toLowerCase()}/pools?page=1`);
  await sleep(2500);
  if (pools.body === null) return null;
  const top = (pools.body.data ?? [])
    .sort((a, b) => Number(b.attributes.reserve_in_usd ?? 0) - Number(a.attributes.reserve_in_usd ?? 0))
    .slice(0, 3);
  if (!top.length) return { none: true };
  const usd: SessionSplit = { open: 0, nights: 0, weekend: 0 };
  for (const p of top) {
    const o = await gt<{ data?: { attributes?: { ohlcv_list?: number[][] } } }>(
      `/networks/base/pools/${p.attributes.address}/ohlcv/hour?aggregate=1&limit=1000&currency=usd`);
    await sleep(2500);
    const rows = o.body?.data?.attributes?.ohlcv_list;
    if (!rows) { lastFailure ||= "no candles in answer"; return null; }
    for (const [ts, , , , , v] of rows) if (ts >= fromS && ts < toS) usd[sessionOf(ts)] += v;
  }
  // A pool with real reserves and zero volume across four weeks is an empty
  // GeckoTerminal answer, not a quiet market (META, 2026-11-11): retry.
  if (usd.open + usd.nights + usd.weekend === 0 && Number(top[0].attributes.reserve_in_usd ?? 0) >= 10_000) return null;
  return { usd };
}

export function assemble(now: Date, from: Date, to: Date, weeks: number, done: Record<string, TickerRead>): SessionVolume {
  const tickers: SessionVolume["tickers"] = [];
  const left_out: SessionVolume["left_out"] = [];
  for (const s of BASE_STOCKS) {
    const r = done[s.ticker];
    if (!r) { left_out.push({ ticker: s.ticker, reason: "not read yet" }); continue; }
    if ("none" in r) { left_out.push({ ticker: s.ticker, reason: "no pool" }); continue; }
    tickers.push({ ticker: s.ticker, total_usd: Math.round(r.usd.open + r.usd.nights + r.usd.weekend), usd: r.usd, share: shareOf(r.usd) });
  }
  const usd = tickers.reduce((a, t) => ({ open: a.open + t.usd.open, nights: a.nights + t.usd.nights, weekend: a.weekend + t.usd.weekend }), { open: 0, nights: 0, weekend: 0 });
  return {
    computed_at: now.toISOString(),
    window: { from: from.toISOString(), to: to.toISOString(), weeks },
    total_usd: Math.round(usd.open + usd.nights + usd.weekend),
    usd, share: shareOf(usd),
    tickers: tickers.sort((a, b) => b.share.open - a.share.open),
    left_out,
    complete: BASE_STOCKS.every((s) => done[s.ticker]),
    source: "GeckoTerminal hourly candles, 3 deepest pools per token, Base 8453; sessions in New York time",
    caveat: "DEX volume includes arbitrage and bot flow.",
  };
}

/**
 * Read tickers until `deadline`, carrying progress across runs in KV so no
 * single invocation has to read all of them (GeckoTerminal 429s from Vercel
 * made one pass hit the 300 s function timeout, 2026-11-11).
 */
export async function computeSessionVolume(now: Date, deadline: number, weeks = 4): Promise<{ result: SessionVolume; read: number }> {
  const to = lastMonday(now);
  const from = new Date(to.getTime() - weeks * 7 * 86_400_000);
  const fromS = from.getTime() / 1000, toS = to.getTime() / 1000;
  const p = await kvGetProbe<Progress>(KV_SESSIONS_PROGRESS);
  const done: Record<string, TickerRead> = p.status === "hit" && p.value.to === to.toISOString() ? { ...p.value.done } : {};
  let read = 0;
  for (const s of BASE_STOCKS) {
    if (done[s.ticker]) continue;
    if (Date.now() > deadline) break;
    const r = await readTicker(s.token, fromS, toS);
    if (r) { done[s.ticker] = r; read++; }
  }
  const progress: Progress = { to: to.toISOString(), done };
  await kvSet(KV_SESSIONS_PROGRESS, progress, 14 * 86_400);
  return { result: assemble(now, from, to, weeks, done), read };
}

export async function readSessionVolume(): Promise<SessionVolume | null> {
  const p = await kvGetProbe<SessionVolume>(KV_SESSIONS);
  // A record from before `complete` existed may be a partial read: not shown.
  return p.status === "hit" && p.value.complete === true ? p.value : null;
}

/** Recompute when the stored window does not end at the latest Monday. */
export async function refreshSessionVolume(now: Date, deadline: number): Promise<string> {
  const cur = await readSessionVolume();
  const want = lastMonday(now).toISOString();
  if (cur && cur.window.to === want) return "sessions: current";
  lastFailure = "";
  const { result, read } = await computeSessionVolume(now, deadline);
  if (!result.complete) {
    const waiting = result.left_out.filter((x) => x.reason === "not read yet").map((x) => x.ticker).join(", ");
    return `sessions: ${read} read this run, waiting on ${waiting}; continues next run${lastFailure ? ` (last failure: ${lastFailure})` : ""}`;
  }
  await kvSet(KV_SESSIONS, result);
  return `sessions: ${result.tickers.length} tickers, $${Math.round(result.total_usd / 1e6)}M, open ${result.share.open}%`;
}
