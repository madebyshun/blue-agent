// x402/rh-stock-report (A3) — on-chain vol brief.
// Price: $0.20
//
// Composes:
//   • Chainlink oracle price + 24h DEX change (L1 / M1 / M4 data)
//   • Top DEX pool + TVL / volume
// Then asks the LLM to synthesize a brief report. All numbers come from
// tools; the LLM interprets, doesn't invent. Temperature 0.3.
//
// NO NEWS, AND NO CITATIONS — corrected 2026-09-18. This header advertised
// "Venice web-search for real-world news headlines … tagged with source
// citations", and the prompt ordered the model to search and return URLs.
// Neither was ever possible: the gateway is Virtuals (callLLM), which has no
// web search, and `webSearch` is a documented no-op param. So the "News" section
// of a PAID report was headlines and URLs recalled by a model and presented as
// sourced reporting — the exact failure mode CLAUDE.md's data-vs-advisory rule
// exists to prevent ("prompts do not prevent hallucination; data sources do").
// The section is now background-only, self-labelled unverified, with the model
// told plainly that it has no web access. If real news is wanted here, it needs
// a real news API wired in — not a prompt that asks nicely.
//
// #231 — THE `dex_*` FIELDS ARE PROMPT INPUT, which is the reason this file
// matters more than its $0.20 suggests. Everything in `facts` is handed to the
// model under "Do NOT contradict them", so a wrong number here is not merely
// displayed — it is ARGUED FOR, in prose, by a research brief. The no-
// fabrication rule protects a number's provenance, never its denomination, so
// the denomination has to be right before the prompt is built. The pool is
// therefore `resolvePrimaryPool` (dollar-anchored, USDG preferred), and when
// no dollar market exists every `dex_*` field is null with an explicit
// `dex_price_unavailable_reason` the model is told to report as a gap.

import { findByTicker, RH_CHAIN } from "@/lib/robinhood/rwa-registry";
import { chainlinkLatest } from "@/lib/robinhood/rwa-price";
import { resolvePrimaryPool } from "@/lib/robinhood/rwa-market";
import { callLLM, NO_FABRICATION_RULE } from "@/app/api/_lib/llm";

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { ticker?: string; horizon?: string } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const ticker = (body.ticker ?? url.searchParams.get("ticker") ?? "").trim();
    const horizon = ((body.horizon ?? url.searchParams.get("horizon") ?? "week") as string).toLowerCase();

    if (!ticker) return Response.json({ error: "Provide `ticker`." }, { status: 400 });

    const token = findByTicker(ticker);
    if (!token) return Response.json({ tool: "rh-stock-report", ticker, error: "Ticker not in registry." }, { status: 404 });

    const timestamp = new Date().toISOString();

    // ── Real, verifiable numbers from our own primitives ─────────────────
    const [oracle, primary] = await Promise.all([
      token.chainlinkFeed ? chainlinkLatest(token.chainlinkFeed, token.chainlinkHeartbeat ?? 86400) : Promise.resolve(null),
      resolvePrimaryPool(token.contract),
    ]);
    const primaryPool = primary.pool;
    // Why there is no DEX price, stated in the FACTS block itself rather than
    // left as a bare null for the model to fill in from priors. `no_usd_
    // anchored_pool` is NOT an outage — the token has pools, they just price it
    // against another equity or a memecoin, so there is no dollar quote to
    // report. Saying so is the whole point (#231).
    const dex_price_unavailable_reason = primaryPool
      ? null
      : primary.selection === "no_usd_anchored_pool"
        ? `${primary.pool_count} DEX pool(s) exist for this token on Robinhood Chain but none is quoted against a dollar-anchored asset (USDG/WETH). Their prices are exchange rates against another equity or a memecoin, not USD, so no dex_* figure is reported.`
        : "No DEX pool found for this token on Robinhood Chain.";
    const facts = {
      ticker: token.ticker,
      name: token.name,
      contract: token.contract,
      chainlink_price_usd: oracle?.price_usd ?? null,
      chainlink_updated_at: oracle?.updated_at ?? null,
      dex_price_usd: primaryPool?.price_usd ?? null,
      dex_change_24h_pct: primaryPool?.change_24h ?? null,
      dex_change_1h_pct: primaryPool?.change_1h ?? null,
      dex_volume_24h_usd: primaryPool?.volume_24h_usd ?? null,
      // Anchored-only aggregate depth, matching #227 upstream. `pool_tvl_usd`
      // is just this one pool; `dex_tvl_usd` keeps its old name and meaning of
      // "the pool we quoted from" so existing readers don't silently shift.
      dex_tvl_usd: primaryPool?.reserve_usd ?? null,
      dex_anchored_tvl_usd_all_pools: primary.total_tvl_usd,
      dex_unanchored_tvl_usd_excluded: primary.unanchored_tvl_usd,
      pool_ref: primaryPool?.pool_ref ?? null,
      pool_address: primaryPool?.address ?? null,
      pool_dex: primaryPool?.dex ?? null,
      pool_selection: primary.selection,
      pool_count: primary.pool_count,
      anchored_pool_count: primary.anchored_pool_count,
      dex_price_unavailable_reason,
    };

    // ── LLM synthesis (Virtuals, NO web search) ──────────────────────────
    // This block was headed "Venice web-search + LLM synthesis" and the prompt
    // below ordered the model to "Use web search to gather recent news headlines"
    // and return "source URLs in parentheses". There is no search: callLLM is
    // Virtuals-only and documents `webSearch` as an ignored param. So every
    // headline and every URL in the News section of this PAID report was model
    // recall presented as sourced reporting. The prompt now states the absence
    // and forbids the URLs, instead of a warning further down trying to walk it
    // back after the fact.
    const system = `You are Blue Agent — a research analyst for on-chain tokenized equities on Robinhood Chain.

${NO_FABRICATION_RULE}

You will be given a "FACTS" block of verified on-chain numbers. Do NOT contradict them or invent new numbers.
If a field is null, it is UNKNOWN — say so plainly. Never substitute a remembered, typical, or real-world
value for a null, and never estimate one from the other fields. When \`dex_price_unavailable_reason\` is
non-null, quote that reason in the On-chain observation section instead of reporting a DEX price.

You have NO web access on this call and cannot look anything up. Do not cite URLs — you cannot open one.

Return concise Markdown with these sections:
1. **Snapshot** — 2-3 lines: current price, 24h Δ, DEX pool depth, one plain-English takeaway.
2. **Background on ${token.ticker} (${token.name})** — 2-4 bullets of durable context about the underlying
   company from your own knowledge, each prefixed "[from training data, not verified]". Say plainly that you
   cannot see news from the last ${horizon}. Omit this section entirely rather than guess at recent events.
3. **On-chain observation** — 1-2 lines interpreting the DEX data vs Chainlink oracle. Note if DEX is thin.
4. **Not investment advice** — one-line disclaimer.

Label anything not taken from the FACTS block as "[estimate]".
Do NOT recommend buy/sell — this is a brief, not a signal.`;

    const userPrompt = `FACTS:\n${JSON.stringify(facts, null, 2)}\n\nProduce the brief.`;

    let markdown = "";
    let llm_provider: string | null = null;
    let llm_web_search_used = false;
    let llm_duration_ms: number | null = null;
    let llm_attempts: unknown[] = [];
    let llm_error: string | null = null;
    try {
      // Virtuals, and only Virtuals. This said "Virtuals → Venice (may add web
      // search) → Bankr (last resort)"; that chain was stripped 2026-07-25 and
      // callLLM now throws LLM_UNAVAILABLE instead of trying a second vendor.
      // `webSearch: true` was also passed here and is an explicitly ignored
      // param — dropped, because passing it implied a capability we don't have.
      // Every attempt is still logged with provider/status/duration.
      const r = await callLLM({
        system,
        user: userPrompt,
        temperature: 0.3,
        maxTokens: 900,
      });
      markdown = r.text;
      llm_provider = r.provider;
      llm_web_search_used = r.web_search_used;
      llm_duration_ms = r.duration_ms;
      llm_attempts = r.attempts;
    } catch (e) {
      llm_error = (e as Error).message;
      llm_attempts = ((e as Error & { attempts?: unknown[] }).attempts) ?? [];
      console.warn("[rh-stock-report] all LLM providers unavailable:", llm_error);
      markdown = `# ${token.ticker} — data-only report\n\n_LLM synthesis unavailable this run. Real on-chain numbers below are unaffected._`;
    }

    return Response.json({
      tool: "rh-stock-report",
      ticker: token.ticker,
      name: token.name,
      contract: token.contract,
      facts,
      report_markdown: markdown,
      llm: {
        provider: llm_provider,
        web_search_used: llm_web_search_used,
        duration_ms: llm_duration_ms,
        attempts: llm_attempts,
      },
      warnings: [
        llm_error ? "llm_synthesis_unavailable: the inference gateway returned an error; report degraded to data-only" : null,
        // Unconditional once the LLM answers — Virtuals has no search at all, so
        // this is a property of the gateway, not of a particular run. It said
        // "no_web_search_this_run" while the prompt was still ordering the model
        // to search and cite URLs.
        llm_provider !== null && !llm_web_search_used ? `no_web_search: ${llm_provider} has no web-search capability, so the report contains no news and no citations — only on-chain FACTS plus background the model is asked to label as unverified` : null,
        dex_price_unavailable_reason ? `${primary.selection}: ${dex_price_unavailable_reason}` : null,
      ].filter((x): x is string => !!x),
      // Said "Virtuals (primary, sponsored) → Venice (web-search if reached) →
      // Bankr (fallback)" until 2026-09-18. There is no chain: callLLM is
      // Virtuals-only since 2026-07-25 and throws rather than falling back, so
      // the venice/bankr arms of the data_sources ternary below were dead code
      // describing vendors this request never touches.
      note: "Numbers in `facts` are verifiable on-chain (Chainlink + GT), and every `dex_*` figure comes from this token's dollar-anchored primary pool (#231) — never from a stock-vs-stock or stock-vs-memecoin pair. Synthesis: Virtuals only — no provider fallback and no web search, so the prose is model recall and the FACTS block is the sourced part. Every attempt logged with provider + status + duration.",
      data_sources: [
        "Chainlink AggregatorV3 (RH Chain)",
        "api.geckoterminal.com (RH Chain)",
        llm_provider === "virtuals" ? "Virtuals Compute (partner-sponsored, no web search)" : null,
      ].filter(Boolean),
      network: RH_CHAIN,
      timestamp,
    });
  } catch (e) {
    return Response.json({ error: "rh-stock-report failed", message: (e as Error).message }, { status: 500 });
  }
}
