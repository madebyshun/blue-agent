// x402/token-price — live price for any Base token (DexScreener). No LLM.
// Price: $0.01

const DS = "https://api.dexscreener.com/latest/dex";
type Pair = {
  chainId?: string;
  baseToken?: { symbol?: string; name?: string };
  quoteToken?: { symbol?: string };
  priceUsd?: string;
  priceChange?: { h1?: number; h6?: number; h24?: number };
  volume?: { h24?: number };
  liquidity?: { usd?: number };
  marketCap?: number;
  fdv?: number;
  dexId?: string;
  url?: string;
};

async function lookup(token: string): Promise<Pair | null> {
  const isAddr = /^0x[a-fA-F0-9]{40}$/.test(token);
  const url = isAddr ? `${DS}/tokens/${token}` : `${DS}/search?q=${encodeURIComponent(token)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const d = (await r.json()) as { pairs?: Pair[] };
  const base = (d.pairs ?? [])
    .filter((p) => p.chainId === "base")
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  return base[0] ?? null;
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { token?: string } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const token = body.token ?? url.searchParams.get("token") ?? url.searchParams.get("address") ?? "";
    if (!token) return Response.json({ error: "Provide token address or ticker" }, { status: 400 });

    const p = await lookup(token);
    const timestamp = new Date().toISOString();
    if (!p) {
      return Response.json({ tool: "token-price", token, price_usd: null, error: "No Base DEX pair found (or DexScreener unavailable).", data_source: "DexScreener", timestamp });
    }
    return Response.json({
      tool: "token-price",
      symbol: p.baseToken?.symbol ?? null,
      name: p.baseToken?.name ?? null,
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
