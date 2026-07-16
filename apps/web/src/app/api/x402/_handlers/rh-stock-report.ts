// x402/rh-stock-report (A3) — on-chain vol + real-world news brief.
// Price: $0.20
//
// Composes:
//   • Chainlink oracle price + 24h DEX change (L1 / M1 / M4 data)
//   • Top DEX pool + TVL / volume
//   • Venice web-search for real-world news headlines about the underlying
//     equity, tagged with source citations
// Then asks the LLM to synthesize a brief report. All numbers come from
// tools; the LLM interprets, doesn't invent. Temperature 0.3.
//
// The prompt makes the LLM label news items as `[estimate]` or with source
// URLs, per CLAUDE.md's data-vs-advisory rule.

import { findByTicker, RH_CHAIN } from "@/lib/robinhood/rwa-registry";
import { chainlinkLatest } from "@/lib/robinhood/rwa-price";
import { poolsForToken } from "@/lib/robinhood/rwa-market";
import { callVeniceLLM, NO_FABRICATION_RULE } from "@/app/api/_lib/llm";

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
      chainlink_updated_at: oracle?.updated_at ?? null,
      dex_price_usd: deepestPool?.price_usd ?? null,
      dex_change_24h_pct: deepestPool?.change_24h ?? null,
      dex_change_1h_pct: deepestPool?.change_1h ?? null,
      dex_volume_24h_usd: deepestPool?.volume_24h_usd ?? null,
      dex_tvl_usd: deepestPool?.reserve_usd ?? null,
      pool_address: deepestPool?.address ?? null,
      pool_dex: deepestPool?.dex ?? null,
    };

    // ── Venice web-search + LLM synthesis ────────────────────────────────
    const system = `You are Blue Agent — a research analyst for on-chain tokenized equities on Robinhood Chain.

${NO_FABRICATION_RULE}

You will be given a "FACTS" block of verified on-chain numbers. Do NOT contradict them or invent new numbers.
Use web search to gather recent (last ${horizon}) news headlines about the underlying equity ${token.ticker} (${token.name}).

Return concise Markdown with these sections:
1. **Snapshot** — 2-3 lines: current price, 24h Δ, DEX pool depth, one plain-English takeaway.
2. **News (last ${horizon})** — 3-5 bullet headlines with source URLs in parentheses. Skip if no relevant results.
3. **On-chain observation** — 1-2 lines interpreting the DEX data vs Chainlink oracle. Note if DEX is thin.
4. **Not investment advice** — one-line disclaimer.

Label anything you cannot verify with a source as "[estimate]".
Do NOT recommend buy/sell — this is a brief, not a signal.`;

    const userPrompt = `FACTS:\n${JSON.stringify(facts, null, 2)}\n\nProduce the brief.`;

    let markdown = "";
    let llm_error: string | null = null;
    try {
      markdown = await callVeniceLLM({
        system,
        user: userPrompt,
        temperature: 0.3,
        maxTokens: 900,
        webSearch: true,
      });
    } catch (e) {
      // Reviewer flag: don't leak upstream 401/500 messages into
      // client-facing markdown. Log server-side, degrade cleanly.
      llm_error = (e as Error).message;
      console.warn("[rh-stock-report] LLM synthesis unavailable:", llm_error);
      markdown = `# ${token.ticker} — data-only report\n\n_LLM synthesis unavailable this run. Real on-chain numbers are in the \`facts\` object below and are unaffected._`;
    }

    return Response.json({
      tool: "rh-stock-report",
      ticker: token.ticker,
      name: token.name,
      contract: token.contract,
      facts,
      report_markdown: markdown,
      note: "Numbers in `facts` are verifiable on-chain (Chainlink + GT). News + interpretation is Venice web-search-grounded — LLM must cite URLs and mark unverified items [estimate].",
      data_sources: ["Chainlink AggregatorV3 (RH Chain)", "api.geckoterminal.com (RH Chain)", "Venice web search"],
      network: RH_CHAIN,
      timestamp,
    });
  } catch (e) {
    return Response.json({ error: "rh-stock-report failed", message: (e as Error).message }, { status: 500 });
  }
}
