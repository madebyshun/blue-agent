// x402/rh-stock-agent-brief (A4) — agent-facing "why now" narrative.
// Price: $0.20
//
// A concise, agent-consumable JSON brief: real facts + web-search-grounded
// context + a DETERMINISTIC verdict field (hard-mapped from numbers, not
// LLM-picked). Agents wire the verdict directly into downstream skill
// calls without parsing prose.

import { findByTicker, RH_CHAIN } from "@/lib/robinhood/rwa-registry";
import { chainlinkLatest } from "@/lib/robinhood/rwa-price";
import { poolsForToken } from "@/lib/robinhood/rwa-market";
import { callVeniceLLM, extractJsonObject, NO_FABRICATION_RULE } from "@/app/api/_lib/llm";

type Verdict = "WATCH" | "ARB_LONG_DEX" | "ARB_SHORT_DEX" | "THIN_LIQUIDITY" | "NO_ORACLE" | "INSUFFICIENT_DATA";

function verdictFromNumbers(args: {
  chainlink_price_usd: number | null;
  dex_price_usd: number | null;
  dex_tvl_usd: number | null;
  dex_change_24h_pct: number | null;
}): Verdict {
  const { chainlink_price_usd, dex_price_usd, dex_tvl_usd } = args;
  if (chainlink_price_usd === null && dex_price_usd === null) return "INSUFFICIENT_DATA";
  if (chainlink_price_usd === null) return "NO_ORACLE";
  if (dex_tvl_usd !== null && dex_tvl_usd < 5_000) return "THIN_LIQUIDITY";
  if (dex_price_usd === null) return "WATCH";
  const pct = ((dex_price_usd - chainlink_price_usd) / chainlink_price_usd) * 100;
  if (pct < -0.5) return "ARB_LONG_DEX";   // DEX below oracle
  if (pct >  0.5) return "ARB_SHORT_DEX";  // DEX above oracle
  return "WATCH";
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { ticker?: string } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const ticker = (body.ticker ?? url.searchParams.get("ticker") ?? "").trim();
    if (!ticker) return Response.json({ error: "Provide `ticker`." }, { status: 400 });

    const token = findByTicker(ticker);
    if (!token) return Response.json({ tool: "rh-stock-agent-brief", ticker, error: "Ticker not in registry." }, { status: 404 });

    const timestamp = new Date().toISOString();

    const [oracle, pools] = await Promise.all([
      token.chainlinkFeed ? chainlinkLatest(token.chainlinkFeed, token.chainlinkHeartbeat ?? 86400) : Promise.resolve(null),
      poolsForToken(token.contract),
    ]);
    const deepestPool = pools[0] ?? null;
    const facts = {
      ticker: token.ticker,
      name: token.name,
      contract: token.contract,
      chainlink_price_usd: oracle?.price_usd ?? null,
      dex_price_usd: deepestPool?.price_usd ?? null,
      dex_change_24h_pct: deepestPool?.change_24h ?? null,
      dex_tvl_usd: deepestPool?.reserve_usd ?? null,
      dex_volume_24h_usd: deepestPool?.volume_24h_usd ?? null,
    };

    // Deterministic verdict — never LLM'd.
    const verdict = verdictFromNumbers(facts);

    // Web-searched context — LLM writes a short JSON summary + citations.
    const system = `You are Blue Agent producing an agent-consumable JSON brief. ${NO_FABRICATION_RULE}
Given a FACTS block for a Robinhood Chain tokenized stock, return ONLY a JSON object with:
  "one_line_context": string,       // 1 sentence why-now context (e.g. "Q3 earnings pending Aug 15")
  "web_sources": string[],           // 1-3 real source URLs used (empty if no relevant search)
  "risk_flags": string[]              // e.g. "thin_liquidity" | "no_oracle" | "recent_split" | []
Do NOT invent numbers, headlines, or URLs. Empty arrays are acceptable.`;

    const user = `FACTS:\n${JSON.stringify(facts, null, 2)}\n\nCompute the brief.`;
    let context: Record<string, unknown> = {};
    try {
      const raw = await callVeniceLLM({ system, user, temperature: 0, maxTokens: 400, webSearch: true });
      context = extractJsonObject(raw) ?? {};
    } catch {}

    return Response.json({
      tool: "rh-stock-agent-brief",
      ticker: token.ticker,
      name: token.name,
      contract: token.contract,
      facts,
      verdict,
      verdict_note: {
        ARB_LONG_DEX: "DEX price is materially below Chainlink oracle — consider buying DEX (basis narrow).",
        ARB_SHORT_DEX: "DEX price is materially above Chainlink oracle — consider selling DEX (basis narrow).",
        WATCH: "DEX/oracle aligned. No immediate directional signal.",
        THIN_LIQUIDITY: "DEX pool TVL below $5k — execution slippage will dominate any thesis.",
        NO_ORACLE: "No Chainlink feed available — cannot triangulate against DEX.",
        INSUFFICIENT_DATA: "Neither a Chainlink feed nor a DEX pool is available for this ticker right now.",
      }[verdict],
      one_line_context: context.one_line_context ?? null,
      web_sources: Array.isArray(context.web_sources) ? context.web_sources : [],
      risk_flags: Array.isArray(context.risk_flags) ? context.risk_flags : [],
      note: "Verdict is hard-mapped from Chainlink vs DEX deltas (never LLM-picked). Context is Venice-web-search-grounded. All numbers come from on-chain reads.",
      data_sources: ["Chainlink AggregatorV3 (RH Chain)", "api.geckoterminal.com (RH Chain)", "Venice web search"],
      network: RH_CHAIN,
      timestamp,
    });
  } catch (e) {
    return Response.json({ error: "rh-stock-agent-brief failed", message: (e as Error).message }, { status: 500 });
  }
}
