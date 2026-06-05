// x402/dex-flow — DEX volume, buy/sell pressure and liquidity flow for any Base token
// Price: $0.15 — Fully self-contained, no external workspace imports

type BankrMessage = { role: string; content: string };

async function callBankrLLM(opts: {
  model?: string; system: string; messages: BankrMessage[];
  temperature?: number; maxTokens?: number;
}): Promise<string> {
  const res = await fetch("https://llm.bankr.bot/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.LLM_API_KEY ?? process.env.BANKR_API_KEY ?? "",
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model ?? "claude-haiku-4-5",
      system: opts.system,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.5,
      max_tokens: opts.maxTokens ?? 1000,
    }),
  });
  if (!res.ok) throw new Error(`Bankr LLM ${res.status}: ${await res.text()}`);
  const d = await res.json() as { content?: { text: string }[]; text?: string };
  if (d.content?.length) return d.content[0].text;
  if (d.text) return d.text;
  throw new Error("Invalid Bankr LLM response");
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  let raw = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s >= 0 && e > s) raw = raw.slice(s, e + 1);
  try { return JSON.parse(raw); } catch {}
  try { return JSON.parse(raw.replace(/[\x00-\x1F\x7F]/g, " ")); } catch {}
  return null;
}

const DEXSCREENER_URL = "https://api.dexscreener.com/latest/dex";

async function getDexData(token: string): Promise<unknown[]> {
  const isAddress = /^0x[a-fA-F0-9]{40}$/.test(token);
  const url = isAddress
    ? `${DEXSCREENER_URL}/tokens/${token}`
    : `${DEXSCREENER_URL}/search?q=${encodeURIComponent(token)}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`DexScreener error: ${res.status}`);
  const data = await res.json() as { pairs?: unknown[] };

  type Pair = { chainId?: string; volume?: { h24?: number }; dexId?: string; baseToken?: { symbol?: string }; quoteToken?: { symbol?: string }; priceUsd?: string; priceChange?: { h1?: number; h24?: number }; liquidity?: { usd?: number }; txns?: { h24?: { buys?: number; sells?: number } } };

  return ((data.pairs ?? []) as Pair[])
    .filter(p => p.chainId === "base")
    .sort((a, b) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0))
    .slice(0, 5)
    .map(p => ({
      dex: p.dexId,
      pair: (p.baseToken?.symbol ?? "") + "/" + (p.quoteToken?.symbol ?? ""),
      price: p.priceUsd,
      priceChange1h: p.priceChange?.h1,
      priceChange24h: p.priceChange?.h24,
      volume24h: p.volume?.h24,
      liquidity: p.liquidity?.usd,
      txns24h: (p.txns?.h24?.buys ?? 0) + (p.txns?.h24?.sells ?? 0),
      buys24h: p.txns?.h24?.buys,
      sells24h: p.txns?.h24?.sells,
    }));
}

const SYSTEM = `You are a DEX flow analyst interpreting on-chain trading data for Base chain tokens.

Analyze volume, buy/sell pressure, liquidity, and price action to assess market sentiment and flow direction.

Return ONLY valid JSON:

{
  "token": "string",
  "chain": "base",
  "pressure": "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL",
  "pressureScore": number (0-100, 50=neutral, 100=max buy pressure),
  "volume24h": "string",
  "buySellRatio": "string (e.g. '65% buys / 35% sells')",
  "liquidityHealth": "DEEP" | "MODERATE" | "THIN" | "CRITICAL",
  "priceAction": "string (brief summary of recent price movement)",
  "topPairs": [
    {
      "dex": "string",
      "pair": "string",
      "volume24h": "string",
      "buySellRatio": "string"
    }
  ],
  "signals": ["signal1", "signal2"],
  "recommendation": "string (what does this flow data suggest?)"
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

    console.log(`[DexFlow] Analyzing flow for: ${token}`);

    let dexData: unknown[] = [];
    try {
      dexData = await getDexData(token);
    } catch (e) {
      console.warn("[DexFlow] DexScreener fetch failed, using LLM only");
    }

    const context = dexData.length > 0
      ? `Live DexScreener data (Base chain):\n${JSON.stringify(dexData, null, 2)}`
      : `No live data available — provide general DEX flow analysis for ${token} on Base.`;

    const llmResponse = await callBankrLLM({
      system: SYSTEM,
      messages: [{ role: "user", content: `Analyze DEX flow for ${token} on Base chain.\n\n${context}\n\nAssess buy/sell pressure, volume trends, and liquidity health.` }],
      temperature: 0.3,
      maxTokens: 800,
    });
    const result = extractJsonObject(llmResponse);
    if (!result) throw new Error("Failed to parse DEX flow");
    return Response.json(result);
  } catch (error) {
    console.error("[DexFlow] Error:", error);
    return Response.json({ error: "DEX flow analysis failed", message: (error as Error).message }, { status: 500 });
  }
}
