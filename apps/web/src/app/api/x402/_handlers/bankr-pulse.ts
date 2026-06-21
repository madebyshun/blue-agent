// x402/bankr-pulse — Bankr ecosystem pulse (trending agent launches + $BNKR price)
// Price: $0.05 — real data from Bankr API + DexScreener; LLM only synthesizes narrative

import { callVeniceLLM, extractJsonObject } from "@/app/api/_lib/llm";

const BNKR_ADDRESS = "0x05fa92bc81ae6c6d7e65b636a72398f6d0b15c85";
const BANKR_LAUNCHES_URL = "https://api.bankr.bot/token-launches?limit=20";
const DEXSCREENER_URL = `https://api.dexscreener.com/latest/dex/tokens/${BNKR_ADDRESS}`;

const SYSTEM = `Respond with ONLY a raw JSON object. Start immediately with { and end with }. No markdown, no explanation, no text before or after.

You are a Bankr ecosystem analyst on Base. Use ONLY the data provided in the user message.
NEVER invent token names, prices, addresses, or metrics not present in the input data.
If a field is missing, return null — never estimate or fabricate.

Return ONLY raw JSON:
{
  "title": "string (headline for this Bankr pulse, ≤12 words)",
  "summary": "string (2-3 sentences: ecosystem mood, notable launches, $BNKR action)",
  "trending": [
    { "name": "string", "symbol": "string", "change24h": number|null, "volume24h": number|null, "sentiment": "hot" | "rising" | "neutral" | "cooling" }
  ],
  "bnkr_price": number|null,
  "bnkr_change": number|null,
  "sentiment": "bullish" | "neutral" | "bearish",
  "metrics": { "total_launches": number|null, "avg_change24h": number|null }
}`;

export default async function handler(_req: Request): Promise<Response> {
  const sig = new AbortController();
  const timer = setTimeout(() => sig.abort(), 8000);

  let launches: { name?: string; symbol?: string; priceChange24h?: number; volume24h?: number }[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let bnkrPair: any = null;
  let launchesOk = true;
  let bnkrOk = true;

  try {
    const [launchRes, dexRes] = await Promise.allSettled([
      fetch(BANKR_LAUNCHES_URL, { signal: sig.signal }),
      fetch(DEXSCREENER_URL,    { signal: sig.signal }),
    ]);

    if (launchRes.status === "fulfilled" && launchRes.value.ok) {
      try {
        const raw = await launchRes.value.json();
        launches = Array.isArray(raw) ? raw : (raw?.data ?? raw?.launches ?? []);
      } catch { launchesOk = false; }
    } else { launchesOk = false; }

    if (dexRes.status === "fulfilled" && dexRes.value.ok) {
      try {
        const raw = await dexRes.value.json();
        const pairs: typeof bnkrPair[] = raw?.pairs ?? [];
        bnkrPair = pairs.sort((a: any, b: any) => (b?.volume?.h24 ?? 0) - (a?.volume?.h24 ?? 0))[0] ?? null;
      } catch { bnkrOk = false; }
    } else { bnkrOk = false; }
  } finally {
    clearTimeout(timer);
  }

  console.log(`[BankrPulse] launches=${launchesOk ? launches.length : "err"}, bnkr=${bnkrOk ? "ok" : "err"}`);

  if (!launchesOk && !bnkrOk) {
    return Response.json({
      tool: "bankr-pulse",
      timestamp: new Date().toISOString(),
      title: "Bankr data temporarily unavailable",
      summary: "Live Bankr and DexScreener data could not be fetched. Please retry.",
      trending: [],
      bnkr_price: null,
      bnkr_change: null,
      sentiment: "neutral",
      metrics: { total_launches: null, avg_change24h: null },
      note: "Both data sources unavailable — no fabricated data shown.",
    });
  }

  const bnkrPrice  = bnkrPair?.priceUsd != null ? parseFloat(bnkrPair.priceUsd) : null;
  const bnkrChange = bnkrPair?.priceChange?.h24 ?? null;

  const launchSample = launches.slice(0, 15).map(l => ({
    name:      l.name     ?? "Unknown",
    symbol:    l.symbol   ?? "—",
    change24h: l.priceChange24h ?? null,
    volume24h: l.volume24h      ?? null,
  }));

  const userContent = [
    "Summarize the current Bankr ecosystem pulse using this live data.\n",
    launchesOk && launchSample.length > 0
      ? `Recent Bankr token launches (${launchSample.length} of ${launches.length} total):\n${JSON.stringify(launchSample, null, 2)}`
      : "Bankr launch data: unavailable",
    "\n",
    bnkrOk && bnkrPrice != null
      ? `$BNKR price: $${bnkrPrice.toFixed(6)} | 24h change: ${bnkrChange != null ? bnkrChange.toFixed(2) + "%" : "n/a"} | 24h volume: $${(bnkrPair?.volume?.h24 ?? 0).toLocaleString()}`
      : "$BNKR price data: unavailable",
  ].join("\n");

  const ask = () => callVeniceLLM({ system: SYSTEM, messages: [{ role: "user", content: userContent }], temperature: 0.2, maxTokens: 900 });

  let result = extractJsonObject(await ask());
  if (!result) result = extractJsonObject(await ask());
  if (!result) {
    result = {
      title: "Bankr Pulse",
      summary: "Live data fetched but synthesis is briefly unavailable. Please retry.",
      trending: [],
      sentiment: "neutral",
      metrics: { total_launches: launches.length, avg_change24h: null },
      degraded: true,
    };
  }

  return Response.json({
    tool: "bankr-pulse",
    timestamp: new Date().toISOString(),
    ...result,
    bnkr_price:  result.bnkr_price  ?? bnkrPrice,
    bnkr_change: result.bnkr_change ?? bnkrChange,
    data_source: "Bankr API + DexScreener (live)",
    disclaimer: "Snapshot only — not financial advice.",
  });
}
