// Live sources behind the BlueCube feed. Every fetcher fails soft to null / {},
// which `modes.ts` renders as "--" — never as a number.

import { getBaseTvl } from "@/lib/market-data";
import { kvGet } from "@/lib/kv";
import { KV_BASE_ROWS_LATEST, BASE_ROWS_MAX_AGE_MS } from "@/lib/blue-hood/kv-keys";
import { partitionBaseRows } from "@/lib/blue-hood/types";
import type { BaseDeskLatest } from "@/lib/blue-hood/types";
import type { CoinQuote, CubeSources } from "./modes";

const TIMEOUT_MS = 8000;
const TTL_MS = 60_000;

// Picks make every cube's URL different, so the CDN's `s-maxage` no longer
// collapses a fleet into one request per mode. These two layers restore that:
// `next.revalidate` shares upstream JSON across instances via Next's data
// cache, and `memo` keeps a warm instance from re-reading KV for every pick
// combination. Net: ~one CoinGecko call and one KV read per minute, not per cube.
const memoStore = new Map<string, { at: number; v: Promise<unknown> }>();
function memo<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = memoStore.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.v as Promise<T>;
  const v = fn();
  memoStore.set(key, { at: Date.now(), v });
  v.catch(() => memoStore.delete(key));
  return v;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), next: { revalidate: TTL_MS / 1000 } });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export const liveCubeSources: CubeSources = {
  coins: (ids) => memo(`coins:${ids.join(",")}`, async () => {
    const d = await getJson<Record<string, { usd?: number; usd_24h_change?: number }>>(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd&include_24hr_change=true`,
    );
    // Throw rather than return {}: a rejected promise is evicted from `memo`,
    // so one 429 costs this minute's rows, not the next 60s of retries.
    if (!d) throw new Error("coingecko unavailable");
    const out: Record<string, CoinQuote> = {};
    for (const id of ids) {
      if (d[id]) out[id] = { usd: num(d[id].usd), change24h: num(d[id].usd_24h_change) };
    }
    return out;
  }),

  async baseTvl() {
    const t = await getBaseTvl();
    return t ? { tvlUsd: t.tvlUsd, change7dPct: t.change7dPct } : null;
  },

  async baseDexVol() {
    const d = await getJson<{ total24h?: number; change_1d?: number }>(
      "https://api.llama.fi/overview/dexs/base?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true",
    );
    return d ? { total24h: num(d.total24h), change1dPct: num(d.change_1d) } : null;
  },

  // Same freshness + chain-marker rules as /api/hood/snapshot: a stale price
  // that looks live is worse than none, and an unattributed row is dropped.
  // 24h at CoinGecko's 5-minute granularity (~289 points). Only fetched for
  // feeds of ≤ 2 rows, and only for catalog ids, so the fan-out is bounded by
  // the catalog (22), not by how many cubes exist; the 60s memo + data cache
  // collapse repeat requests for the same coin.
  coinHistory: (id) => memo(`hist:${id}`, async () => {
    const d = await getJson<{ prices?: [number, number][] }>(
      `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=1`,
    );
    if (!d?.prices?.length) throw new Error("coingecko history unavailable");
    return d.prices.map((p) => p[1]);
  }),

  hoodBaseRows: () => memo("hood:base-rows", async () => {
    const latest = await kvGet<BaseDeskLatest>(KV_BASE_ROWS_LATEST);
    if (!latest?.rows?.length) return null;
    const ageMs = Date.now() - new Date(latest.started_at).getTime();
    if (!Number.isFinite(ageMs) || ageMs > BASE_ROWS_MAX_AGE_MS) return null;
    return partitionBaseRows(latest.rows).attributed;
  }),
};
