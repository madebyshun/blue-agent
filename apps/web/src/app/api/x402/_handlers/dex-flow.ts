// x402/dex-flow — DEX volume, buy/sell pressure and liquidity flow for any Base token
// Price: $0.15 — Fully self-contained, no external workspace imports
//
// EVERY NUMBER HERE IS COMPUTED IN CODE. The LLM only writes prose.
//
// It did not used to be. Until 2026-09-26 this handler handed the model five
// nested DexScreener pair objects and asked it to derive pressureScore,
// per-pair buySellRatio and formatted volumes itself — and that is what broke
// it. `deepseek-deepseek-v4-flash` is a reasoning model whose reasoning is
// billed out of `max_tokens` without ever reaching `content`, and an
// in-head-arithmetic prompt makes that phase expand to fill whatever budget it
// is offered. Measured against this exact prompt on 2026-09-26:
//
//     wire budget  2000  →  0/3 answered, reasoning 1657–1830
//                  3200  →  0/3 answered, reasoning 2607–2676
//                  6000  →  2/4 answered, reasoning 2645–4493
//                 12000  →  2/4 answered, reasoning 3333–8099
//
// Reasoning tracks the budget instead of converging, so there is NO value of
// `maxTokens`/`REASONING_HEADROOM_TOKENS` that fixes this — at 6x the budget it
// was still coin-flip unreliable, and the tool returned a 500 on every real
// call. The control proves the prompt was the variable, not the budget: at the
// identical `maxTokens: 800`, scam-detector (7 scalar facts, flat JSON) spends
// ~200 reasoning tokens and answers 6/6.
//
// So the arithmetic moved into code, where CLAUDE.md already required it to be
// ("compute derived values in code, not by LLM"; "verdicts hard-map from the
// numeric score in code"). Three consequences worth keeping:
//   • The verdict word is a pure function of pressureScore — the same input can
//     no longer flip between runs.
//   • The PAIR SIDE RULE is now enforced by arithmetic instead of asked for in
//     prose: direction sums over base-side rows ONLY, so a quote-side pool can
//     no longer contribute another token's buy pressure. See `deriveFlow`.
//   • An LLM outage degrades to `priceAction/signals/recommendation: null` with
//     every real figure intact, instead of a 500. Do not "simplify" that catch
//     back into a throw: the numbers are the product, the prose is a garnish.

import { callLLM } from "@/app/api/_lib/llm";
import { sideOf } from "@/lib/dex-side";

function extractJsonObject(text: string): Record<string, unknown> | null {
  let raw = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s >= 0 && e > s) raw = raw.slice(s, e + 1);
  try { return JSON.parse(raw); } catch {}
  try { return JSON.parse(raw.replace(/[\x00-\x1F\x7F]/g, " ")); } catch {}
  return null;
}

const DEXSCREENER_URL = "https://api.dexscreener.com/latest/dex";

export type DexPair = {
  dex: string | null;
  pair: string;
  queried_token: string | null;
  /** Which side the queried token sits on. "base" is the ticker-path default. */
  queried_token_side: "base" | "quote";
  /** Which token `buys24h`/`sells24h` actually count trades of. */
  flow_measured_in: string | null;
  price: string | null;
  priceChange1h: number | null;
  priceChange24h: number | null;
  volume24h: number;
  liquidity: number;
  buys24h: number;
  sells24h: number;
};

async function getDexData(token: string): Promise<DexPair[]> {
  const isAddress = /^0x[a-fA-F0-9]{40}$/.test(token);
  const url = isAddress
    ? `${DEXSCREENER_URL}/tokens/${token}`
    : `${DEXSCREENER_URL}/search?q=${encodeURIComponent(token)}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`DexScreener error: ${res.status}`);
  const data = await res.json() as { pairs?: unknown[] };

  type Pair = { chainId?: string; volume?: { h24?: number }; dexId?: string; baseToken?: { symbol?: string; address?: string }; quoteToken?: { symbol?: string; address?: string }; priceUsd?: string; priceChange?: { h1?: number; h24?: number }; liquidity?: { usd?: number }; txns?: { h24?: { buys?: number; sells?: number } } };

  const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

  // Flow is why this tool exists, and volume/liquidity are whole-pool figures —
  // so unlike token-price we KEEP quote-side pairs. Dropping them would hide
  // where a stablecoin's flow actually is: USDC's 6 deepest Base pairs are all
  // quote-side, so a base-side-only filter would report a $144k pool as the
  // whole picture. What must not leak is the base token's PRICE and its buy/sell
  // DIRECTION, which is how this returned AERO's numbers for USDC (see dex-side).
  return ((data.pairs ?? []) as Pair[])
    .filter(p => p.chainId === "base")
    .sort((a, b) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0))
    .slice(0, 5)
    .map(p => {
      const { side, symbol } = sideOf(p, token);
      const pricesQueried = side === "base";
      return {
        dex: p.dexId ?? null,
        // The pool's real name, both sides — correct as-is, and unambiguous
        // next to queried_token_side.
        pair: (p.baseToken?.symbol ?? "") + "/" + (p.quoteToken?.symbol ?? ""),
        queried_token: symbol,
        queried_token_side: side,
        // A DexScreener "buy" is a buy OF THE BASE TOKEN, so on AERO/USDC these
        // counts are AERO's direction and a USDC buy reads as an AERO sell.
        // Named rather than silently swapped: a quote asset being spent to
        // acquire something else is not a view on the quote asset.
        flow_measured_in: p.baseToken?.symbol ?? null,
        // priceUsd and priceChange describe the pair's BASE token only. Null when
        // the caller asked about the quote side: there is no price of this token
        // in this pool to report, and inverting one would be invented.
        price: pricesQueried ? (p.priceUsd ?? null) : null,
        priceChange1h: pricesQueried ? n(p.priceChange?.h1) : null,
        priceChange24h: pricesQueried ? n(p.priceChange?.h24) : null,
        // Whole-pool, side-agnostic — always the queried token's real flow.
        volume24h: n(p.volume?.h24) ?? 0,
        liquidity: n(p.liquidity?.usd) ?? 0,
        buys24h: n(p.txns?.h24?.buys) ?? 0,
        sells24h: n(p.txns?.h24?.sells) ?? 0,
      };
    });
}

function fmtUsd(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

/** "+0.37% to +0.84%" across pairs, collapsed when they agree. Handed to the
 *  model finished, because "compare these 5 rows" is the exact invitation that
 *  makes a reasoning model spiral — see the header. */
function fmtPctRange(values: (number | null)[]): string | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  const lo = Math.min(...nums), hi = Math.max(...nums);
  const sign = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
  return lo === hi ? sign(lo) : `${sign(lo)} to ${sign(hi)}`;
}

/** "62% buys / 38% sells", or null when the pool had no trades to divide. */
function fmtRatio(buys: number, sells: number): string | null {
  const total = buys + sells;
  if (total === 0) return null;
  const buyPct = Math.round((buys / total) * 100);
  return `${buyPct}% buys / ${100 - buyPct}% sells`;
}

type Flow = {
  pressure: "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL" | "UNKNOWN";
  pressureScore: number | null;
  volume24h: string;
  buySellRatio: string;
  liquidityHealth: "DEEP" | "MODERATE" | "THIN" | "CRITICAL" | "UNKNOWN";
  totalVolume: number;
  totalLiquidity: number;
  totalBuys: number;
  totalSells: number;
  /** No pair measures direction for the queried token — it is only ever a quote. */
  quoteSideOnly: boolean;
  topPairs: {
    dex: string | null;
    pair: string;
    volume24h: string;
    buySellRatio: string;
    flowMeasuredIn: string | null;
  }[];
};

export function deriveFlow(pairs: DexPair[]): Flow {
  // Whole-pool and side-agnostic, so every pair counts — quote-side included.
  // Excluding them would report a stablecoin's $144k base-side pool as its
  // entire depth instead of its real $39M.
  const totalVolume = pairs.reduce((s, p) => s + p.volume24h, 0);
  const totalLiquidity = pairs.reduce((s, p) => s + p.liquidity, 0);

  // Direction is base-relative, so it sums over base-side rows ONLY. This is the
  // PAIR SIDE RULE as arithmetic rather than as a prompt instruction: a
  // quote-side pool's buys count trades of the OTHER token, and folding them in
  // is exactly how this tool once published AERO's buy pressure as USDC's.
  const directional = pairs.filter(p => p.queried_token_side === "base");
  const totalBuys = directional.reduce((s, p) => s + p.buys24h, 0);
  const totalSells = directional.reduce((s, p) => s + p.sells24h, 0);
  const totalTxns = totalBuys + totalSells;
  const quoteSideOnly = pairs.length > 0 && directional.length === 0;

  // No measurable direction ⇒ no pressure. An absent ratio must NOT collapse to
  // a neutral 50; that would publish a measured-looking score derived from
  // nothing. This covers both causes — a pool nobody traded, and a token that
  // only ever appears as someone else's quote asset.
  const pressureScore = totalTxns === 0 ? null : Math.round((totalBuys / totalTxns) * 100);

  const pressure: Flow["pressure"] =
    pressureScore === null ? "UNKNOWN"
      : pressureScore >= 65 ? "STRONG_BUY"
      : pressureScore >= 55 ? "BUY"
      : pressureScore > 45 ? "NEUTRAL"
      : pressureScore > 35 ? "SELL"
      : "STRONG_SELL";

  const liquidityHealth: Flow["liquidityHealth"] =
    totalLiquidity <= 0 ? "UNKNOWN"
      : totalLiquidity >= 1_000_000 ? "DEEP"
      : totalLiquidity >= 250_000 ? "MODERATE"
      : totalLiquidity >= 50_000 ? "THIN"
      : "CRITICAL";

  return {
    pressure,
    pressureScore,
    volume24h: fmtUsd(totalVolume),
    buySellRatio: fmtRatio(totalBuys, totalSells)
      ?? (quoteSideOnly ? "n/a — quote-side only" : "no trades in 24h"),
    liquidityHealth,
    totalVolume,
    totalLiquidity,
    totalBuys,
    totalSells,
    quoteSideOnly,
    topPairs: pairs.map(p => ({
      dex: p.dex,
      pair: p.pair,
      volume24h: fmtUsd(p.volume24h),
      // Labelled, never inverted. On a quote-side row this ratio is real but it
      // is the OTHER token's, which is what flowMeasuredIn exists to say.
      buySellRatio: fmtRatio(p.buys24h, p.sells24h) ?? "no trades in 24h",
      flowMeasuredIn: p.flow_measured_in,
    })),
  };
}

// Prose only. Every figure this model might otherwise compute is already
// derived in `deriveFlow` and passed in finished — asking for arithmetic here is
// what starved the answer (see the header).
const SYSTEM = `You are a DEX flow analyst writing a short interpretation of Base chain trading data.

The volume, buy/sell pressure, liquidity and verdict have ALREADY been computed from live DexScreener data and are given to you. Do not recompute them, do not contradict them, and do not introduce any number that is not in the data provided.

Where a figure is given as "unknown", or a direction is reported as not measurable, say so plainly. Never substitute a guess, and never describe another token's trading as this one's.

Return ONLY valid JSON, no markdown:

{
  "priceAction": "one sentence on recent price movement, citing only the given percentages",
  "signals": ["2 to 4 short factual observations about this flow"],
  "recommendation": "one or two sentences on what this flow suggests for a trader"
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

    let dexData: DexPair[] = [];
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

    const flow = deriveFlow(dexData);
    const resolved = dexData[0]?.queried_token ?? token;

    // Scalars only, and every cross-pair comparison already collapsed to one
    // string. The nested five-row dump this replaced is what made the reasoning
    // phase unbounded.
    const facts = {
      token: resolved,
      pressure: flow.pressure,
      pressureScore: flow.pressureScore,
      total_volume_24h_usd: Math.round(flow.totalVolume),
      total_liquidity_usd: Math.round(flow.totalLiquidity),
      buys_24h: flow.quoteSideOnly ? "not measurable for this token" : flow.totalBuys,
      sells_24h: flow.quoteSideOnly ? "not measurable for this token" : flow.totalSells,
      buy_sell_ratio: flow.buySellRatio,
      liquidity_health: flow.liquidityHealth,
      pair_count: dexData.length,
      dexes: [...new Set(dexData.map(p => p.dex).filter(Boolean))],
      // Null on every quote-side row, so this reads "unknown" exactly when
      // DexScreener carries no price for the queried token.
      price_change_1h: fmtPctRange(dexData.map(p => p.priceChange1h)) ?? "unknown",
      price_change_24h: fmtPctRange(dexData.map(p => p.priceChange24h)) ?? "unknown",
      ...(flow.quoteSideOnly
        ? { note: `${resolved} trades on Base only as the QUOTE side of its pairs. Volume and liquidity are real; price and buy/sell direction cannot be measured for it.` }
        : {}),
    };

    // Prose is a garnish on numbers that are already real, so an LLM outage
    // degrades these three fields to null rather than failing the paid call.
    let prose: Record<string, unknown> = { priceAction: null, signals: null, recommendation: null };
    let degraded: string | undefined;
    try {
      const llmResponse = (await callLLM({
        system: SYSTEM,
        messages: [{ role: "user", content: `Write the interpretation for ${resolved} on Base chain.\n\nAlready-computed live DexScreener figures:\n${JSON.stringify(facts, null, 2)}` }],
        temperature: 0.3,
        maxTokens: 500,
      })).text;
      const parsed = extractJsonObject(llmResponse);
      if (parsed) {
        prose = {
          priceAction: parsed.priceAction ?? null,
          signals: Array.isArray(parsed.signals) ? parsed.signals : null,
          recommendation: parsed.recommendation ?? null,
        };
      } else {
        degraded = "Narrative synthesis returned an unparseable response — flow metrics below are live and unaffected.";
      }
    } catch (e) {
      console.warn("[DexFlow] synthesis unavailable:", (e as Error).message);
      degraded = "Narrative synthesis was unavailable — flow metrics below are live and unaffected.";
    }

    return Response.json({
      token,
      chain: "base",
      pressure: flow.pressure,
      pressureScore: flow.pressureScore,
      volume24h: flow.volume24h,
      buySellRatio: flow.buySellRatio,
      liquidityHealth: flow.liquidityHealth,
      ...prose,
      topPairs: flow.topPairs,
      ...(flow.quoteSideOnly
        ? {
            side_note: `${resolved} appears on Base only as the QUOTE side of its pairs. Volume and liquidity here are real, but buy/sell counts in those pools measure the other token, so no buy/sell pressure is reported for ${resolved} rather than inverting someone else's.`,
          }
        : {}),
      // The measured rows. `topPairs` is a formatted summary of these; this is
      // the only place queried_token_side and flow_measured_in are visible to a
      // caller who needs to know which token a figure describes.
      pairs: dexData,
      ...(degraded ? { degraded: true, note: degraded } : {}),
      dataSource: "DexScreener (live)",
      disclaimer: "DEX flow is a live snapshot and changes continuously — not financial advice.",
    });
  } catch (error) {
    console.error("[DexFlow] Error:", error);
    return Response.json({ error: "DEX flow analysis failed", message: (error as Error).message }, { status: 500 });
  }
}
