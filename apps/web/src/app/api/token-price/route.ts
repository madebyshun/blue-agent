/**
 * /api/token-price — CoinGecko spot-price proxy.
 *
 * Two query modes:
 *   { symbol: "eth" }                              — major symbols by id
 *   { network: "base", address: "0x..." }          — any ERC-20 by contract
 *
 * Backed by CoinGecko's public /simple/price + /simple/token_price endpoints.
 * No auth required for the free tier (~10-30 req/min). Cached 30s.
 *
 * Returns:
 *   {
 *     symbol|address, network?,
 *     usd:    number,
 *     change24h: number | null,   // percent, e.g. -2.5
 *     marketCap?:  number,
 *     volume24h?:  number,
 *     source: "coingecko",
 *     fetchedAt: ISO timestamp,
 *   }
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
// CoinGecko replies < 1s normally; allow a generous margin for cold starts.
export const maxDuration = 15;

const CG = "https://api.coingecko.com/api/v3";

// CoinGecko canonical IDs for common symbols. Anything else → fall back to
// the symbol-search endpoint or 404 if truly unknown.
const COIN_IDS: Record<string, string> = {
  eth:        "ethereum",
  ethereum:   "ethereum",
  btc:        "bitcoin",
  bitcoin:    "bitcoin",
  sol:        "solana",
  solana:     "solana",
  usdc:       "usd-coin",
  usdt:       "tether",
  base:       "ethereum",          // Base uses ETH for gas; ETH price is the right proxy
  arb:        "arbitrum",
  op:         "optimism",
  matic:      "matic-network",
  bnb:        "binancecoin",
  avax:       "avalanche-2",
  link:       "chainlink",
  uni:        "uniswap",
  aero:       "aerodrome-finance",
  cbbtc:      "coinbase-wrapped-btc",
  blue:       "blueagent",         // attempt — gracefully 404 if not listed yet
  blueagent:  "blueagent",
};

// CoinGecko platform slugs for token_price by contract.
const PLATFORM: Record<string, string> = {
  base:     "base",
  ethereum: "ethereum",
  arbitrum: "arbitrum-one",
  optimism: "optimistic-ethereum",
  polygon:  "polygon-pos",
  bsc:      "binance-smart-chain",
};

interface Body {
  symbol?:  string;
  network?: string;
  address?: string;
}

interface CoinGeckoSimplePrice {
  [coinId: string]: {
    usd?:           number;
    usd_24h_change?: number;
    usd_market_cap?: number;
    usd_24h_vol?:    number;
  };
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const symbol  = body.symbol?.toLowerCase().trim();
  const address = body.address?.toLowerCase().trim();
  const network = body.network?.toLowerCase().trim() ?? "base";

  // ── Mode A: by symbol ────────────────────────────────────────────────────
  if (symbol) {
    const coinId = COIN_IDS[symbol] ?? symbol;       // fall through with raw symbol
    const url    = `${CG}/simple/price?ids=${coinId}`
                 + `&vs_currencies=usd`
                 + `&include_24hr_change=true`
                 + `&include_market_cap=true`
                 + `&include_24hr_vol=true`;

    const data = await cgFetch<CoinGeckoSimplePrice>(url);
    if (!data) return NextResponse.json({ error: "CoinGecko unreachable" }, { status: 502 });

    const entry = data[coinId];
    if (!entry?.usd) {
      return NextResponse.json(
        { error: `No price data for "${symbol}". Try a different symbol or pass {network, address}.` },
        { status: 404 },
      );
    }
    return NextResponse.json(
      {
        symbol,
        coinId,
        usd:       entry.usd,
        change24h: entry.usd_24h_change ?? null,
        marketCap: entry.usd_market_cap ?? null,
        volume24h: entry.usd_24h_vol ?? null,
        source:    "coingecko",
        fetchedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } },
    );
  }

  // ── Mode B: by contract on a supported network ──────────────────────────
  if (address) {
    const platform = PLATFORM[network];
    if (!platform) {
      return NextResponse.json(
        { error: `Unsupported network "${network}". Supported: ${Object.keys(PLATFORM).join(", ")}` },
        { status: 400 },
      );
    }
    if (!/^0x[a-f0-9]{40}$/.test(address)) {
      return NextResponse.json({ error: "Invalid contract address" }, { status: 400 });
    }
    const url  = `${CG}/simple/token_price/${platform}?contract_addresses=${address}`
               + `&vs_currencies=usd`
               + `&include_24hr_change=true`
               + `&include_market_cap=true`
               + `&include_24hr_vol=true`;

    const data = await cgFetch<CoinGeckoSimplePrice>(url);
    if (!data) return NextResponse.json({ error: "CoinGecko unreachable" }, { status: 502 });

    const entry = data[address];
    if (!entry?.usd) {
      return NextResponse.json(
        { error: `No CoinGecko listing for ${address} on ${network}. Token may not be indexed yet.` },
        { status: 404 },
      );
    }
    return NextResponse.json(
      {
        network,
        address,
        usd:       entry.usd,
        change24h: entry.usd_24h_change ?? null,
        marketCap: entry.usd_market_cap ?? null,
        volume24h: entry.usd_24h_vol ?? null,
        source:    "coingecko",
        fetchedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } },
    );
  }

  return NextResponse.json(
    { error: "Provide either {symbol} or {network, address}." },
    { status: 400 },
  );
}

async function cgFetch<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json" },
      // CoinGecko caches aggressively itself; 6s is plenty.
      signal: AbortSignal.timeout(6_000),
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}
