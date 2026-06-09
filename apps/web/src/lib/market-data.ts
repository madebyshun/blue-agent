// Shared real-data layer for Base market tools.
// Every number returned here comes from a live source — never the LLM.
//   - DexScreener   (api.dexscreener.com)     — token price / volume / liquidity / change
//   - GeckoTerminal (api.geckoterminal.com)   — trending + new pools on Base
//   - DefiLlama     (api.llama.fi / yields)   — chain TVL + real yield pools
// All fetchers fail soft (null / []) so a handler can degrade instead of 500ing.

const T = 8000; // per-request timeout (ms)

function num(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(T) });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

// ─── DexScreener: single token market ────────────────────────────────────────

export type TokenMarket = {
  address: string;
  name: string | null;
  symbol: string | null;
  priceUsd: number | null;
  change: { h1: number | null; h6: number | null; h24: number | null };
  volume24h: number | null;
  liquidityUsd: number | null;
  marketCap: number | null;
  fdv: number | null;
  dex: string | null;
  url: string | null;
  source: "dexscreener";
};

type DsPair = {
  chainId: string;
  dexId?: string;
  url?: string;
  baseToken?: { name?: string; symbol?: string };
  priceUsd?: string;
  priceChange?: { h1?: number; h6?: number; h24?: number };
  volume?: { h24?: number };
  liquidity?: { usd?: number };
  marketCap?: number;
  fdv?: number;
};

// Returns the deepest-liquidity Base pair for a token address.
export async function getTokenMarket(address: string): Promise<TokenMarket | null> {
  const d = await getJson<{ pairs?: DsPair[] }>(
    `https://api.dexscreener.com/latest/dex/tokens/${address}`
  );
  const basePairs = (d?.pairs ?? []).filter((p) => p.chainId === "base");
  if (!basePairs.length) return null;
  basePairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  const p = basePairs[0];
  return {
    address,
    name: p.baseToken?.name ?? null,
    symbol: p.baseToken?.symbol ?? null,
    priceUsd: num(p.priceUsd),
    change: { h1: num(p.priceChange?.h1), h6: num(p.priceChange?.h6), h24: num(p.priceChange?.h24) },
    volume24h: num(p.volume?.h24),
    liquidityUsd: num(p.liquidity?.usd),
    marketCap: num(p.marketCap),
    fdv: num(p.fdv),
    dex: p.dexId ?? null,
    url: p.url ?? null,
    source: "dexscreener",
  };
}

// ─── GeckoTerminal: trending / new pools on Base ─────────────────────────────

export type Pool = {
  name: string;
  baseSymbol: string;
  poolAddress: string;
  priceUsd: number | null;
  change: { h1: number | null; h6: number | null; h24: number | null };
  volume24h: number | null;
  liquidityUsd: number | null;
  marketCap: number | null;
  url: string;
};

type GtPool = {
  attributes?: {
    name?: string;
    address?: string;
    base_token_price_usd?: string;
    price_change_percentage?: Record<string, string>;
    volume_usd?: Record<string, string>;
    reserve_in_usd?: string;
    market_cap_usd?: string;
    fdv_usd?: string;
  };
};

function mapGtPool(p: GtPool): Pool {
  const a = p.attributes ?? {};
  const name = a.name ?? "";
  return {
    name,
    baseSymbol: name.split("/")[0]?.trim() || name,
    poolAddress: a.address ?? "",
    priceUsd: num(a.base_token_price_usd),
    change: {
      h1: num(a.price_change_percentage?.h1),
      h6: num(a.price_change_percentage?.h6),
      h24: num(a.price_change_percentage?.h24),
    },
    volume24h: num(a.volume_usd?.h24),
    liquidityUsd: num(a.reserve_in_usd),
    marketCap: num(a.market_cap_usd) ?? num(a.fdv_usd),
    url: a.address ? `https://www.geckoterminal.com/base/pools/${a.address}` : "",
  };
}

async function gtPools(path: string, limit: number): Promise<Pool[]> {
  const d = await getJson<{ data?: GtPool[] }>(
    `https://api.geckoterminal.com/api/v2/networks/base/${path}?page=1`
  );
  return (d?.data ?? []).slice(0, limit).map(mapGtPool);
}

export const getBaseTrending = (limit = 10) => gtPools("trending_pools", limit);
export const getBaseNewPools = (limit = 10) => gtPools("new_pools", limit);

// ─── DefiLlama: Base chain TVL ───────────────────────────────────────────────

export type BaseTvl = {
  tvlUsd: number | null;
  change1dPct: number | null;
  change7dPct: number | null;
  source: "defillama";
};

export async function getBaseTvl(): Promise<BaseTvl | null> {
  const hist = await getJson<{ date: number; tvl: number }[]>(
    "https://api.llama.fi/v2/historicalChainTvl/Base"
  );
  if (!hist?.length) return null;
  const last = hist[hist.length - 1]?.tvl ?? null;
  const d1 = hist[hist.length - 2]?.tvl ?? null;
  const d7 = hist[hist.length - 8]?.tvl ?? null;
  const pct = (now: number | null, then: number | null) =>
    now != null && then ? +(((now - then) / then) * 100).toFixed(2) : null;
  return { tvlUsd: last, change1dPct: pct(last, d1), change7dPct: pct(last, d7), source: "defillama" };
}

// ─── DefiLlama: real yield pools on Base ─────────────────────────────────────

export type YieldPool = {
  project: string;
  symbol: string;
  tvlUsd: number;
  apy: number | null;
  apyBase: number | null;
  apyReward: number | null;
  ilRisk: string;
  stablecoin: boolean;
  url: string;
};

type LlamaPool = {
  chain?: string;
  project?: string;
  symbol?: string;
  tvlUsd?: number;
  apy?: number | null;
  apyBase?: number | null;
  apyReward?: number | null;
  ilRisk?: string;
  stablecoin?: boolean;
  pool?: string;
};

// Top Base yield pools by TVL. opts.stableOnly / opts.minTvl narrow the set.
export async function getBaseYields(
  limit = 15,
  opts: { stableOnly?: boolean; minTvl?: number } = {}
): Promise<YieldPool[]> {
  const d = await getJson<{ data?: LlamaPool[] }>("https://yields.llama.fi/pools");
  let pools = (d?.data ?? []).filter((p) => p.chain === "Base");
  if (opts.stableOnly) pools = pools.filter((p) => p.stablecoin);
  if (opts.minTvl) pools = pools.filter((p) => (p.tvlUsd ?? 0) >= opts.minTvl!);
  pools.sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0));
  return pools.slice(0, limit).map((p) => ({
    project: p.project ?? "unknown",
    symbol: p.symbol ?? "?",
    tvlUsd: p.tvlUsd ?? 0,
    apy: p.apy ?? null,
    apyBase: p.apyBase ?? null,
    apyReward: p.apyReward ?? null,
    ilRisk: p.ilRisk ?? "unknown",
    stablecoin: !!p.stablecoin,
    url: p.pool ? `https://defillama.com/yields/pool/${p.pool}` : "https://defillama.com/yields?chain=Base",
  }));
}

// ─── Prompt formatters — compact, real-number context for the LLM ────────────

const fmtUsd = (n: number | null) =>
  n == null ? "?" : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(2)}`;
const fmtPct = (n: number | null) => (n == null ? "?" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`);

export function poolsToPrompt(pools: Pool[]): string {
  if (!pools.length) return "(no pool data available)";
  return pools
    .map(
      (p, i) =>
        `${i + 1}. ${p.baseSymbol} — price ${p.priceUsd != null ? "$" + p.priceUsd : "?"}, 24h ${fmtPct(p.change.h24)}, 1h ${fmtPct(p.change.h1)}, vol24h ${fmtUsd(p.volume24h)}, liq ${fmtUsd(p.liquidityUsd)}, mcap ${fmtUsd(p.marketCap)}`
    )
    .join("\n");
}

export function yieldsToPrompt(pools: YieldPool[]): string {
  if (!pools.length) return "(no yield data available)";
  return pools
    .map(
      (p, i) =>
        `${i + 1}. ${p.project} ${p.symbol} — APY ${fmtPct(p.apy)} (base ${fmtPct(p.apyBase)} + reward ${fmtPct(p.apyReward)}), TVL ${fmtUsd(p.tvlUsd)}, IL risk ${p.ilRisk}, ${p.stablecoin ? "stable" : "volatile"}`
    )
    .join("\n");
}

export function tvlToPrompt(t: BaseTvl | null): string {
  if (!t) return "Base TVL: (unavailable)";
  return `Base chain TVL: ${fmtUsd(t.tvlUsd)} (1d ${fmtPct(t.change1dPct)}, 7d ${fmtPct(t.change7dPct)})`;
}
