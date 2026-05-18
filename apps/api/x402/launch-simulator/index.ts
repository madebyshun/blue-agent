// x402/launch-simulator/index.ts
// Launch Simulator — 3-agent pre-launch intelligence
// Tier 1: $0.10 · Tier 2: $0.35 · Tier 3: $0.50
// Blue Agent orchestrates Aeon (ecosystem signals) + MiroShark (consensus) + own LLM analysis

import { callBankrLLM, extractJsonObject } from "@blue-agent/bankr";

// ── Market data helpers ───────────────────────────────────────────────────────

async function fetchDexScreener(contract: string): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${contract}`,
      { signal: AbortSignal.timeout(6000) }
    );
    const data = await res.json() as { pairs?: Array<Record<string, unknown>> };
    const pairs = (data.pairs ?? []).filter((p) => (p as { chainId?: string }).chainId === "base");
    if (!pairs.length) return { available: false };
    const pair = pairs.sort((a, b) =>
      (((b as { liquidity?: { usd?: number } }).liquidity?.usd) ?? 0) -
      (((a as { liquidity?: { usd?: number } }).liquidity?.usd) ?? 0)
    )[0] as {
      baseToken?: { name?: string; symbol?: string };
      priceUsd?: string;
      volume?: { h24?: number };
      liquidity?: { usd?: number };
      priceChange?: { h24?: number };
      txns?: { h24?: { buys?: number; sells?: number } };
      fdv?: number;
      marketCap?: number;
      pairCreatedAt?: number;
    };
    return {
      available: true,
      name:           pair.baseToken?.name,
      symbol:         pair.baseToken?.symbol,
      priceUsd:       pair.priceUsd,
      volume24h:      pair.volume?.h24,
      liquidityUsd:   pair.liquidity?.usd,
      priceChange24h: pair.priceChange?.h24,
      buys24h:        pair.txns?.h24?.buys,
      sells24h:       pair.txns?.h24?.sells,
      fdv:            pair.fdv,
      marketCap:      pair.marketCap,
      pairAgeDays:    pair.pairCreatedAt
        ? Math.round((Date.now() - pair.pairCreatedAt) / 86400000)
        : null,
    };
  } catch {
    return { available: false };
  }
}

// ── LLM simulation ────────────────────────────────────────────────────────────

async function runSimulation(opts: {
  project: string;
  description: string;
  ticker: string;
  contract: string;
  tier: number;
  marketData: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const { project, description, ticker, tier, marketData } = opts;

  const tierContext = tier === 1
    ? "Quick Signal analysis — baseline ecosystem read."
    : tier === 2
    ? "Deep Signal analysis — include market data in your assessment."
    : "Full Simulation — complete multi-agent intelligence report with detailed risk matrix and timeline.";

  const marketSection = marketData.available
    ? `\n=== Live Market Data (DexScreener/Base) ===\n${JSON.stringify(marketData, null, 2)}`
    : tier >= 2 ? "\n=== Market Data === Not yet trading (pre-launch)" : "";

  const systemPrompt = `You are Blue Agent — the AI-native founder console for Base builders.
You run the Launch Simulator: a pre-launch intelligence tool that combines:
1. Blue Agent's own analysis
2. Aeon's ecosystem signal layer (GitHub Actions cron, 117 skills — SIMULATED until real integration)
3. MiroShark's Bull/Bear/Neutral community consensus simulator (async webhook — SIMULATED until real integration)

Tier context: ${tierContext}

CRITICAL: Return ONLY raw JSON. No markdown. No backticks. Start with { end with }.

JSON schema:
{
  "blue_agent": {
    "verdict": "LAUNCH | WAIT | ABORT",
    "score": <0-100>,
    "summary": "<2-3 sentences>",
    "strengths": ["..."],
    "risks": ["..."]
  },
  "aeon": {
    "status": "simulated",
    "ecosystem_health": "strong | neutral | weak",
    "timing_score": <0-10>,
    "narrative_fit": "<1 sentence — how well does this fit current Base narrative>",
    "signals": ["<signal 1>", "<signal 2>", "<signal 3>"]
  },
  "miroshark": {
    "status": "simulated",
    "bull": <0-100>,
    "bear": <0-100>,
    "neutral": <0-100>,
    "recommendation": "execute | alert_human | skip",
    "sentiment_summary": "<1 sentence>"
  },
  "final_verdict": "LAUNCH | WAIT | ABORT",
  "confidence": <0-100>,
  "action_items": ["<item 1>", "<item 2>", "<item 3>"]${tier >= 3 ? `,
  "risk_matrix": {
    "market_timing": <0-10>,
    "community_readiness": <0-10>,
    "ecosystem_fit": <0-10>,
    "technical_readiness": <0-10>,
    "narrative_strength": <0-10>
  },
  "timeline_recommendation": "<launch now | wait N weeks | abort — with reason>"` : ""}
}

Rules:
- bull + bear + neutral must sum to 100
- aeon signals must be specific to Base ecosystem state (TVL, narrative, recent launches)
- final_verdict must match the weighted consensus of all 3 agents
- Be direct, builder-first, no filler`;

  const userPrompt = `Simulate pre-launch intelligence for:
Project: ${project}
Ticker: ${ticker || "TBD"}
Description: ${description}
${marketSection}

Run all 3 agents and return the full simulation report.`;

  const raw = await callBankrLLM({
    model: tier >= 3 ? "claude-sonnet-4-6" : "claude-haiku-4-5",
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    temperature: 0.4,
    maxTokens: tier >= 3 ? 1600 : tier === 2 ? 1000 : 800,
  });

  return extractJsonObject(raw) as Record<string, unknown>;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: {
      project?: string;
      description?: string;
      ticker?: string;
      contract?: string;
      tier?: number;
    } = {};

    try {
      const text = await req.text();
      if (text?.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}

    const url = new URL(req.url);
    if (!body.project) {
      body.project     = url.searchParams.get("project")     ?? undefined;
      body.description = url.searchParams.get("description") ?? undefined;
      body.ticker      = url.searchParams.get("ticker")      ?? undefined;
      body.contract    = url.searchParams.get("contract")    ?? undefined;
      body.tier        = Number(url.searchParams.get("tier") ?? "1") || 1;
    }

    const { project, description = "", ticker = "", contract = "" } = body;
    const tier = Math.min(Math.max(Number(body.tier ?? 1), 1), 3);

    if (!project) {
      return Response.json({ error: "project is required" }, { status: 400 });
    }

    console.log(`[LaunchSimulator] tier=${tier} project=${project}`);

    // Fetch market data for tier 2+
    let marketData: Record<string, unknown> = { available: false };
    if (tier >= 2 && contract) {
      marketData = await fetchDexScreener(contract);
    }

    const simulation = await runSimulation({ project, description, ticker, contract, tier, marketData });

    return Response.json({
      tier,
      project,
      ticker: ticker || null,
      contract: contract || null,
      timestamp: new Date().toISOString(),
      ...(tier >= 2 && { market_data: marketData }),
      ...simulation,
    }, { status: 200 });
  } catch (error) {
    console.error("[LaunchSimulator] Error:", error);
    return Response.json(
      { error: "Launch simulation failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
