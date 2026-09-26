// x402/dex-flow — DEX volume, buy/sell pressure and liquidity flow for any Base token
// Price: $0.15 — Fully self-contained, no external workspace imports

import { callLLM } from "@/app/api/_lib/llm";
import { sideOf } from "./_dex-side";

type BankrMessage = { role: string; content: string };

// Delegates to `callLLM`, which calls VIRTUALS AND NOTHING ELSE. This said
// "the shared Virtuals → Venice → Bankr chain" until 2026-09-18; that chain
// was stripped 2026-07-25 (see the header of api/_lib/llm.ts). There is no
// retry across providers — on failure callLLM throws a typed LLM_UNAVAILABLE
// for the caller to degrade around, rather than silently trying a second
// vendor. Name/signature preserved so all call sites stay identical.
async function callBankrLLM(opts: {
  model?: string; system: string; messages: BankrMessage[];
  temperature?: number; maxTokens?: number;
}): Promise<string> {
  const r = await callLLM({
    system: opts.system,
    messages: opts.messages,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
    model: opts.model,
  });
  return r.text;
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

type FlowRow = { queried_token_side: "base" | "quote"; [k: string]: unknown };

async function getDexData(token: string): Promise<FlowRow[]> {
  const isAddress = /^0x[a-fA-F0-9]{40}$/.test(token);
  const url = isAddress
    ? `${DEXSCREENER_URL}/tokens/${token}`
    : `${DEXSCREENER_URL}/search?q=${encodeURIComponent(token)}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`DexScreener error: ${res.status}`);
  const data = await res.json() as { pairs?: unknown[] };

  type Pair = { chainId?: string; volume?: { h24?: number }; dexId?: string; baseToken?: { symbol?: string; address?: string }; quoteToken?: { symbol?: string; address?: string }; priceUsd?: string; priceChange?: { h1?: number; h24?: number }; liquidity?: { usd?: number }; txns?: { h24?: { buys?: number; sells?: number } } };

  // Flow is why this tool exists, and volume/liquidity are whole-pool figures —
  // so unlike token-price we KEEP quote-side pairs. Dropping them would hide
  // where a stablecoin's flow actually is: USDC's 6 deepest Base pairs are all
  // quote-side, so a base-side-only filter would report a $144k pool as the
  // whole picture. What must not leak is the base token's PRICE and its buy/sell
  // DIRECTION, which is how this returned AERO's numbers for USDC (see _dex-side).
  return ((data.pairs ?? []) as Pair[])
    .filter(p => p.chainId === "base")
    .sort((a, b) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0))
    .slice(0, 5)
    .map(p => {
      const { side, symbol } = sideOf(p, token);
      const pricesQueried = side === "base";
      return {
        dex: p.dexId,
        // The pool's real name, both sides — correct as-is, and now unambiguous
        // next to queried_token_side.
        pair: (p.baseToken?.symbol ?? "") + "/" + (p.quoteToken?.symbol ?? ""),
        queried_token: symbol,
        queried_token_side: side,
        // priceUsd and priceChange describe the pair's BASE token only. Null when
        // the caller asked about the quote side: there is no price of this token
        // in this pool to report, and inverting one would be invented.
        price: pricesQueried ? p.priceUsd : null,
        priceChange1h: pricesQueried ? p.priceChange?.h1 : null,
        priceChange24h: pricesQueried ? p.priceChange?.h24 : null,
        // Whole-pool, side-agnostic — always the queried token's real flow.
        volume24h: p.volume?.h24,
        liquidity: p.liquidity?.usd,
        // A DexScreener "buy" is a buy OF THE BASE TOKEN, so on AERO/USDC these
        // counts are AERO's direction and a USDC buy reads as an AERO sell.
        // Named rather than silently swapped: a quote asset being spent to
        // acquire something else is not a view on the quote asset.
        flow_measured_in: p.baseToken?.symbol ?? null,
        txns24h: (p.txns?.h24?.buys ?? 0) + (p.txns?.h24?.sells ?? 0),
        buys24h: p.txns?.h24?.buys,
        sells24h: p.txns?.h24?.sells,
      };
    });
}

const SYSTEM = `You are a DEX flow analyst interpreting on-chain trading data for Base chain tokens.

Analyze volume, buy/sell pressure, liquidity, and price action to assess market sentiment and flow direction.

CRITICAL DATA RULE: Use ONLY the live DexScreener numbers provided in the user message. Derive pressureScore, buySellRatio, and volume from those exact buys/sells/volume figures. NEVER invent volume, ratios, or liquidity that aren't in the data.

PAIR SIDE RULE: every pair carries queried_token_side. Where it is "quote", that pool's buys24h/sells24h count trades of flow_measured_in — the OTHER token — and price/priceChange are null because DexScreener prices only a pair's base token. Never read such a pool as the queried token's own price action or buy/sell pressure, and never flip its ratio to stand in for one. volume24h and liquidity ARE the queried token's real figures on either side, so still use them for volume24h and liquidityHealth. If EVERY pair is quote-side, say in priceAction that this token trades only as a quote asset so no direction can be measured for it.

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

    let dexData: FlowRow[] = [];
    let fetchOk = true;
    try {
      dexData = await getDexData(token);
    } catch {
      fetchOk = false;
      console.warn("[DexFlow] DexScreener fetch failed");
    }

    // Don't fabricate flow metrics with no data. Separate a fetch failure
    // (retry) from a genuine no-listing.
    if (!fetchOk) {
      return Response.json({
        token, chain: "base", pressure: "UNKNOWN", pressureScore: null,
        volume24h: "n/a", buySellRatio: "n/a", liquidityHealth: "UNKNOWN",
        priceAction: "Live DEX data source (DexScreener) was unavailable.",
        topPairs: [], signals: [],
        recommendation: "Could not fetch live DEX flow — please retry shortly. No estimated flow metrics are shown to avoid fabricated numbers.",
        dataSource: "DexScreener (unavailable)",
        disclaimer: "DEX flow is a live snapshot and changes continuously — not financial advice.",
      });
    }
    if (dexData.length === 0) {
      return Response.json({
        token, chain: "base", pressure: "UNKNOWN", pressureScore: null,
        volume24h: "n/a", buySellRatio: "n/a", liquidityHealth: "UNKNOWN",
        priceAction: `No Base-chain DEX pairs found for "${token}".`,
        topPairs: [], signals: [],
        recommendation: `No live Base DEX pair matched "${token}". Check the token address, or it may have no DEX liquidity yet.`,
        dataSource: "DexScreener (live)",
        disclaimer: "DEX flow is a live snapshot and changes continuously — not financial advice.",
      });
    }

    const llmResponse = await callBankrLLM({
      system: SYSTEM,
      messages: [{ role: "user", content: `Analyze DEX flow for ${token} on Base chain.\n\nLive DexScreener data (Base chain) — use ONLY these numbers:\n${JSON.stringify(dexData, null, 2)}\n\nAssess buy/sell pressure, volume trends, and liquidity health from the exact figures above.` }],
      temperature: 0.3,
      maxTokens: 800,
    });
    let result = extractJsonObject(llmResponse);
    if (!result) result = { degraded: true, note: "Synthesis briefly unavailable - please retry." };

    // A token found only on the quote side has no measurable direction of its
    // own: every buys/sells count belongs to the other token. The prompt says so,
    // but the verdict is hard-mapped here because a word the model picks can flip
    // between runs on identical input (CLAUDE.md). Liquidity and volume are
    // whole-pool, so those stay — this withholds direction only.
    const quoteSideOnly = dexData.length > 0 && dexData.every((r) => r.queried_token_side === "quote");
    const resolved = (typeof dexData[0]?.queried_token === "string" ? dexData[0].queried_token : null) ?? token;

    return Response.json({
      ...result,
      ...(quoteSideOnly
        ? {
            pressure: "UNKNOWN",
            pressureScore: null,
            buySellRatio: "n/a",
            side_note: `${resolved} appears on Base only as the QUOTE side of its pairs. Volume and liquidity here are real, but buy/sell counts in those pools measure the other token, so no buy/sell pressure is reported for ${resolved} rather than inverting someone else's.`,
          }
        : {}),
      // The measured rows, after ...result so the model cannot overwrite them.
      // topPairs above is the model RE-TYPING these numbers; this is the source
      // it was given, and the only place queried_token_side is visible to a
      // caller who needs to know which token a figure describes.
      pairs: dexData,
      dataSource: "DexScreener (live)",
      disclaimer: "DEX flow is a live snapshot and changes continuously — not financial advice.",
    });
  } catch (error) {
    console.error("[DexFlow] Error:", error);
    return Response.json({ error: "DEX flow analysis failed", message: (error as Error).message }, { status: 500 });
  }
}
