/**
 * Where a watch's numbers come from — fixed at creation (`resolveWatchTarget`),
 * read every tick (`readReadings`). See lib/watches/types.ts for the rules.
 *
 * Identity, never by name: a contract address, a verified stock ticker from
 * the registry of THAT chain, or one of the chain's pinned majors (ETH means
 * WETH's pool). Any other symbol is refused with a request for the address —
 * the same rule as every trade path in chat (#280).
 */
import { getAddress, isAddress, parseAbi, type Address } from "viem";
import { launchClient } from "@/lib/launchpads/resolve";
import { gtJson } from "@/lib/launchpads/gt";
import type { LaunchChain } from "@/lib/launchpads/registry";
import { findByContract as findRhByContract, findByTicker as findRhByTicker } from "@/lib/robinhood/rwa-registry";
import { BASE_STOCKS, findBaseStock } from "@/lib/base-stocks/registry";
import { pinnedTokenFor } from "@/lib/wallet/pinned-symbols";
import { chainlinkLatest, BASE_PRICE_SOURCE, RH_PRICE_SOURCE } from "@/lib/robinhood/rwa-price";
import type { Watch, WatchReading, WatchTarget } from "./types";

type GtPool = { attributes?: Record<string, unknown>; relationships?: Record<string, { data?: { id?: string } }> };
type DsPair = { pairAddress?: string; baseToken?: { address?: string }; quoteToken?: { symbol?: string }; dexId?: string; priceUsd?: string; priceChange?: Record<string, number>; liquidity?: { usd?: number } };

/**
 * DexScreener first, GeckoTerminal second (2026-10-01). Both keyless; the
 * difference is the limit. GeckoTerminal answered 429 to this machine for
 * minutes after a few dozen calls, and a background job on shared serverless
 * IPs cannot live inside ~30/min. DexScreener's token endpoint takes 30
 * addresses per call and returns each token's pairs with their USD price and
 * 1h/24h change. It does NOT list a token still on a launchpad curve (Pons),
 * which is what the GeckoTerminal fallback is for.
 */
async function dsPairs(chain: LaunchChain, tokens: string[]): Promise<DsPair[] | null> {
  try {
    const r = await fetch(`https://api.dexscreener.com/tokens/v1/${chain}/${tokens.join(",")}`, {
      headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6_000), cache: "no-store",
    });
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j) ? (j as DsPair[]) : null;
  } catch { return null; }
}

/** The deepest pair where `token` is the BASE side. */
function bestPair(pairs: DsPair[], token: string): DsPair | undefined {
  return pairs
    .filter((p) => (p.baseToken?.address ?? "").toLowerCase() === token.toLowerCase())
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
}
const num = (v: unknown) => { const n = Number(v); return v != null && v !== "" && Number.isFinite(n) ? n : null; };
const erc20 = parseAbi(["function symbol() view returns (string)"]);

function stockFor(chain: LaunchChain, token: string): { symbol: string; feed?: string; heartbeat?: number } | null {
  if (chain === "robinhood") {
    const r = findRhByContract(token);
    return r && (r.kind === "stock" || r.kind === "etf") ? { symbol: r.ticker, feed: r.chainlinkFeed, heartbeat: r.chainlinkHeartbeat ?? 86400 } : null;
  }
  const s = BASE_STOCKS.find((x) => x.token.toLowerCase() === token.toLowerCase());
  return s ? { symbol: s.ticker, feed: s.chainlinkFeed, heartbeat: s.chainlinkHeartbeat } : null;
}

/** Address, registry ticker on that chain, or pinned major → a contract. */
export function identify(chain: LaunchChain, raw: string): { token: Address } | { error: string } {
  const t = raw.trim().replace(/^\$/, "");
  if (isAddress(t)) return { token: getAddress(t) };
  const up = t.toUpperCase();
  if (up === "ETH") {
    const weth = pinnedTokenFor(chain, "WETH");
    if (weth) return { token: getAddress(weth) };
  }
  const pinned = pinnedTokenFor(chain, t);
  if (pinned) return { token: getAddress(pinned) };
  if (chain === "robinhood") {
    const r = findRhByTicker(t);
    if (r && r.ticker.toUpperCase() === up && (r.kind === "stock" || r.kind === "etf")) return { token: getAddress(r.contract) };
  } else {
    const s = findBaseStock(t) ?? (t.endsWith("c") ? findBaseStock(t.slice(0, -1)) : undefined);
    if (s) return { token: getAddress(s.token) };
  }
  return { error: `"${raw}" does not identify a token on ${chain === "base" ? "Base" : "Robinhood Chain"} — paste its 0x… contract address (only verified stock tickers and the chain's majors resolve by name).` };
}

export async function resolveWatchTarget(chain: LaunchChain, raw: string): Promise<{ target: WatchTarget; priceNow: number | null; priceSource: string | null } | { error: string }> {
  const id = identify(chain, raw);
  if ("error" in id) return id;
  const token = id.token;
  const stock = stockFor(chain, token);

  // The deepest pool where this token is the BASE side: its USD price and its
  // own 1h/24h change are both about THIS token. (A quote-side pool's change
  // figure describes the other token.)
  const ds = await dsPairs(chain, [token]);
  const dsBest = ds ? bestPair(ds, token) : undefined;
  const { body } = dsBest ? { body: null } : await gtJson<{ data?: GtPool[] }>(`/networks/${chain}/tokens/${token}/pools?page=1`);
  const gtPools = (body?.data ?? [])
    .map((p) => ({
      address: String(p.attributes?.address ?? ""),
      name: String(p.attributes?.name ?? ""),
      reserve: num(p.attributes?.reserve_in_usd) ?? 0,
      base: String(p.relationships?.base_token?.data?.id ?? "").toLowerCase().endsWith(token.toLowerCase()),
      price: num(p.attributes?.base_token_price_usd),
    }))
    .filter((p) => p.address && p.base)
    .sort((a, b) => b.reserve - a.reserve);
  const pool = dsBest?.pairAddress
    ? { address: dsBest.pairAddress, name: `${dsBest.dexId ?? "pool"} · vs ${dsBest.quoteToken?.symbol ?? "?"}`, price: num(dsBest.priceUsd) }
    : gtPools[0];

  if (!stock && !pool) {
    return { error: body == null && ds == null
      ? "Could not read this token's pools right now (GeckoTerminal) — try again in a minute."
      : "No pool lists this token as its base on GeckoTerminal yet, so there is no price to watch." };
  }

  let symbol = stock?.symbol ?? null;
  if (!symbol) {
    try { symbol = await launchClient(chain).readContract({ address: token, abi: erc20, functionName: "symbol" }); } catch { symbol = null; }
  }
  // Asked for "ETH": the watch prices WETH's pool, but the user said ETH.
  if (raw.trim().replace(/^\$/, "").toUpperCase() === "ETH") symbol = "ETH";
  const target: WatchTarget = {
    chain, token, symbol: (symbol ?? token.slice(0, 8)).slice(0, 24),
    asset: stock ? "stock" : "crypto",
    ...(stock?.feed ? { feed: stock.feed, heartbeat: stock.heartbeat } : {}),
    ...(pool ? { pool: pool.address, poolName: pool.name, poolBase: true } : {}),
  };
  let priceNow: number | null = pool?.price ?? null;
  let priceSource: string | null = pool?.price != null ? (dsBest ? "DexScreener" : "GeckoTerminal") : null;
  if (stock?.feed) {
    const q = await chainlinkLatest(stock.feed as Address, stock.heartbeat, chain === "base" ? BASE_PRICE_SOURCE : RH_PRICE_SOURCE);
    priceNow = q?.price_usd ?? null;
    priceSource = priceNow != null ? "Chainlink oracle" : null;
  }
  return { target, priceNow, priceSource };
}

/** One reading per watch id. Tokens are batched 30 per call per chain. */
export async function readReadings(watches: Watch[]): Promise<Map<string, WatchReading>> {
  const out = new Map<string, WatchReading>();
  // Keyed by `${chain}:${token}` from DexScreener, by `${chain}:${pool}` from
  // the GeckoTerminal fallback.
  type Pd = { price: number | null; h1: number | null; h24: number | null; src: "dexscreener" | "geckoterminal" };
  const tokenData = new Map<string, Pd>();
  const poolData = new Map<string, Pd>();

  for (const chain of ["base", "robinhood"] as const) {
    const tokens = [...new Set(watches.filter((w) => w.chain === chain).map((w) => w.token.toLowerCase()))];
    for (let i = 0; i < tokens.length; i += 30) {
      const pairs = await dsPairs(chain, tokens.slice(i, i + 30));
      for (const t of tokens.slice(i, i + 30)) {
        const p = pairs ? bestPair(pairs, t) : undefined;
        if (p) tokenData.set(`${chain}:${t}`, { price: num(p.priceUsd), h1: num(p.priceChange?.h1), h24: num(p.priceChange?.h24), src: "dexscreener" });
      }
    }
    // GeckoTerminal only for what DexScreener did not list.
    const pools = [...new Set(watches.filter((w) => w.chain === chain && w.pool && !tokenData.has(`${chain}:${w.token.toLowerCase()}`)).map((w) => w.pool!.toLowerCase()))];
    for (let i = 0; i < pools.length; i += 30) {
      const { body } = await gtJson<{ data?: GtPool[] }>(`/networks/${chain}/pools/multi/${pools.slice(i, i + 30).join(",")}`, 3);
      for (const p of body?.data ?? []) {
        const a = p.attributes ?? {};
        const pc = (a.price_change_percentage ?? {}) as Record<string, unknown>;
        poolData.set(`${chain}:${String(a.address ?? "").toLowerCase()}`, { price: num(a.base_token_price_usd), h1: num(pc.h1), h24: num(pc.h24), src: "geckoterminal" });
      }
    }
  }

  const feeds = new Map<string, { price: number | null; stale: boolean }>();
  for (const w of watches) {
    if (w.asset !== "stock" || !w.feed) continue;
    const k = `${w.chain}:${w.feed.toLowerCase()}`;
    if (feeds.has(k)) continue;
    const q = await chainlinkLatest(w.feed as Address, w.heartbeat ?? 86400, w.chain === "base" ? BASE_PRICE_SOURCE : RH_PRICE_SOURCE);
    feeds.set(k, { price: q?.price_usd ?? null, stale: q?.is_stale ?? true });
  }

  for (const w of watches) {
    const pd = tokenData.get(`${w.chain}:${w.token.toLowerCase()}`) ?? (w.pool ? poolData.get(`${w.chain}:${w.pool.toLowerCase()}`) : undefined);
    const fd = w.feed ? feeds.get(`${w.chain}:${w.feed.toLowerCase()}`) : undefined;
    const stock = w.asset === "stock" && !!fd;
    out.set(w.id, {
      priceUsd: stock ? fd!.price : pd?.price ?? null,
      priceSource: stock ? "chainlink" : pd ? pd.src : null,
      stale: stock ? fd!.stale : false,
      change1h: w.poolBase ? pd?.h1 ?? null : null,
      change24h: w.poolBase ? pd?.h24 ?? null : null,
      changeSource: w.poolBase && pd ? pd.src : null,
    });
  }
  return out;
}
