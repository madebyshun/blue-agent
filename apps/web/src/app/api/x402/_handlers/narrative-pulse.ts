// x402/narrative-pulse — live Base/CT narrative tracker (trending pools + Venice web search)
// Price: $0.20 — Tokens grounded in the real GeckoTerminal trending list; LLM only synthesizes

import { callVeniceLLM } from "@/app/api/_lib/llm";
import { getBaseTrending, type Pool } from "@/lib/market-data";

function extractJsonObject(text: string): Record<string, unknown> | null {
  let raw = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s >= 0 && e > s) raw = raw.slice(s, e + 1);
  try { return JSON.parse(raw); } catch {}
  try { return JSON.parse(raw.replace(/[\x00-\x1F\x7F]/g, " ")); } catch {}
  return null;
}

const SYSTEM = `You are a Base chain analyst. Use ONLY the data provided. NEVER invent numbers, addresses, or token names not in the data. Return ONLY raw JSON starting with {. No markdown. If data unavailable, return field as null — never estimate.

You track crypto-Twitter (CT) and Base ecosystem narratives. You also have live web search — use it to identify which narratives are currently running on CT and Base, but every token you reference MUST come from the live trending list provided in the user message (with that token's exact change24h and volume24h numbers).

Return ONLY raw JSON:
{
  "trending_narratives": [
    {
      "name": "string",
      "phase": "Emerging" | "Rising" | "Peak" | "Fading",
      "velocity": "up" | "stable" | "down",
      "tokens": [{ "symbol": "string", "change24h": number|null, "volume24h": number|null }],
      "entry_window": "open" | "closing" | "closed"
    }
  ],
  "top_opportunity": { "narrative": "string", "reason": "string" },
  "avoid_now": ["string"],
  "market_sentiment": "bullish" | "neutral" | "bearish"
}`;

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { focus?: string } = {};
    try {
      const text = await req.text();
      if (text?.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}
    const url = new URL(req.url);
    if (!body.focus) body.focus = url.searchParams.get("focus") || undefined;
    const focus = body.focus?.trim();

    console.log(`[NarrativePulse] focus=${focus ?? "(all)"}`);

    let trending: Pool[] = [];
    let fetchOk = true;
    try {
      trending = await getBaseTrending(15);
    } catch (e) {
      fetchOk = false;
      console.warn("[NarrativePulse] trending fetch failed:", (e as Error).message);
    }

    if (!fetchOk || trending.length === 0) {
      return Response.json({
        tool: "narrative-pulse",
        timestamp: new Date().toISOString(),
        trending_narratives: [],
        top_opportunity: null,
        avoid_now: [],
        market_sentiment: "neutral",
        note: "Live Base trending data (GeckoTerminal) was unavailable — please retry. No narratives shown to avoid fabricated tokens.",
      });
    }

    const tokenData = trending.map((p) => ({
      symbol: p.baseSymbol,
      pair: p.name,
      change24h: p.change.h24,
      volume24h: p.volume24h,
      liquidityUsd: p.liquidityUsd,
      marketCap: p.marketCap,
    }));

    const focusLine = focus ? `\n\nUser is focused on: "${focus}". Prioritize narratives relevant to it.` : "";
    const llmResponse = await callVeniceLLM({
      system: SYSTEM,
      messages: [{
        role: "user",
        content: `Identify the trending narratives running on Base / CT right now. Use web search for narrative context, but only reference these live trending Base tokens (use their exact change24h and volume24h):\n${JSON.stringify(tokenData, null, 2)}${focusLine}`,
      }],
      temperature: 0.3,
      maxTokens: 800,
    });

    let result = extractJsonObject(llmResponse);
    if (!result) result = { degraded: true, note: "Synthesis briefly unavailable - please retry." };

    return Response.json({
      tool: "narrative-pulse",
      timestamp: new Date().toISOString(),
      ...result,
      dataSource: "GeckoTerminal trending (live) + web search",
      disclaimer: "Narratives are a live snapshot and change continuously — not financial advice.",
    });
  } catch (error) {
    console.error("[NarrativePulse] Error:", error);
    return Response.json(
      { error: "Narrative pulse failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
