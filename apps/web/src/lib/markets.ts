/**
 * Markets mode (R3, 2026-10-28): stock tokens and crypto tokens on Base 8453 and
 * Robinhood Chain 4663, one list, one token page, one portfolio.
 *
 * Sources, each named where it is shown:
 *   registry   which contracts are stock tokens — the Base B20 allowlist
 *              (lib/base-stocks/registry) and the RH registry
 *              (lib/robinhood/rwa-registry). Matched by CONTRACT, never ticker:
 *              NVDA is two different tokens on the two chains.
 *   market     GeckoTerminal's keyless API: price, 24h volume, liquidity, the
 *              deepest pool, its OHLCV candles and its recent trades. These are
 *              DEX numbers: GeckoTerminal builds them from the pool's own swaps
 *              (Aerodrome / Uniswap on Base, Uniswap v4 on RH); the page names
 *              the pool and the DEX so either can be checked on chain.
 *   on-chain   balances for the portfolio, read from each chain's RPC.
 *
 * Trending crypto is GeckoTerminal's list as-is, marked "unchecked": nothing here
 * tests a tax or a honeypot (that is the paid safe-trending tool). Symbols that
 * imitate majors are dropped from that list, because a "BTC" at $0.03 is an
 * impostor and a list is the wrong place to make the reader find out.
 */
import { unstable_cache } from "next/cache";
import { createPublicClient, formatUnits, getAddress, http, isAddress, type Address } from "viem";
import { BASE_STOCKS } from "@/lib/base-stocks/registry";
import { RWA_TOKENS } from "@/lib/robinhood/rwa-registry";
import { robinhoodMainnet } from "@/lib/robinhood/chains";
import { launchClient } from "@/lib/launchpads/resolve";
import { WALLET_CHAINS } from "@/lib/wallet/chains";
import { gtJson } from "@/lib/launchpads/gt";

export type MarketChain = "base" | "robinhood";
export const MARKET_CHAINS: MarketChain[] = ["base", "robinhood"];
export const CHAIN_NAME: Record<MarketChain, string> = { base: "Base 8453", robinhood: "Robinhood Chain 4663" };

export interface StockRow {
  chain: MarketChain;
  ticker: string;
  name: string;
  contract: Address;
  decimals: number;
  kind: "stock" | "etf";
  priceUsd: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  /** False when GeckoTerminal refused the read: nulls then mean unknown, not "no pool". */
  read: boolean;
}

/** Every stock token we have verified, both chains. Static; prices come after. */
export function stockUniverse(): Omit<StockRow, "priceUsd" | "volume24hUsd" | "liquidityUsd" | "read">[] {
  return [
    ...BASE_STOCKS.map((s) => ({ chain: "base" as const, ticker: s.ticker, name: s.name, contract: getAddress(s.token), decimals: 8, kind: "stock" as const })),
    ...RWA_TOKENS.filter((t) => t.kind === "stock" || t.kind === "etf")
      .map((t) => ({ chain: "robinhood" as const, ticker: t.ticker, name: t.name, contract: getAddress(t.contract), decimals: t.decimals, kind: t.kind as "stock" | "etf" })),
  ];
}

const num = (v: unknown, max = 1e13) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n < max ? n : null; };

type GtToken = { attributes?: { address?: string; price_usd?: string; volume_usd?: { h24?: string }; total_reserve_in_usd?: string } };

/** GeckoTerminal multi-token read, 30 addresses a call, sequential (it 429s on bursts). */
async function gtPrices(chain: MarketChain, addrs: string[]): Promise<{ px: Record<string, { price: number | null; vol: number | null; liq: number | null }>; unread: Set<string> }> {
  const out: Record<string, { price: number | null; vol: number | null; liq: number | null }> = {};
  const unread = new Set<string>();
  for (let i = 0; i < addrs.length; i += 30) {
    const chunk = addrs.slice(i, i + 30);
    const { body } = await gtJson<{ data?: GtToken[] }>(`/networks/${chain}/tokens/multi/${chunk.join(",")}`, 2);
    if (!body) chunk.forEach((x) => unread.add(x));
    for (const t of body?.data ?? []) {
      const a = t.attributes ?? {};
      out[String(a.address ?? "").toLowerCase()] = { price: num(a.price_usd, 1e9), vol: num(a.volume_usd?.h24), liq: num(a.total_reserve_in_usd) };
    }
  }
  return { px: out, unread };
}

/** Thrown out of a cached reader so a PARTIAL read is returned but never cached. */
class Uncached<T> extends Error { constructor(public value: T) { super("uncached"); } }
function cacheWhole<A extends unknown[], T>(fn: (...a: A) => Promise<T>, key: string, revalidate: number): (...a: A) => Promise<T> {
  const cached = unstable_cache(fn, [key], { revalidate });
  return async (...a: A) => {
    try { return await cached(...a); } catch (e) { if (e instanceof Uncached) return e.value as T; throw e; }
  };
}

/** Stock tokens on both chains with GeckoTerminal market data. Cached 5 min when complete. */
export const readStockMarkets = cacheWhole(async (): Promise<{ rows: StockRow[]; readAt: string }> => {
  const uni = stockUniverse();
  const priced: StockRow[] = [];
  let partial = false;
  for (const chain of MARKET_CHAINS) {
    const mine = uni.filter((u) => u.chain === chain);
    const { px, unread } = await gtPrices(chain, mine.map((u) => u.contract.toLowerCase()));
    if (unread.size) partial = true;
    for (const u of mine) {
      const p = px[u.contract.toLowerCase()];
      priced.push({ ...u, priceUsd: p?.price ?? null, volume24hUsd: p?.vol ?? null, liquidityUsd: p?.liq ?? null, read: !unread.has(u.contract.toLowerCase()) });
    }
  }
  const out = { rows: priced, readAt: new Date().toISOString() };
  if (partial) throw new Uncached(out);
  return out;
}, "markets:stocks:v2", 300);

export interface TrendingRow {
  chain: MarketChain;
  token: Address;
  symbol: string;
  pool: string;
  poolName: string;
  dex: string;
  priceUsd: number | null;
  change24hPct: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
}

const MAJORS = new Set(["BTC", "WBTC", "CBBTC", "ETH", "WETH", "USDC", "USDT", "USDG", "DAI", "SOL", "BNB", "XRP", "DOGE", "USDE", "EURC"]);

type GtPool = {
  attributes?: Record<string, unknown> & { address?: string; name?: string };
  relationships?: Record<string, { data?: { id?: string } }>;
};

/** GeckoTerminal trending pools per chain, impostor majors dropped. Cached 5 min. */
export const readTrending = cacheWhole(async (): Promise<{ rows: TrendingRow[]; readAt: string; unread: MarketChain[] }> => {
  const rows: TrendingRow[] = [];
  const unread: MarketChain[] = [];
  for (const chain of MARKET_CHAINS) {
    const { body } = await gtJson<{ data?: GtPool[] }>(`/networks/${chain}/trending_pools?page=1`, 2);
    if (!body) unread.push(chain);
    const seen = new Set<string>();
    for (const p of body?.data ?? []) {
      const a = p.attributes ?? {};
      const baseId = String(p.relationships?.base_token?.data?.id ?? "");
      const token = baseId.split("_").pop() ?? "";
      const name = String(a.name ?? "");
      const symbol = name.split(" / ")[0]?.trim() ?? "?";
      if (!isAddress(token) || seen.has(token.toLowerCase()) || MAJORS.has(symbol.toUpperCase())) continue;
      seen.add(token.toLowerCase());
      rows.push({
        chain, token: getAddress(token), symbol, pool: String(a.address ?? ""), poolName: name,
        dex: String(p.relationships?.dex?.data?.id ?? "?"),
        priceUsd: num(a.base_token_price_usd, 1e9),
        change24hPct: (() => { const n = Number((a.price_change_percentage as Record<string, unknown> | undefined)?.h24); return Number.isFinite(n) ? n : null; })(),
        volume24hUsd: num((a.volume_usd as Record<string, unknown> | undefined)?.h24),
        liquidityUsd: num(a.reserve_in_usd),
      });
    }
  }
  const out = { rows, readAt: new Date().toISOString(), unread };
  if (unread.length) throw new Uncached(out);
  return out;
}, "markets:trending:v2", 300);

// ── Token page ───────────────────────────────────────────────────────────────

/** [unix seconds, open, high, low, close, volume usd] */
export type Candle = [number, number, number, number, number, number];

export const TIMEFRAMES = {
  "15m": { unit: "minute", aggregate: 15, limit: 192 },
  "1h": { unit: "hour", aggregate: 1, limit: 168 },
  "4h": { unit: "hour", aggregate: 4, limit: 180 },
  "1d": { unit: "day", aggregate: 1, limit: 180 },
} as const;
export type Timeframe = keyof typeof TIMEFRAMES;

function parseCandles(list: number[][] | undefined): Candle[] {
  return (list ?? [])
    .map((r) => r.slice(0, 6).map(Number) as Candle)
    .filter((c) => c.length === 6 && c.every(Number.isFinite) && c[2] >= c[3] && c[3] > 0)
    .sort((x, y) => x[0] - y[0]);
}

/** Candles for one pool and timeframe, cached 60s when GT answered. */
export const readCandles = cacheWhole(async (chain: MarketChain, pool: string, side: "base" | "quote", tf: Timeframe): Promise<Candle[] | null> => {
  const t = TIMEFRAMES[tf];
  const r = await gtJson<{ data?: { attributes?: { ohlcv_list?: number[][] } } }>(
    `/networks/${chain}/pools/${pool}/ohlcv/${t.unit}?aggregate=${t.aggregate}&limit=${t.limit}&currency=usd&token=${side}`, 2);
  if (!r.body) throw new Uncached(null);
  return parseCandles(r.body.data?.attributes?.ohlcv_list);
}, "markets:candles:v1", 60);

export interface TokenMarket {
  pool: { address: string; name: string; dex: string; liquidityUsd: number | null; volume24hUsd: number | null; change24hPct: number | null; priceUsd: number | null } | null;
  /** Up to three deepest pools, for the side panel. */
  pools: { name: string; dex: string; liquidityUsd: number | null }[];
  /** 1h OHLCV, oldest first. Empty + candlesRead=false when GT refused. */
  candles: Candle[];
  /** Whether our token is the pool's base token (GeckoTerminal's `token=` side). */
  side: "base" | "quote";
  candlesRead: boolean;
  trades: { at: string; side: "buy" | "sell"; usd: number | null; tx: string; from: string }[];
  tradesRead: boolean;
  status: "ok" | "none_listed" | "unread";
}

/**
 * Deepest pool for a token, its last 7 days of hourly closes and its last trades.
 * Three GeckoTerminal calls, made one after another (the keyless API 429s on
 * bursts). Only a COMPLETE read is cached (2 min); a read GT refused part of is
 * returned uncached so the next view retries instead of serving the gap.
 */
async function fetchTokenMarket(chain: MarketChain, token: string): Promise<TokenMarket> {
  const t = token.toLowerCase();
  const empty = (status: TokenMarket["status"]): TokenMarket => ({ pool: null, pools: [], candles: [], side: "base", candlesRead: status !== "unread", trades: [], tradesRead: status !== "unread", status });
  const pools = await gtJson<{ data?: GtPool[] }>(`/networks/${chain}/tokens/${t}/pools?page=1`, 2);
  if (pools.status === 404) return empty("none_listed");
  if (!pools.body) throw new Uncached(empty("unread"));
  const ranked = (pools.body.data ?? []).map((p) => ({ p, liq: num(p.attributes?.reserve_in_usd) ?? 0 })).sort((a, b) => b.liq - a.liq);
  const best = ranked[0]?.p;
  if (!best) return empty("none_listed");
  const a = best.attributes ?? {};
  const ours = String(best.relationships?.base_token?.data?.id ?? "").toLowerCase().endsWith(t);
  const addr = String(a.address ?? "");
  const pool = {
    address: addr, name: String(a.name ?? "?"), dex: String(best.relationships?.dex?.data?.id ?? "?"),
    liquidityUsd: num(a.reserve_in_usd), volume24hUsd: num((a.volume_usd as Record<string, unknown> | undefined)?.h24),
    change24hPct: ours ? (() => { const n = Number((a.price_change_percentage as Record<string, unknown> | undefined)?.h24); return Number.isFinite(n) ? n : null; })() : null,
    priceUsd: num(ours ? a.base_token_price_usd : a.quote_token_price_usd, 1e9),
  };
  const top = ranked.slice(0, 3).map(({ p, liq }) => ({ name: String(p.attributes?.name ?? "?"), dex: String(p.relationships?.dex?.data?.id ?? "?"), liquidityUsd: liq }));
  const ohlcv = await gtJson<{ data?: { attributes?: { ohlcv_list?: number[][] } } }>(`/networks/${chain}/pools/${addr}/ohlcv/hour?aggregate=1&limit=168&currency=usd&token=${ours ? "base" : "quote"}`, 2);
  const trades = await gtJson<{ data?: { attributes?: Record<string, unknown> }[] }>(`/networks/${chain}/pools/${addr}/trades`, 2);
  const candles = parseCandles(ohlcv.body?.data?.attributes?.ohlcv_list);
  const tr = (trades.body?.data ?? []).slice(0, 25).map((d) => {
    const x = d.attributes ?? {};
    const kind = String(x.kind ?? "");
    // GeckoTerminal's kind is relative to the pool's BASE token.
    const buy = ours ? kind === "buy" : kind === "sell";
    return { at: String(x.block_timestamp ?? ""), side: (buy ? "buy" : "sell") as "buy" | "sell", usd: num(x.volume_in_usd), tx: String(x.tx_hash ?? ""), from: String(x.tx_from_address ?? "") };
  });
  const out: TokenMarket = { pool, pools: top, candles, side: ours ? "base" : "quote", candlesRead: !!ohlcv.body, trades: tr, tradesRead: !!trades.body, status: "ok" };
  if (!ohlcv.body || !trades.body) throw new Uncached(out);
  return out;
}

const cachedTokenMarket = cacheWhole(fetchTokenMarket, "markets:token:v3", 120);

export async function readTokenMarket(chain: MarketChain, token: string): Promise<TokenMarket> {
  return cachedTokenMarket(chain, token).catch(() => ({ pool: null, pools: [], candles: [], side: "base" as const, candlesRead: false, trades: [], tradesRead: false, status: "unread" as const }));
}

// ── Portfolio ────────────────────────────────────────────────────────────────

export interface Holding { chain: MarketChain; symbol: string; name: string; contract: Address | null; amount: number; priceUsd: number | null; valueUsd: number | null; kind: "native" | "stable" | "stock" | "etf" }

// Multicall3 at its canonical address answers on BOTH chains (RH measured
// 2026-10-28 via eth_getCode — task #88's "no Multicall3 on RH" is out of date).
// One eth_call per chunk instead of ~200: RH's RPC 429s per-token reads and
// refuses JSON-RPC batches of 25+.
const MULTICALL3: Address = "0xcA11bde05977b3631167028862bE2a173976CA11";
const rhClient = createPublicClient({ chain: robinhoodMainnet, transport: http(undefined, { timeout: 15_000, retryCount: 2 }) });
const BALANCE_ABI = [
  { type: "function", name: "getEthBalance", stateMutability: "view", inputs: [{ name: "addr", type: "address" }], outputs: [{ name: "balance", type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
] as const;

/** Native, stable and stock-token balances on both chains, valued at market prices. */
export async function readPortfolio(owner: Address): Promise<{ holdings: Holding[]; unread: MarketChain[] }> {
  const uni = stockUniverse();
  // Balances and prices in parallel, prices capped at 8s: a rate-limited price
  // read leaves a holding unpriced ("—"), it never holds up the balances.
  const capped = <T,>(p: Promise<T>, fallback: T) => Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), 8_000))]);
  const [stockPx, ethPx, ...chains] = await Promise.all([
    capped(readStockMarkets().then((m) => new Map(m.rows.map((r) => [`${r.chain}:${r.contract.toLowerCase()}`, r.priceUsd]))), new Map<string, number | null>()),
    capped(gtJson<{ data?: GtToken[] }>(`/networks/base/tokens/multi/0x4200000000000000000000000000000000000006`).then((r) => num(r.body?.data?.[0]?.attributes?.price_usd, 1e7)), null),
    ...MARKET_CHAINS.map(async (chain) => {
      const client = chain === "base" ? launchClient("base") : rhClient;
      const cfg = WALLET_CHAINS[chain];
      const tokens = [
        { symbol: cfg.stableSymbol, name: cfg.stableSymbol, contract: cfg.stable as Address, decimals: cfg.stableDecimals, kind: "stable" as const },
        ...uni.filter((u) => u.chain === chain).map((u) => ({ symbol: u.ticker, name: u.name, contract: u.contract, decimals: u.decimals, kind: u.kind })),
      ];
      try {
        const [eth, res] = await Promise.all([
          client.readContract({ address: MULTICALL3, abi: BALANCE_ABI, functionName: "getEthBalance", args: [owner] }),
          client.multicall({
            multicallAddress: MULTICALL3, allowFailure: true, batchSize: 4_096,
            contracts: tokens.map((t) => ({ address: t.contract, abi: BALANCE_ABI, functionName: "balanceOf" as const, args: [owner] as const })),
          }),
        ]);
        // A failed balanceOf is NOT a zero balance: the whole chain reads as unread.
        if (res.some((r) => r.status !== "success")) throw new Error(`${res.filter((r) => r.status !== "success").length} balance reads failed`);
        return { chain, eth, held: tokens.map((t, i) => ({ t, b: res[i].result as bigint })).filter((x) => x.b > 0n) };
      } catch (e) {
        console.warn(`[markets] portfolio ${chain} unread:`, String((e as Error)?.message ?? e).slice(0, 200));
        return { chain, eth: null, held: null };
      }
    }),
  ]);
  const holdings: Holding[] = [];
  const unread: MarketChain[] = [];
  for (const c of chains) {
    if (c.held === null || c.eth === null) { unread.push(c.chain); continue; }
    if (c.eth > 0n) {
      const amount = Number(formatUnits(c.eth, 18));
      holdings.push({ chain: c.chain, symbol: "ETH", name: "Ether", contract: null, amount, priceUsd: ethPx, valueUsd: ethPx === null ? null : amount * ethPx, kind: "native" });
    }
    for (const { t, b } of c.held) {
      const amount = Number(formatUnits(b, t.decimals));
      const price = t.kind === "stable" ? 1 : stockPx.get(`${c.chain}:${t.contract.toLowerCase()}`) ?? null;
      holdings.push({ chain: c.chain, symbol: t.symbol, name: t.name, contract: t.contract, amount, priceUsd: price, valueUsd: price === null ? null : amount * price, kind: t.kind });
    }
  }
  holdings.sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1));
  return { holdings, unread };
}
