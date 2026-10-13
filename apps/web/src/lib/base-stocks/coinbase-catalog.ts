/**
 * Coinbase's own list of its tokenized stocks on Base 8453 — the issuer's
 * catalog, read from `https://api.coinbase.com/v1/tokenized-stocks` (keyless).
 *
 * MEASURED 2026-10-13: two pages (100 + 35 = 135 tokens), cursor in
 * `next_page_token` → `?page_token=`. Each row: contract_address (0xb200…),
 * symbol ("NVDAc"), name, decimals (8), isin, multiplier, and — on most rows —
 * nav_price + nav_price_updated_at and total_supply. Some rows carry no
 * nav_price (e.g. RKTc); that is "no NAV published", never 0.
 *
 * What this is FOR, and what it is not:
 *   • identity: a Base token is a Coinbase stock token iff its CONTRACT is in
 *     this list. Matching is by address only — never by ticker (#280);
 *   • NAV: the issuer's per-token net asset value, so a DEX price can be read
 *     as a premium or discount to it.
 *   • it is NOT the desk registry (registry.ts). Admitting a ticker to the
 *     Hood desk is gated on its Aerodrome pool and a reviewed checkpoint; this
 *     catalog never adds anything to the desk.
 *
 * Cached 1 h in KV (one key). A failed read is `null` — callers say "NAV not
 * read", they do not price against nothing.
 */
import { kvGet, kvSet } from "@/lib/kv";

const API = "https://api.coinbase.com/v1/tokenized-stocks";
const KEY = "cb:tokenized:v1";
const TTL_S = 3600;
const MAX_PAGES = 5;

export interface CoinbaseStock {
  /** Lowercase contract on Base 8453. */
  contract: string;
  /** Coinbase symbol, e.g. "NVDAc". */
  symbol: string;
  /** Display ticker: the symbol without Coinbase's trailing "c". */
  ticker: string;
  name: string;
  isin: string | null;
  multiplier: number | null;
  /** USD per token, as published by Coinbase. null = not published. */
  nav: number | null;
  navAt: string | null;
  totalSupply: number | null;
}

type Raw = {
  contract_address?: string; symbol?: string; name?: string; isin?: string;
  multiplier?: number; nav_price?: number; nav_price_updated_at?: string; total_supply?: number;
};

const finite = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);

export function parseCatalogRow(r: Raw): CoinbaseStock | null {
  if (!r.contract_address || !/^0x[a-fA-F0-9]{40}$/.test(r.contract_address) || !r.symbol) return null;
  const nav = finite(r.nav_price);
  return {
    contract: r.contract_address.toLowerCase(),
    symbol: r.symbol,
    ticker: r.symbol.replace(/c$/, ""),
    name: r.name ?? r.symbol,
    isin: r.isin ?? null,
    multiplier: finite(r.multiplier),
    nav: nav !== null && nav > 0 ? nav : null,
    navAt: nav !== null && nav > 0 ? r.nav_price_updated_at ?? null : null,
    totalSupply: finite(r.total_supply),
  };
}

let fetchImpl: typeof fetch = (...a) => fetch(...a);
/** Tests inject a stub. */
export function __setCatalogFetch(f: typeof fetch | null) { fetchImpl = f ?? ((...a) => fetch(...a)); }

async function fetchCatalog(): Promise<CoinbaseStock[] | null> {
  const out: CoinbaseStock[] = [];
  let token: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = token ? `${API}?page_token=${encodeURIComponent(token)}` : API;
    let j: { tokens?: Raw[]; next_page_token?: string | null };
    try {
      const r = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
      if (!r.ok) return null;
      j = await r.json();
    } catch { return null; }
    for (const raw of j.tokens ?? []) { const s = parseCatalogRow(raw); if (s) out.push(s); }
    token = j.next_page_token || null;
    if (!token) return out;
  }
  // Still paging at the cap: an incomplete catalog would miss tokens, and a
  // miss reads as "not a Coinbase stock". Refuse it rather than serve it.
  return null;
}

/** The catalog, cached 1 h. null ⟹ unread. */
export async function coinbaseCatalog(opts: { fresh?: boolean } = {}): Promise<CoinbaseStock[] | null> {
  if (!opts.fresh) {
    const hit = await kvGet<CoinbaseStock[]>(KEY).catch(() => null);
    if (Array.isArray(hit) && hit.length) return hit;
  }
  const rows = await fetchCatalog();
  if (rows?.length) await kvSet(KEY, rows, TTL_S).catch(() => {});
  return rows?.length ? rows : null;
}

/** Premium of a DEX price over NAV, in percent. null when either is missing. */
export function navPremiumPct(dex: number | null, nav: number | null): number | null {
  if (dex == null || nav == null || !(nav > 0) || !Number.isFinite(dex)) return null;
  return (dex / nav - 1) * 100;
}
