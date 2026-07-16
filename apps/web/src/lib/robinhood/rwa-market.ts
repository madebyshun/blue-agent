// Robinhood Chain RWA market-data helpers (Phase 2 skills).
//
// Wraps GeckoTerminal's RH Chain endpoints with:
//   • timeouts
//   • lightweight in-memory memo (60s) — Vercel serverless is stateless, but
//     within a single warm invocation this collapses N calls to 1 network.
//   • honest null-returns on error (never guess numbers)

const GT = "https://api.geckoterminal.com/api/v2/networks/robinhood";

type Cache<T> = { at: number; data: T };
const MEMO = new Map<string, Cache<unknown>>();
const TTL_MS = 60_000;

async function fetchJson<T>(url: string, timeoutMs = 6000): Promise<T | null> {
  const now = Date.now();
  const cached = MEMO.get(url) as Cache<T> | undefined;
  if (cached && now - cached.at < TTL_MS) return cached.data;
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "application/json;version=20230302" },
    });
    if (!r.ok) return null;
    const d = (await r.json()) as T;
    MEMO.set(url, { at: now, data: d });
    return d;
  } catch {
    return null;
  }
}

// ─── Pool metadata (used by M3 liquidity + M5 arb) ─────────────────────────

export type PoolMeta = {
  address: string;
  name: string;
  dex: string;
  base_token: string;         // lowercased addr, no chain prefix
  quote_token: string;        // lowercased addr, no chain prefix
  price_usd: number;          // ALWAYS for the token we queried
  counterparty_usd: number | null;  // the other side's USD price (used by OHLC inversion)
  token_is_base: boolean;     // true if our token is on the base side of the pool
  reserve_usd: number;
  volume_24h_usd: number | null;
  change_1h: number | null;
  change_24h: number | null;
  fee_bps: number | null;
  url: string;
};

type PoolAttrs = {
  address?: string;
  name?: string;
  base_token_price_usd?: string;
  quote_token_price_usd?: string;
  reserve_in_usd?: string;
  volume_usd?: { h1?: string; h24?: string };
  price_change_percentage?: { h1?: string; h24?: string };
  pool_created_at?: string;
  base_token_address?: string;
  quote_token_address?: string;
  pool_fee_bps?: string | number;
};

type PoolItem = {
  attributes?: PoolAttrs;
  relationships?: {
    dex?: { data?: { id?: string } };
    base_token?: { data?: { id?: string } };
    quote_token?: { data?: { id?: string } };
  };
};

/** Strip GeckoTerminal's "robinhood_" chain prefix from token relationship IDs. */
function stripChainPrefix(id: string | undefined): string {
  if (!id) return "";
  return id.startsWith("robinhood_") ? id.slice("robinhood_".length).toLowerCase() : id.toLowerCase();
}

/**
 * Build a PoolMeta from a GT pool item. If `forToken` is set, the tool selects
 * whichever side (base / quote) matches that token so `price_usd` is the price
 * of *that* token, not the pool's default base. Otherwise defaults to base.
 */
function poolFromItem(p: PoolItem, forToken?: string): PoolMeta | null {
  const attr = p.attributes;
  if (!attr?.address) return null;
  const baseId = stripChainPrefix(p.relationships?.base_token?.data?.id);
  const quoteId = stripChainPrefix(p.relationships?.quote_token?.data?.id);
  const target = forToken?.toLowerCase();
  const isQuoteSide = !!(target && target === quoteId && target !== baseId);
  const tokenIsBase = !isQuoteSide;
  const priceStr = isQuoteSide ? attr.quote_token_price_usd : attr.base_token_price_usd;
  const counterpartyStr = isQuoteSide ? attr.base_token_price_usd : attr.quote_token_price_usd;
  if (!priceStr) return null;
  const price = parseFloat(priceStr);
  if (!Number.isFinite(price) || price <= 0) return null;
  const cp = counterpartyStr ? parseFloat(counterpartyStr) : NaN;
  return {
    address: attr.address.toLowerCase(),
    name: attr.name ?? "",
    dex: p.relationships?.dex?.data?.id ?? "unknown",
    base_token: baseId,
    quote_token: quoteId,
    price_usd: price,
    counterparty_usd: Number.isFinite(cp) && cp > 0 ? cp : null,
    token_is_base: tokenIsBase,
    reserve_usd: parseFloat(attr.reserve_in_usd ?? "0"),
    volume_24h_usd: attr.volume_usd?.h24 ? parseFloat(attr.volume_usd.h24) : null,
    change_1h: attr.price_change_percentage?.h1 ? parseFloat(attr.price_change_percentage.h1) : null,
    change_24h: attr.price_change_percentage?.h24 ? parseFloat(attr.price_change_percentage.h24) : null,
    fee_bps: attr.pool_fee_bps ? Number(attr.pool_fee_bps) : null,
    url: `https://www.geckoterminal.com/robinhood/pools/${attr.address.toLowerCase()}`,
  };
}

/** All pools for a token, sorted by deepest liquidity. Price is always for
 *  the queried token, whether it's the pool's base or quote side. */
export async function poolsForToken(contract: string): Promise<PoolMeta[]> {
  const d = await fetchJson<{ data?: PoolItem[] }>(
    `${GT}/tokens/${contract.toLowerCase()}/pools?page=1`,
  );
  if (!d?.data) return [];
  const pools = d.data
    .map((p) => poolFromItem(p, contract))
    .filter((p): p is PoolMeta => p !== null);
  pools.sort((a, b) => b.reserve_usd - a.reserve_usd);
  return pools;
}

/** Top pools on RH Chain by 24h volume (used by M4 movers). Price is the
 *  pool's own base-side price — caller cross-references our RWA registry
 *  by base_token to filter to RWA-only pools. */
export async function topPools(limit = 50): Promise<PoolMeta[]> {
  const d = await fetchJson<{ data?: PoolItem[] }>(
    `${GT}/pools?page=1&sort=h24_volume_usd_desc`,
  );
  if (!d?.data) return [];
  return d.data
    .map((p) => poolFromItem(p))
    .filter((p): p is PoolMeta => p !== null)
    .slice(0, limit);
}

// ─── OHLC (used by M2) ─────────────────────────────────────────────────────

export type Candle = {
  t: number;    // unix seconds
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;    // volume USD
};

type OhlcvResp = {
  data?: {
    attributes?: {
      ohlcv_list?: [number, number, number, number, number, number][];
    };
  };
};

export type OhlcTimeframe = "minute" | "hour" | "day";

/** GeckoTerminal ohlcv for a pool. Timeframe: minute|hour|day. Max 1000.
 *  Options:
 *   • invert          — flip o/h/l/c to 1/x (used when the caller's token is
 *                       the pool's quote side, so raw candles are for the
 *                       counterparty). After inversion h/l roles swap.
 *   • usd_multiplier  — multiply o/h/l/c by this after (optional) inversion,
 *                       to convert raw ratio → USD when the counterparty is a
 *                       stablecoin ≈ $1 (or a known USD-priced token).      */
export async function poolOhlc(
  pool: string,
  timeframe: OhlcTimeframe = "hour",
  limit = 100,
  options: { invert?: boolean; usd_multiplier?: number } = {},
): Promise<Candle[] | null> {
  const d = await fetchJson<OhlcvResp>(
    `${GT}/pools/${pool.toLowerCase()}/ohlcv/${timeframe}?limit=${limit}`,
    8000,
  );
  const rows = d?.data?.attributes?.ohlcv_list;
  if (!rows?.length) return null;
  // GeckoTerminal returns rows as [timestamp, open, high, low, close, volume]
  // Newest-first — flip to chronological (oldest-first) so charting is trivial.
  const invert = !!options.invert;
  const mul = options.usd_multiplier ?? 1;
  return rows
    .map(([t, o, h, l, c, v]) => {
      if (invert) {
        // 1/x flips high & low: max of 1/l vs 1/h → high
        const io = safeInv(o), ic = safeInv(c);
        const ih = safeInv(l), il = safeInv(h);
        return { t, o: io * mul, h: ih * mul, l: il * mul, c: ic * mul, v };
      }
      return { t, o: o * mul, h: h * mul, l: l * mul, c: c * mul, v };
    })
    .reverse();
}

function safeInv(x: number): number { return x > 0 && Number.isFinite(x) ? 1 / x : 0; }

// ─── OHLC math helpers (used by M2 summary + M5 arb history) ───────────────

export function pctChange(from: number, to: number): number | null {
  if (!Number.isFinite(from) || from === 0) return null;
  return ((to - from) / from) * 100;
}

export function candleSummary(candles: Candle[]): {
  first: Candle | null;
  last: Candle | null;
  high: number | null;
  low: number | null;
  volume_total: number | null;
  change_pct: number | null;
} {
  if (!candles.length) {
    return { first: null, last: null, high: null, low: null, volume_total: null, change_pct: null };
  }
  const first = candles[0], last = candles[candles.length - 1];
  const high = Math.max(...candles.map((c) => c.h));
  const low  = Math.min(...candles.map((c) => c.l));
  const vol  = candles.reduce((s, c) => s + (c.v || 0), 0);
  return { first, last, high, low, volume_total: vol, change_pct: pctChange(first.o, last.c) };
}
