// Live sources behind the BlueCube feed. Every fetcher fails soft to null / {},
// which `modes.ts` renders as "--" — never as a number.
//
// The cube runs on Blue Agent's own tools wherever one covers the data:
// `hood-live`, `safe-trending` and `blue-doctor` are called in-process through
// `callTool` — the same handlers `/api/x402/<id>` sells, the same path the
// Blue Hood poller uses, no HTTP hop and no payment. So the cube shows what
// the agent would answer a paying caller, not a parallel re-implementation
// that can drift from it. The two CoinGecko reads exist only because no tool
// prices non-Base majors or returns a 24h series (spot goes through
// `getCoinGeckoPrices` in lib/market-data; the 24h series is still a direct
// read); each feed names its sources in `via`.
//
// Serving paid tools' output for free here gives nothing away: these exact
// numbers are already public on the cube route, the reads are bounded by
// `memo` (60s; 5 min for safe-trending), and none of the three calls an LLM.

import { callTool } from "@/lib/blue-hood/tool-caller";
import { getCoinGeckoPrices } from "@/lib/market-data";
import type { CoinQuote, CubeSources, DoctorProbe, HoodRow, TrendingRow } from "./modes";

const TIMEOUT_MS = 8000;
const TTL_MS = 60_000;

// Picks make every cube's URL different, so the CDN's `s-maxage` no longer
// collapses a fleet into one request per mode. These two layers restore that:
// `next.revalidate` shares upstream JSON across instances via Next's data
// cache, and `memo` keeps a warm instance from re-running a tool for every
// pick combination. Net: ~one call per source per minute, not per cube.
const memoStore = new Map<string, { at: number; v: Promise<unknown> }>();
function memo<T>(key: string, fn: () => Promise<T>, ttlMs = TTL_MS): Promise<T> {
  const hit = memoStore.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.v as Promise<T>;
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

  // safe-trending does three eth_calls per token, so it runs on a 5-minute
  // memo rather than 60s, and asks for 5 tokens — what the screen shows —
  // instead of the tool's default 10.
  trending: () => memo("tool:safe-trending", async () => {
    const d = await tool<{ tokens?: TrendingRow[] }>("safe-trending", { limit: 5 });
    return d.tokens?.length ? d.tokens : null;
  }, 5 * 60_000),

  doctor: () => memo("tool:blue-doctor", async () => {
    const d = await tool<{ upstreams?: DoctorProbe[] }>("blue-doctor", {});
    return d.upstreams?.length ? d.upstreams : null;
  }),

  // hood-live applies the same freshness gate + chain-marker check the board
  // does, so a stale or unattributed row never reaches the cube.
  hoodBaseRows: () => memo("tool:hood-live:base", async () => {
    const d = await tool<{ rows?: HoodRow[] }>("hood-live", { chain: "base" });
    return d.rows?.length ? d.rows : null;
  }),
};
