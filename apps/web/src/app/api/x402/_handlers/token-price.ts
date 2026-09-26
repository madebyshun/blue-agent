// x402/token-price — live price for any Base token (DexScreener). No LLM.
// Price: $0.01

const DS = "https://api.dexscreener.com/latest/dex";
type Pair = {
  chainId?: string;
  baseToken?: { symbol?: string; name?: string; address?: string };
  quoteToken?: { symbol?: string; address?: string };
  priceUsd?: string;
  priceChange?: { h1?: number; h6?: number; h24?: number };
  volume?: { h24?: number };
  liquidity?: { usd?: number };
  marketCap?: number;
  fdv?: number;
  dexId?: string;
  url?: string;
};

type LookupResult =
  | { pair: Pair }
  | { pair: null; reason: "no_pairs" | "quote_side_only" };

async function lookup(token: string): Promise<LookupResult> {
  const isAddr = /^0x[a-fA-F0-9]{40}$/.test(token);
  const url = isAddr ? `${DS}/tokens/${token}` : `${DS}/search?q=${encodeURIComponent(token)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) return { pair: null, reason: "no_pairs" };
  const d = (await r.json()) as { pairs?: Pair[] };
  const base = (d.pairs ?? [])
    .filter((p) => p.chainId === "base")
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  if (base.length === 0) return { pair: null, reason: "no_pairs" };

  // DexScreener's `priceUsd` ALWAYS prices the pair's BASE token, and
  // /tokens/{address} returns every pair where the address sits on EITHER side.
  // So the deepest pair for an address is frequently one where that address is
  // the QUOTE — and reading baseToken off it reports a DIFFERENT TOKEN'S PRICE
  // under the queried address. This is not a rare edge: it is every stablecoin,
  // i.e. the tokens most often asked about.
  //   MEASURED 2026-09-26: token-price(USDC 0x8335…2913) returned
  //   symbol "AERO", price 0.8964 — a 10% USDC depeg that never happened.
  //   USDC's deepest Base pair is AERO/USDC (liq $39.4M, USDC on the quote
  //   side); its 24 base-side pairs start at USDC/USDbC ($0.9999, liq $144k).
  // Only a pair whose baseToken IS the queried address prices that address, so
  // when we were given an address we match on it rather than trusting depth.
  if (isAddr) {
    const want = token.toLowerCase();
    const onBase = base.find((p) => p.baseToken?.address?.toLowerCase() === want);
    // No base-side pair means this token is only ever quoted against others.
    // Inverting a quote-side price would be derived math on an unvalidated pair,
    // so report insufficient data instead of computing a number we cannot stand behind.
    return onBase ? { pair: onBase } : { pair: null, reason: "quote_side_only" };
  }
  // Ticker path: /search has no address to match on, so depth is the only signal
  // available. The response returns the resolved `address` for the caller to verify —
  // tickers are not unique and impostors copy them exactly.
  return { pair: base[0] };
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { token?: string } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const token = body.token ?? url.searchParams.get("token") ?? url.searchParams.get("address") ?? "";
    if (!token) return Response.json({ error: "Provide token address or ticker" }, { status: 400 });

    const found = await lookup(token);
    const timestamp = new Date().toISOString();
    if (!found.pair) {
      const error =
        found.reason === "quote_side_only"
          ? "This token appears on Base only as the QUOTE side of its pairs, so DexScreener carries no direct USD price for it. Report it as unavailable — do not infer a price by inverting the other side."
          : "No Base DEX pair found (or DexScreener unavailable).";
      return Response.json({ tool: "token-price", token, price_usd: null, error, data_source: "DexScreener", timestamp });
    }
    const p = found.pair;
    return Response.json({
      tool: "token-price",
      symbol: p.baseToken?.symbol ?? null,
      name: p.baseToken?.name ?? null,
      // The address the price actually belongs to. Present so a caller that passed a
      // TICKER can confirm it got the token it meant — tickers are not unique on Base.
      address: p.baseToken?.address ?? null,
      price_usd: p.priceUsd ? parseFloat(p.priceUsd) : null,
      mcap: p.marketCap ?? null,
      fdv: p.fdv ?? null,
      volume_24h: p.volume?.h24 ?? null,
      liquidity_usd: p.liquidity?.usd ?? null,
      change: { h1: p.priceChange?.h1 ?? null, h6: p.priceChange?.h6 ?? null, h24: p.priceChange?.h24 ?? null },
      dex: p.dexId ?? null,
      pair: `${p.baseToken?.symbol ?? ""}/${p.quoteToken?.symbol ?? ""}`,
      url: p.url ?? null,
      data_source: "DexScreener (live)",
      timestamp,
    });
  } catch (e) {
    return Response.json({ error: "token-price failed", message: (e as Error).message }, { status: 500 });
  }
}
