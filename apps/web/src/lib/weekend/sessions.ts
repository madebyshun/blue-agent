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

export async function computeSessionVolume(now: Date, weeks = 4): Promise<SessionVolume> {
  const to = lastMonday(now);
  const from = new Date(to.getTime() - weeks * 7 * 86_400_000);
  const fromS = from.getTime() / 1000, toS = to.getTime() / 1000;
  const tickers: SessionVolume["tickers"] = [];
  const left_out: SessionVolume["left_out"] = [];
  let unread = false;
  for (const s of BASE_STOCKS) {
    const pools = await gtJson<{ data?: { attributes: { address: string; reserve_in_usd: string | null } }[] }>(
      `/networks/base/tokens/${s.token.toLowerCase()}/pools?page=1`, 5);
    await sleep(3000);
    const top = (pools.body?.data ?? [])
      .sort((a, b) => Number(b.attributes.reserve_in_usd ?? 0) - Number(a.attributes.reserve_in_usd ?? 0))
      .slice(0, 3);
    if (pools.body === null) { left_out.push({ ticker: s.ticker, reason: "pools not readable" }); unread = true; continue; }
    if (!top.length) { left_out.push({ ticker: s.ticker, reason: "no pool" }); continue; }
    const usd: SessionSplit = { open: 0, nights: 0, weekend: 0 };
    let failed = false;
    for (const p of top) {
      const o = await gtJson<{ data?: { attributes?: { ohlcv_list?: number[][] } } }>(
        `/networks/base/pools/${p.attributes.address}/ohlcv/hour?aggregate=1&limit=1000&currency=usd`, 5);
      await sleep(3000);
      const rows = o.body?.data?.attributes?.ohlcv_list;
      if (!rows) { failed = true; break; }
      for (const [ts, , , , , v] of rows) if (ts >= fromS && ts < toS) usd[sessionOf(ts)] += v;
    }
    if (failed) { left_out.push({ ticker: s.ticker, reason: "candles not readable" }); unread = true; continue; }
    // A pool with real reserves and zero volume across four weeks is an empty
    // GeckoTerminal answer, not a quiet market (META, 2026-11-11): retry.
    if (usd.open + usd.nights + usd.weekend === 0 && Number(top[0].attributes.reserve_in_usd ?? 0) >= 10_000) {
      left_out.push({ ticker: s.ticker, reason: "empty candles for a funded pool" }); unread = true; continue;
    }
    tickers.push({ ticker: s.ticker, total_usd: Math.round(usd.open + usd.nights + usd.weekend), usd, share: shareOf(usd) });
  }
  const usd = tickers.reduce((a, t) => ({ open: a.open + t.usd.open, nights: a.nights + t.usd.nights, weekend: a.weekend + t.usd.weekend }), { open: 0, nights: 0, weekend: 0 });
  return {
    computed_at: now.toISOString(),
    window: { from: from.toISOString(), to: to.toISOString(), weeks },
    total_usd: Math.round(usd.open + usd.nights + usd.weekend),
    usd, share: shareOf(usd),
    tickers: tickers.sort((a, b) => b.share.open - a.share.open),
    left_out,
    complete: !unread,
    source: "GeckoTerminal hourly candles, 3 deepest pools per token, Base 8453; sessions in New York time",
    caveat: "DEX volume includes arbitrage and bot flow.",
  };
}

export async function readSessionVolume(): Promise<SessionVolume | null> {
  const p = await kvGetProbe<SessionVolume>(KV_SESSIONS);
  // A record from before `complete` existed may be a partial read: not shown.
  return p.status === "hit" && p.value.complete === true ? p.value : null;
}

/** Recompute when the stored window does not end at the latest Monday. */
export async function refreshSessionVolume(now: Date): Promise<string> {
  const cur = await readSessionVolume();
  const want = lastMonday(now).toISOString();
  if (cur && cur.window.to === want && cur.complete === true) return "sessions: current";
  const next = await computeSessionVolume(now);
  if (!next.complete) return `sessions: partial read (${next.left_out.map((x) => x.ticker).join(", ")}), not stored; retrying next run`;
  await kvSet(KV_SESSIONS, next);
  return `sessions: ${next.tickers.length} tickers, $${Math.round(next.total_usd / 1e6)}M, open ${next.share.open}%`;
}
