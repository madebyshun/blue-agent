// Live sources behind the BlueCube feed. Every fetcher fails soft to null / {},
// which `modes.ts` renders as "--" — never as a number.
//
// The cube runs on Blue Agent's own tools wherever one covers the data:
// `base-pulse`, `token-price` and `hood-live` are called in-process through
// `callTool` — the same handlers `/api/x402/<id>` sells, the same path the
// Blue Hood poller uses, no HTTP hop and no payment. So the cube shows what
// the agent would answer a paying caller, not a parallel re-implementation
// that can drift from it. The two CoinGecko reads exist only because no tool
// prices non-Base majors or returns a 24h series (spot goes through
// `getCoinGeckoPrices` in lib/market-data; the 24h series is still a direct
// read); each feed names its sources in `via`.
//
// Serving paid tools' output for free here gives nothing away: these exact
// numbers are already public on the cube route, the reads are bounded to ~1
// per minute by `memo`, and none of the three tools calls an LLM.

import { callTool } from "@/lib/blue-hood/tool-caller";
import { getCoinGeckoPrices } from "@/lib/market-data";
import type { BasePulse, CoinQuote, CubeSources, HoodRow } from "./modes";

const TIMEOUT_MS = 8000;
const TTL_MS = 60_000;

// Picks make every cube's URL different, so the CDN's `s-maxage` no longer
// collapses a fleet into one request per mode. These two layers restore that:
// `next.revalidate` shares upstream JSON across instances via Next's data
// cache, and `memo` keeps a warm instance from re-running a tool for every
// pick combination. Net: ~one call per source per minute, not per cube.
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

/** Run a Blue Agent tool; throw on failure so `memo` evicts it instead of caching it. */
async function tool<T>(id: string, body: unknown): Promise<T> {
  const r = await callTool<T>(id, body, { timeoutMs: TIMEOUT_MS });
  if (!r.ok) throw new Error(`${id}: ${r.error}`);
  return r.data;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export const liveCubeSources: CubeSources = {
  coins: (ids) => memo(`coins:${ids.join(",")}`, async () => {
    const d = await getCoinGeckoPrices(ids, {
      include: { change24h: true },
      timeoutMs: TIMEOUT_MS,
      revalidate: TTL_MS / 1000,
    });
    // Throw rather than return {}: a rejected promise is evicted from `memo`,
    // so one 429 costs this minute's rows, not the next 60s of retries.
    if (!d) throw new Error("coingecko unavailable");
    const out: Record<string, CoinQuote> = {};
    for (const id of ids) {
      if (d[id]) out[id] = { usd: d[id].usd, change24h: d[id].change24hPct };
    }
    return out;
  }),

  // 24h at CoinGecko's 5-minute granularity (~289 points). Only fetched for
  // feeds of ≤ 2 rows, and only for catalog ids, so the fan-out is bounded by
  // the catalog (22), not by how many cubes exist.
  coinHistory: (id) => memo(`hist:${id}`, async () => {
    const d = await getJson<{ prices?: [number, number][] }>(
      `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=1`,
    );
    if (!d?.prices?.length) throw new Error("coingecko history unavailable");
    return d.prices.map((p) => p[1]);
  }),

  basePulse: () => memo("tool:base-pulse", async (): Promise<BasePulse> => {
    const d = await tool<Record<string, unknown>>("base-pulse", {});
    return {
      tvlUsd: num(d.tvl_usd),
      tvlChange7dPct: num(d.tvl_change_7d),
      dexVolume24hUsd: num(d.dex_volume_24h),
      dexVolumeChange1dPct: num(d.dex_volume_change_24h),
    };
  }),

  baseTokenPrice: (address) => memo(`tool:token-price:${address.toLowerCase()}`, async (): Promise<CoinQuote> => {
    const d = await tool<{ price_usd?: unknown; address?: unknown; change?: { h24?: unknown } }>("token-price", { token: address });
    // token-price answers with the address its price belongs to; anything else
    // would be another token's price under this one's label.
    if (typeof d.address !== "string" || d.address.toLowerCase() !== address.toLowerCase()) {
      throw new Error(`token-price: answered for ${String(d.address)}, asked ${address}`);
    }
    return { usd: num(d.price_usd), change24h: num(d.change?.h24) };
  }),

  // hood-live applies the same freshness gate + chain-marker check the board
  // does, so a stale or unattributed row never reaches the cube.
  hoodBaseRows: () => memo("tool:hood-live:base", async () => {
    const d = await tool<{ rows?: HoodRow[] }>("hood-live", { chain: "base" });
    return d.rows?.length ? d.rows : null;
  }),
};
