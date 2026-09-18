// x402/rh-stock-agent-brief (A4) — agent-facing "why now" narrative.
// Price: $0.20
//
// A concise, agent-consumable JSON brief: real facts + web-search-grounded
// context + a DETERMINISTIC verdict field (hard-mapped from numbers, not
// LLM-picked). Agents wire the verdict directly into downstream skill
// calls without parsing prose.

import { findByTicker, RH_CHAIN } from "@/lib/robinhood/rwa-registry";
import { chainlinkLatest } from "@/lib/robinhood/rwa-price";
import { resolvePrimaryPool, nyseMarketStatus } from "@/lib/robinhood/rwa-market";
import { callLLM, extractJsonObject, NO_FABRICATION_RULE } from "@/app/api/_lib/llm";

type Verdict =
  | "WATCH"
  | "ARB_LONG_DEX" | "ARB_SHORT_DEX"
  | "PREMARKET_DRIFT" | "AFTERHOURS_DRIFT" | "FROZEN_ALIGNED"
  | "THIN_LIQUIDITY" | "NO_ORACLE" | "INSUFFICIENT_DATA";

function verdictFromNumbers(args: {
  chainlink_price_usd: number | null;
  dex_price_usd: number | null;
  dex_tvl_usd: number | null;
  dex_change_24h_pct: number | null;
  market_is_open: boolean;
  market_session: "regular" | "premarket" | "afterhours" | "weekend";
}): Verdict {
  const { chainlink_price_usd, dex_price_usd, dex_tvl_usd, market_is_open, market_session } = args;
  if (chainlink_price_usd === null && dex_price_usd === null) return "INSUFFICIENT_DATA";
  if (chainlink_price_usd === null) return "NO_ORACLE";
  if (dex_tvl_usd !== null && dex_tvl_usd < 5_000) return "THIN_LIQUIDITY";
  if (dex_price_usd === null) return "WATCH";
  const pct = ((dex_price_usd - chainlink_price_usd) / chainlink_price_usd) * 100;
  const threshold = market_is_open ? 0.5 : 1.5;
  if (Math.abs(pct) < threshold) return market_is_open ? "WATCH" : "FROZEN_ALIGNED";
  if (market_is_open) return pct < 0 ? "ARB_LONG_DEX" : "ARB_SHORT_DEX";
  // Market closed → the drift is not arb, it's overnight price discovery.
  return market_session === "premarket" ? "PREMARKET_DRIFT" : "AFTERHOURS_DRIFT";
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

    const [oracle, primary] = await Promise.all([
      token.chainlinkFeed ? chainlinkLatest(token.chainlinkFeed, token.chainlinkHeartbeat ?? 86400) : Promise.resolve(null),
      resolvePrimaryPool(token.contract),
    ]);
    const deepestPool = primary.pool;
    const market = nyseMarketStatus();
    const facts = {
      ticker: token.ticker,
      name: token.name,
      contract: token.contract,
      chainlink_price_usd: oracle?.price_usd ?? null,
      chainlink_updated_at: oracle?.updated_at ?? null,
      chainlink_age_seconds: oracle?.age_seconds ?? null,
      dex_price_usd: deepestPool?.price_usd ?? null,
      dex_change_24h_pct: deepestPool?.change_24h ?? null,
      dex_tvl_usd: deepestPool?.reserve_usd ?? null,
      dex_volume_24h_usd: deepestPool?.volume_24h_usd ?? null,
      pool_selection: primary.selection,
    };

    // Warnings must mirror M5 so an agent reading A4 sees the same
    // confidence signals as one reading M5 for the same ticker + moment.
    const FEED_FRESH_MAX_AGE_INHOURS_SECONDS = 15 * 60;
    const factWarnings: string[] = [];
    if (!market.is_open) factWarnings.push(`market_closed_session_${market.session}: Chainlink frozen on last regular print; DEX drifts. Verdict reflects post-close drift, NOT arb.`);
    if (market.is_open && oracle && oracle.age_seconds > FEED_FRESH_MAX_AGE_INHOURS_SECONDS) {
      factWarnings.push(`feed_abnormally_stale: Chainlink age ${oracle.age_seconds}s while market OPEN — expected <${FEED_FRESH_MAX_AGE_INHOURS_SECONDS}s. Treat verdict as low-confidence.`);
    }
    if (facts.dex_tvl_usd !== null && facts.dex_tvl_usd < 5_000) {
      factWarnings.push(`thin_dex_pool: only $${facts.dex_tvl_usd.toFixed(0)} TVL — spot may be dominated by a single trade.`);
    }

    // Deterministic verdict — never LLM'd. Now market-hours aware.
    const verdict = verdictFromNumbers({
      ...facts,
      market_is_open: market.is_open,
      market_session: market.session,
    });

    // Model-recall context — NOT web-searched. This comment said "Web-searched
    // context … + citations" until 2026-09-18, and the prompt below asked for
    // "1-3 real source URLs used". The gateway is Virtuals, which has no web
    // search at all (`webSearch` is an explicitly ignored param on callLLM), so
    // there was never a search behind those URLs: any URL the model returned was
    // recalled or invented. Asking a model for citations it cannot have fetched
    // is a fabrication prompt, so the field is gone rather than warned about.
    const system = `You are Blue Agent producing an agent-consumable JSON brief. ${NO_FABRICATION_RULE}
You have NO web access on this call. Write only from the FACTS block below plus
general background you are confident in. Never cite a URL — you cannot open one.
Given a FACTS block for a Robinhood Chain tokenized stock, return ONLY a JSON object with:
  "one_line_context": string,       // 1 sentence why-now context (e.g. "Q3 earnings pending Aug 15"), or "" if you have none
  "risk_flags": string[]              // e.g. "thin_liquidity" | "no_oracle" | "recent_split" | []
Do NOT invent numbers, headlines, or URLs. Empty values are acceptable and preferred over a guess.`;

    const user = `FACTS:\n${JSON.stringify(facts, null, 2)}\n\nCompute the brief.`;
    let context: Record<string, unknown> = {};
    let llm_provider: string | null = null;
    let llm_web_search_used = false;
    let llm_duration_ms: number | null = null;
    let llm_attempts: unknown[] = [];
    try {
      // No `webSearch: true` here any more. callLLM documents that param as
      // ignored (Virtuals has no search), so passing it only made readers of this
      // file believe a search happened.
      const r = await callLLM({ system, user, temperature: 0, maxTokens: 400 });
      context = extractJsonObject(r.text) ?? {};
      llm_provider = r.provider;
      llm_web_search_used = r.web_search_used;
      llm_duration_ms = r.duration_ms;
      llm_attempts = r.attempts;
    } catch (e) {
      llm_attempts = ((e as Error & { attempts?: unknown[] }).attempts) ?? [];
      console.warn("[rh-stock-agent-brief] LLM chain failed:", (e as Error).message);
    }

    return Response.json({
      tool: "rh-stock-agent-brief",
      ticker: token.ticker,
      name: token.name,
      contract: token.contract,
      facts,
      verdict,
      market,
      verdict_note: {
        ARB_LONG_DEX: "Market OPEN + DEX materially below Chainlink oracle — real arb: consider buying DEX (basis narrow).",
        ARB_SHORT_DEX: "Market OPEN + DEX materially above Chainlink oracle — real arb: consider selling DEX (basis narrow).",
        WATCH: "Market OPEN + DEX/oracle aligned. No immediate directional signal.",
        PREMARKET_DRIFT: "Market CLOSED (premarket). Chainlink is frozen on the last regular-hours print; DEX has drifted — this is on-chain price discovery, NOT arb. Expect a snap toward the feed at 9:30 ET open.",
        AFTERHOURS_DRIFT: "Market CLOSED (afterhours/weekend). Chainlink frozen; DEX drift reflects overnight sentiment, not arb.",
        FROZEN_ALIGNED: "Market CLOSED. DEX still hugs the frozen Chainlink print — no notable drift.",
        THIN_LIQUIDITY: "DEX pool TVL below $5k — execution slippage will dominate any thesis.",
        NO_ORACLE: "No Chainlink feed available — cannot triangulate against DEX.",
        INSUFFICIENT_DATA: "Neither a Chainlink feed nor a DEX pool is available for this ticker right now.",
      }[verdict],
      one_line_context: context.one_line_context ?? null,
      // ALWAYS empty, and kept in the response only so the shape stays stable for
      // existing paid consumers. It used to pass through whatever URLs the model
      // emitted, labelled "real source URLs used" — with no search behind them.
      // An empty array is the true answer; a recalled URL dressed as a citation
      // is not.
      web_sources: [],
      risk_flags: Array.isArray(context.risk_flags) ? context.risk_flags : [],
      warnings: factWarnings.concat(
        [
          llm_provider === null ? "llm_context_unavailable: verdict + warnings are still deterministic on facts; only the natural-language context is missing" : null,
          // Unconditional once the LLM answers: Virtuals has no web search, so
          // `one_line_context` is always model recall, never a fetched source.
          llm_provider !== null && !llm_web_search_used ? `no_web_search: ${llm_provider} has no web-search capability — one_line_context is model recall, not a sourced claim, and web_sources is always empty` : null,
        ].filter((x): x is string => !!x),
      ),
      llm: {
        provider: llm_provider,
        web_search_used: llm_web_search_used,
        duration_ms: llm_duration_ms,
        attempts: llm_attempts,
      },
      // Said "Virtuals (primary) → Venice (fallback, web-search if reached) →
      // Bankr" until 2026-09-18, and listed "Venice web search" as a data source.
      // That chain was stripped from callLLM on 2026-07-25 — it is Virtuals only,
      // and on failure it throws rather than trying a second vendor. Venice was
      // never reached and no search ever ran, so it was not a data source.
      note: "Verdict + warnings hard-mapped from Chainlink vs DEX + market-hours + feed age (never LLM-picked). Warnings mirror M5. Context synthesis: Virtuals only — no provider fallback, and no web search on this gateway, so one_line_context is model recall rather than a sourced claim. Every attempt logged.",
      data_sources: ["Chainlink AggregatorV3 (RH Chain)", "api.geckoterminal.com (RH Chain)"],
      network: RH_CHAIN,
      timestamp,
    });
  } catch (e) {
    return Response.json({ error: "rh-stock-agent-brief failed", message: (e as Error).message }, { status: 500 });
  }
}
