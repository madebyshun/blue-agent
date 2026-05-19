import { callBankrLLM, extractJsonObject } from "./bankr";
import { fetchAeonEcosystemData } from "./aeon";
import { runMiroSharkSimulation } from "./miroshark";

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

export async function runSimulation(opts: {
  project: string;
  description: string;
  ticker: string;
  contract: string;
  tier: number;
}): Promise<Record<string, unknown>> {
  const { project, description, ticker, tier } = opts;
  const contract = opts.contract ?? "";

  let marketData: Record<string, unknown> = { available: false };
  if (tier >= 2 && contract) {
    marketData = await fetchDexScreener(contract);
  }

  const [aeonEcosystem, miroSharkResult] = await Promise.all([
    fetchAeonEcosystemData(ticker),
    runMiroSharkSimulation({ project, description, ticker, marketData }),
  ]);

  const aeonLive = aeonEcosystem.available;
  const aeonData = aeonLive ? aeonEcosystem.summary : null;

  const tierContext = tier === 1
    ? "Quick Signal analysis — baseline ecosystem read."
    : tier === 2
    ? "Deep Signal analysis — include market data in your assessment."
    : "Full Simulation — complete multi-agent intelligence report with detailed risk matrix and timeline.";

  const marketSection = marketData.available
    ? `\n=== Live Market Data (DexScreener/Base) ===\n${JSON.stringify(marketData, null, 2)}`
    : tier >= 2 ? "\n=== Market Data === Not yet trading (pre-launch)" : "";

  const aeonSection = aeonLive
    ? `\n=== Aeon Ecosystem Signals (LIVE) ===\n${aeonData}`
    : "";

  const miroSharkSection = miroSharkResult
    ? `\n=== MiroShark Consensus (SIMULATED) ===\nbull=${miroSharkResult.bull}% bear=${miroSharkResult.bear}% neutral=${miroSharkResult.neutral}%\nrecommendation=${miroSharkResult.recommendation}\nsentiment=${miroSharkResult.sentiment_summary}`
    : "";

  const systemPrompt = `You are Blue Agent — the AI-native founder console for Base builders.
You run the Launch Simulator. MiroShark and Aeon have already run — their results are in the user message.
Your job: provide Blue Agent analysis and compute final_verdict as weighted consensus of all 3 agents.

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
    "status": "live or simulated",
    "ecosystem_health": "strong | neutral | weak",
    "timing_score": <0-10>,
    "narrative_fit": "<1 sentence>",
    "signals": ["<signal 1>", "<signal 2>", "<signal 3>"]
  },
  "miroshark": {
    "status": "simulated",
    "bull": <copy from input>,
    "bear": <copy from input>,
    "neutral": <copy from input>,
    "recommendation": "<copy from input>",
    "sentiment_summary": "<copy from input>"
  },
  "final_verdict": "LAUNCH | WAIT | ABORT",
  "confidence": <0-100>,
  "action_items": ["item 1", "item 2", "item 3"]${tier >= 3 ? `,
  "risk_matrix": {
    "market_timing": <0-10>,
    "community_readiness": <0-10>,
    "ecosystem_fit": <0-10>,
    "technical_readiness": <0-10>,
    "narrative_strength": <0-10>
  },
  "timeline_recommendation": "<launch now OR wait X weeks OR abort with reason>"` : ""}
}

Rules:
- Copy miroshark bull/bear/neutral/recommendation/sentiment_summary EXACTLY from the input — do not change them
- ${aeonLive ? "aeon signals MUST be derived from the real Aeon data provided" : "aeon signals must be specific to Base ecosystem state"}
- final_verdict must reflect weighted consensus of all 3 agents
- Be direct, builder-first, no filler`;

  const userPrompt = `Analyze pre-launch intelligence for:
Project: ${project}
Ticker: ${ticker || "TBD"}
Description: ${description}
${marketSection}${aeonSection}${miroSharkSection}

Provide Blue Agent analysis and final verdict.`;

  const llmOpts = {
    model: "claude-haiku-4-5",
    system: systemPrompt,
    messages: [{ role: "user" as const, content: userPrompt }],
    temperature: 0.4,
    maxTokens: tier >= 3 ? 2500 : tier === 2 ? 1800 : 1400,
  };

  let result: Record<string, unknown> | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw = await callBankrLLM({ ...llmOpts, temperature: attempt > 0 ? 0.1 : 0.4 });
      result = extractJsonObject(raw) as Record<string, unknown>;
      if (result && result.final_verdict) break;
    } catch (e) {
      if (attempt === 2) throw e;
    }
  }
  if (!result) throw new Error("Failed to parse simulation result after 3 attempts");

  if (miroSharkResult && result.miroshark && typeof result.miroshark === "object") {
    const ms = result.miroshark as Record<string, unknown>;
    ms.bull = miroSharkResult.bull;
    ms.bear = miroSharkResult.bear;
    ms.neutral = miroSharkResult.neutral;
    ms.recommendation = miroSharkResult.recommendation;
    ms.sentiment_summary = miroSharkResult.sentiment_summary;
    ms.status = "simulated";
    if (miroSharkResult.personas) ms.personas = miroSharkResult.personas;
  }

  if (result.aeon && typeof result.aeon === "object") {
    (result.aeon as Record<string, unknown>).status = aeonLive ? "live" : "simulated";
  }

  return {
    tier,
    project,
    ticker: ticker || null,
    contract: contract || null,
    timestamp: new Date().toISOString(),
    ...(tier >= 2 && { market_data: marketData }),
    ...result,
  };
}
