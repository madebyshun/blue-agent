/**
 * 24h sparklines for Base stock tokens, kept by Blue (ShunTr 2026-11-19:
 * "phải đợi 1 lúc mới load được").
 *
 * /markets drew each row's sparkline from its own GeckoTerminal OHLCV call.
 * The keyless API allows ~30 calls a minute per IP, so a 25-row page ran out
 * and rows stayed blank or filled in slowly. Instead, a cron samples the price
 * every row already has (readStockMarkets: GeckoTerminal multi-token reads, 30
 * tokens a call, cached 60s) into one hourly point per token, keeps the last
 * 24, and the page asks for a whole page of sparklines in one request.
 * No extra GeckoTerminal calls. A token with fewer than MIN_POINTS hours of
 * history is left out, and the page falls back to its candles.
 */
import { kvGetProbe, kvSet } from "@/lib/kv";
import { readStockMarkets } from "@/lib/markets";

const KEY = "markets:sparks:v1";
export const KEEP = 24;
export const MIN_POINTS = 6;
type Point = [number, number]; // [hour start, unix s; price USD]
type Store = { updatedAt: string; points: Record<string, Point[]> };

/** Pure: put a price into the hour bucket (the last read in an hour wins), keep the newest KEEP. */
export function addPoint(series: Point[] | undefined, at: Date, price: number): Point[] {
  const hour = Math.floor(at.getTime() / 3_600_000) * 3600;
  const kept = (series ?? []).filter((p) => p[0] !== hour);
  return [...kept, [hour, price] as Point].sort((a, b) => a[0] - b[0]).slice(-KEEP);
}

/** Cron: sample every read Base stock row's price into the store. */
export async function recordSparks(now = new Date()): Promise<{ sampled: number; tokens: number }> {
  const [m, cur] = await Promise.all([readStockMarkets(), kvGetProbe<Store>(KEY)]);
  if (cur.status === "error") throw new Error("sparks store unreadable");
  const points = cur.status === "hit" ? { ...cur.value.points } : {};
  let sampled = 0;
  for (const r of m.rows) {
    if (r.chain !== "base" || !r.read || r.priceUsd == null || !(r.priceUsd > 0)) continue;
    const k = r.contract.toLowerCase();
    points[k] = addPoint(points[k], now, r.priceUsd);
    sampled++;
  }
  // Drop tokens not seen for a day, so a delisted token does not linger.
  const floor = Math.floor(now.getTime() / 1000) - 26 * 3600;
  for (const k of Object.keys(points)) if (!points[k].length || points[k][points[k].length - 1][0] < floor) delete points[k];
  await kvSet(KEY, { updatedAt: now.toISOString(), points } satisfies Store);
  return { sampled, tokens: Object.keys(points).length };
}

/** Closes for the asked tokens that have at least MIN_POINTS hours; others are absent. */
export async function readSparks(tokens: string[]): Promise<{ sparks: Record<string, number[]>; updatedAt: string | null }> {
  const p = await kvGetProbe<Store>(KEY);
  if (p.status !== "hit") return { sparks: {}, updatedAt: null };
  const sparks: Record<string, number[]> = {};
  for (const t of tokens) {
    const s = p.value.points[t.toLowerCase()];
    if (s && s.length >= MIN_POINTS) sparks[t.toLowerCase()] = s.map((x) => x[1]);
  }
  return { sparks, updatedAt: p.value.updatedAt };
}
