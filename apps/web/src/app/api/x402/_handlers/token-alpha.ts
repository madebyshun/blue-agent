// x402/token-alpha — single-token trade signal with whale confirmation for Base
// Price: $0.25 — Real price/liquidity (DexScreener) + whale flow (Moralis); LLM synthesis.

import { callVeniceLLM } from "@/app/api/_lib/llm";
import { getTokenMarket } from "@/lib/market-data";
import { getMoralisERC20Transfers } from "@/lib/moralis";

function extractJsonObject(text: string): Record<string, unknown> | null {
  let raw = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s >= 0 && e > s) raw = raw.slice(s, e + 1);
  try { return JSON.parse(raw); } catch {}
  try { return JSON.parse(raw.replace(/[\x00-\x1F\x7F]/g, " ")); } catch {}
  return null;
}

const DEXSCREENER_URL = "https://api.dexscreener.com/latest/dex";

type DsPair = {
  chainId?: string;
  dexId?: string;
  baseToken?: { symbol?: string; name?: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  marketCap?: number;
  priceChange?: { h1?: number; h6?: number; h24?: number };
};

async function getBasePairs(token: string): Promise<DsPair[]> {
  const isAddress = /^0x[a-fA-F0-9]{40}$/.test(token);
  const url = isAddress
    ? `${DEXSCREENER_URL}/tokens/${token}`
    : `${DEXSCREENER_URL}/search?q=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { pairs?: DsPair[] };
    return (data.pairs ?? [])
      .filter((p) => p.chainId === "base")
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))
      .slice(0, 3);
  } catch {
    return [];
  }
}

const SYSTEM = `You are a Base chain analyst. Use ONLY the data provided. NEVER invent numbers, addresses, or token names not in the data. Return ONLY raw JSON starting with {. No markdown. If data unavailable, return field as null — never estimate.

Produce a trade signal from the live price, liquidity, momentum and whale-flow data provided. Anchor entry_price to the real current price given. Derive stop_loss / target as plausible levels relative to that real price.

Return JSON with this exact shape:
{
  "signal": "STRONG_BUY|BUY|WATCH|SKIP|NO_SIGNAL",
  "confidence": number,
  "entry_price": number | null,
  "stop_loss": number | null,
  "target": number | null,
  "whale_confirmation": boolean,
  "narrative_fit": "string",
  "momentum_score": number,
  "risk_flags": ["string"],
  "thesis": "string"
}`;

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { token?: string } = {};
    try {
      const text = await req.text();
      if (text?.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}
    const url = new URL(req.url);
    if (!body.token) body.token = url.searchParams.get("token") || url.searchParams.get("address") || undefined;

    const { token } = body;
    if (!token) return Response.json({ error: "Provide token address or ticker" }, { status: 400 });

    console.log(`[TokenAlpha] Building signal for: ${token}`);

    const isAddress = /^0x[a-fA-F0-9]{40}$/.test(token);
    const [market, pairs, transfers] = await Promise.all([
      getTokenMarket(token).catch(() => null),
      getBasePairs(token),
      isAddress ? getMoralisERC20Transfers(token, 50).catch(() => []) : Promise.resolve([]),
    ]);

    const price = market?.priceUsd ?? (pairs[0]?.priceUsd != null ? Number(pairs[0].priceUsd) : null);
    const symbol = market?.symbol ?? pairs[0]?.baseToken?.symbol ?? null;

    // Token not found anywhere → no signal, no fabrication.
    if (!market && pairs.length === 0) {
      return Response.json({
        tool: "token-alpha",
        token,
        symbol,
        signal: "NO_SIGNAL",
        confidence: 0,
        entry_price: null,
        stop_loss: null,
        target: null,
        whale_confirmation: false,
        narrative_fit: null,
        momentum_score: null,
        risk_flags: ["No Base-chain DEX listing found for this token"],
        thesis: `No live Base market data found for "${token}".`,
        dataSource: "DexScreener + Moralis (no match)",
        timestamp: new Date().toISOString(),
      });
    }

    const whaleCount = Array.isArray(transfers) ? transfers.length : 0;
    const dataLines = [
      `Token: ${symbol ?? token}`,
      `Current price (USD): ${price ?? "unknown"}`,
      `Market cap (USD): ${market?.marketCap ?? "unknown"}`,
      `24h volume (USD): ${market?.volume24h ?? "unknown"}`,
      `Liquidity (USD): ${market?.liquidityUsd ?? "unknown"}`,
      `Price change — 1h: ${market?.change.h1 ?? "?"}%, 6h: ${market?.change.h6 ?? "?"}%, 24h: ${market?.change.h24 ?? "?"}%`,
      `Recent on-chain transfers observed (last 50): ${whaleCount}`,
    ].join("\n");

    const content = `Live data for ${symbol ?? token} on Base — use ONLY these numbers. Anchor entry_price to the current price above.\n\n${dataLines}`;

    const llmResponse = await callVeniceLLM({
      system: SYSTEM,
      messages: [{ role: "user", content }],
      temperature: 0.3,
      maxTokens: 800,
    });

    const result = extractJsonObject(llmResponse) ?? { degraded: true, note: "Synthesis briefly unavailable - please retry." };

    return Response.json({
      tool: "token-alpha",
      token,
      symbol,
      // Ground entry_price to the real current price regardless of LLM output.
      entry_price: price,
      ...result,
      dataSource: "DexScreener (price/liquidity) + Moralis (transfers)",
      disclaimer: "Model-generated signal grounded in live data — not financial advice.",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[TokenAlpha] Error:", error);
    return Response.json({ error: "Token alpha signal failed", message: (error as Error).message }, { status: 500 });
  }
}
