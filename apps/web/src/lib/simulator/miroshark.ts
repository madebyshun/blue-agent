import { callBankrLLM, extractJsonObject } from "@blue-agent/bankr";

export type MiroSharkResult = {
  status: "simulated" | "live";
  bull: number;
  bear: number;
  neutral: number;
  recommendation: "execute" | "alert_human" | "skip";
  sentiment_summary: string;
  personas?: {
    analyst:    { stance: string; weight: number; rationale: string };
    influencer: { stance: string; weight: number; rationale: string };
    retail:     { stance: string; weight: number; rationale: string };
    observer:   { stance: string; weight: number; rationale: string };
  };
};

export async function runMiroSharkSimulation(opts: {
  project: string;
  description: string;
  ticker: string;
  marketData?: Record<string, unknown>;
  aeonSignals?: string | null;
}): Promise<MiroSharkResult | null> {
  const { project, description, ticker, marketData, aeonSignals } = opts;

  const marketSection = marketData?.available
    ? `\nMarket data: price=$${marketData.priceUsd}, volume24h=$${marketData.volume24h}, liquidity=$${marketData.liquidityUsd}, priceChange24h=${marketData.priceChange24h}%`
    : "";

  const aeonSection = aeonSignals
    ? `\nAeon ecosystem signals:\n${aeonSignals}`
    : "";

  const systemPrompt = `You are MiroShark — a multi-persona crypto sentiment consensus engine.

You simulate 4 independent personas evaluating a Base ecosystem project:

1. **Analyst** (weight: 1.8) — data-driven, focuses on fundamentals, market metrics, and on-chain signals. Skeptical by default.
2. **Influencer** (weight: 2.8) — narrative-driven, focuses on virality, community size, social momentum, and meme potential. Optimistic bias.
3. **Retail** (weight: 1.0) — FOMO-driven, focuses on price action, ease of use, and entry points. High volatility in stance.
4. **Observer** (weight: 0.5) — neutral recorder, synthesizes what others say, no strong bias.

Each persona independently evaluates the project and gives a stance: "bull", "bear", or "neutral".

Final consensus is weighted average:
- bull% = sum of (weight × 1 if bull else 0) / total_weight × 100
- bear% = sum of (weight × 1 if bear else 0) / total_weight × 100
- neutral% = remaining to reach 100

Recommendation rules:
- bull >= 55 → "execute"
- bear >= 55 → "skip"
- else → "alert_human"

CRITICAL: Return ONLY raw JSON. No markdown. No backticks. Start with { end with }.

JSON schema:
{
  "personas": {
    "analyst":    { "stance": "bull|bear|neutral", "weight": 1.8, "rationale": "<1 sentence>" },
    "influencer": { "stance": "bull|bear|neutral", "weight": 2.8, "rationale": "<1 sentence>" },
    "retail":     { "stance": "bull|bear|neutral", "weight": 1.0, "rationale": "<1 sentence>" },
    "observer":   { "stance": "bull|bear|neutral", "weight": 0.5, "rationale": "<1 sentence>" }
  },
  "bull": <0-100>,
  "bear": <0-100>,
  "neutral": <0-100>,
  "recommendation": "execute|alert_human|skip",
  "sentiment_summary": "<1 sentence aggregate sentiment>"
}

Rules:
- bull + bear + neutral must sum to exactly 100
- Weights must match exactly: analyst=1.8, influencer=2.8, retail=1.0, observer=0.5
- Be Base-ecosystem-aware: consider on-chain activity, Base TVL trends, builder momentum`;

  const userPrompt = `Run MiroShark consensus simulation for:
Project: ${project}
Ticker: ${ticker || "TBD"}
Description: ${description}${marketSection}${aeonSection}

Simulate all 4 personas and return consensus.`;

  try {
    const raw = await callBankrLLM({
      model: "claude-haiku-4-5",
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0.5,
      maxTokens: 800,
    });

    const result = extractJsonObject(raw) as MiroSharkResult | null;
    if (!result) return null;

    const bull = Math.round(result.bull ?? 0);
    const bear = Math.round(result.bear ?? 0);
    const neutral = 100 - bull - bear;
    return { ...result, bull, bear, neutral: Math.max(0, neutral), status: "simulated" };
  } catch (e) {
    console.error("[MiroShark] error:", e);
    return null;
  }
}
