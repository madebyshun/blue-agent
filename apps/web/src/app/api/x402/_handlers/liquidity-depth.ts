// x402/liquidity-depth — DEX liquidity depth, price impact and exit-risk for a Base token
// Price: $0.15 — PURE MATH, no LLM. Constant-product (x*y=k) approximation.

const DEXSCREENER_URL = "https://api.dexscreener.com/latest/dex";

type DsPair = {
  chainId?: string;
  baseToken?: { symbol?: string; name?: string; address?: string };
  quoteToken?: { symbol?: string; name?: string; address?: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  marketCap?: number;
  priceChange?: { h1?: number; h6?: number; h24?: number };
};

// Which side of the pair is the token the caller asked about?
//
// DexScreener's /tokens/{address} returns pairs where the address is on EITHER
// side, and the deepest one is often the pair where it is the QUOTE — for USDC
// on Base that is AERO/USDC at $39.4M. Reading `baseToken.symbol` off that pair
// labels a USDC answer "AERO" (measured 2026-09-26).
//
// The liquidity figure itself is side-agnostic — `liquidity.usd` is whole-pool
// TVL and the constant-product approximation below works from either side — so
// unlike token-price this does NOT need the pair rejected, only the label fixed.
function sideOf(pair: DsPair, token: string): { symbol: string | null; name: string | null; address: string | null } {
  const want = token.toLowerCase();
  const q = pair.quoteToken;
  if (q?.address?.toLowerCase() === want) {
    return { symbol: q.symbol ?? null, name: q.name ?? null, address: q.address ?? null };
  }
  const b = pair.baseToken;
  return { symbol: b?.symbol ?? null, name: b?.name ?? null, address: b?.address ?? null };
}

async function getDeepestBasePair(token: string): Promise<DsPair | null> {
  const isAddress = /^0x[a-fA-F0-9]{40}$/.test(token);
  const url = isAddress
    ? `${DEXSCREENER_URL}/tokens/${token}`
    : `${DEXSCREENER_URL}/search?q=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { pairs?: DsPair[] };
    const basePairs = (data.pairs ?? []).filter((p) => p.chainId === "base");
    if (!basePairs.length) return null;
    basePairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
    return basePairs[0];
  } catch {
    return null;
  }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { token?: string; trade_size_usd?: number } = {};
    try {
      const text = await req.text();
      if (text?.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}
    const url = new URL(req.url);
    if (!body.token) body.token = url.searchParams.get("token") || url.searchParams.get("address") || undefined;
    if (body.trade_size_usd == null) {
      const t = url.searchParams.get("trade_size_usd");
      if (t != null) body.trade_size_usd = Number(t);
    }

    const { token } = body;
    if (!token) return Response.json({ error: "Provide token address or ticker" }, { status: 400 });

    console.log(`[LiquidityDepth] Analyzing depth for: ${token}`);

    const pair = await getDeepestBasePair(token);

    // Fail soft — no fabricated numbers.
    if (!pair || pair.liquidity?.usd == null) {
      return Response.json({
        tool: "liquidity-depth",
        token,
        symbol: pair ? sideOf(pair, token).symbol : null,
        total_liquidity_usd: null,
        depth: { impact_1pct_usd: null, impact_2pct_usd: null, impact_5pct_usd: null },
        slippage_estimate: { size_1k: null, size_10k: null, size_100k: null },
        exit_risk: null,
        recommended_max_position_usd: null,
        note: pair
          ? "Pair found but no liquidity figure reported by DexScreener."
          : `No Base-chain DEX pair found for "${token}".`,
        dataSource: "DexScreener (live)",
        timestamp: new Date().toISOString(),
      });
    }

    const L = pair.liquidity.usd;

    // Constant-product approximation. impact_Npct_usd ≈ trade size that moves
    // price ~N% ≈ L * N / 100. slippage for size X ≈ (X / L * 100)%.
    const impactUsd = (pct: number) => +(L * (pct / 100)).toFixed(2);
    const slip = (size: number) => ((size / L) * 100).toFixed(2) + "%";

    // exit_risk: <50k HIGH, <250k MEDIUM, else LOW.
    const exit_risk: "LOW" | "MEDIUM" | "HIGH" =
      L < 50_000 ? "HIGH" : L < 250_000 ? "MEDIUM" : "LOW";

    return Response.json({
      tool: "liquidity-depth",
      token,
      symbol: sideOf(pair, token).symbol,
      address: sideOf(pair, token).address,
      total_liquidity_usd: +L.toFixed(2),
      depth: {
        impact_1pct_usd: impactUsd(1),
        impact_2pct_usd: impactUsd(2),
        impact_5pct_usd: impactUsd(5),
      },
      slippage_estimate: {
        size_1k: slip(1_000),
        size_10k: slip(10_000),
        size_100k: slip(100_000),
      },
      exit_risk,
      recommended_max_position_usd: +(L * 0.01).toFixed(2), // ~1% of liquidity
      dataSource: "DexScreener (live)",
      disclaimer: "Constant-product approximation — actual slippage depends on real pool curve. Not financial advice.",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[LiquidityDepth] Error:", error);
    return Response.json({ error: "Liquidity depth analysis failed", message: (error as Error).message }, { status: 500 });
  }
}
