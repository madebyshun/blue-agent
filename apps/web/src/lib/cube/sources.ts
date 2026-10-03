// Live sources behind the BlueCube feed. Every fetcher fails soft to null / {},
// which `modes.ts` renders as "--" — never as a number.

import { getBaseTvl } from "@/lib/market-data";
import { kvGet } from "@/lib/kv";
import { KV_BASE_ROWS_LATEST, BASE_ROWS_MAX_AGE_MS } from "@/lib/blue-hood/kv-keys";
import { partitionBaseRows } from "@/lib/blue-hood/types";
import type { BaseDeskLatest } from "@/lib/blue-hood/types";
import type { CoinQuote, CubeSources } from "./modes";

const TIMEOUT_MS = 8000;

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export const liveCubeSources: CubeSources = {
  async coins(ids) {
    const d = await getJson<Record<string, { usd?: number; usd_24h_change?: number }>>(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd&include_24hr_change=true`,
    );
    const out: Record<string, CoinQuote> = {};
    for (const id of ids) {
      if (d?.[id]) out[id] = { usd: num(d[id].usd), change24h: num(d[id].usd_24h_change) };
    }
    return out;
  },

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
  async hoodBaseRows() {
    const latest = await kvGet<BaseDeskLatest>(KV_BASE_ROWS_LATEST);
    if (!latest?.rows?.length) return null;
    const ageMs = Date.now() - new Date(latest.started_at).getTime();
    if (!Number.isFinite(ageMs) || ageMs > BASE_ROWS_MAX_AGE_MS) return null;
    return partitionBaseRows(latest.rows).attributed;
  },
};
