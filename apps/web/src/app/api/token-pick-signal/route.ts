import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { extractJsonObject, runAeonSkill, runMiroSharkSkill, runBlueSkill } from "@/app/api/_lib/llm";
import { fetchBaseTopMovers, searchBaseToken, formatTokensForLLM } from "@/app/api/_lib/realdata";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/token-pick-signal";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const chain   = (body.chain as string)   ?? "base";
  const context = (body.context as string) ?? "";

  // ── Step 1: Fetch real Base token data from DexScreener ──────────────────
  const [topMovers, contextTokens] = await Promise.all([
    fetchBaseTopMovers(20),
    context ? searchBaseToken(context) : Promise.resolve([]),
  ]);

  const realMarketData = [
    "=== LIVE BASE TOKEN DATA (DexScreener) ===",
    "Top movers by 24h volume:",
    formatTokensForLLM(topMovers),
    contextTokens.length ? `\nContext-relevant tokens:\n${formatTokensForLLM(contextTokens)}` : "",
  ].filter(Boolean).join("\n");

  // ── Step 2: Aeon — analyze real data for narrative + pick ────────────────
  const [moversRaw, narrativeRaw] = await Promise.all([
    runAeonSkill("token-movers", `Analyze this REAL live data from Base chain:\n${realMarketData}\n${context ? `Focus: ${context}` : ""}`),
    runAeonSkill("narrative-tracker", `Based on this real Base market data, identify dominant narratives:\n${formatTokensForLLM(topMovers.slice(0, 10))}`),
  ]);

  // ── Step 3: MiroShark — retail reaction to real pick ─────────────────────
  const msRaw = await runMiroSharkSkill({
    scenario: `Token pick evaluation using REAL live Base chain data`,
    context: {
      live_market_data: realMarketData.slice(0, 800),
      aeon_analysis:    moversRaw ?? "Base market active",
      narrative:        narrativeRaw ?? "Base ecosystem",
      user_focus:       context || "top Base tokens by volume",
    },
    persona: "retail — FOMO-driven, price action focused, easy onboarding",
    outputSchema: `{"stance":"bull|bear|neutral","bull":<0-100>,"bear":<0-100>,"neutral":<0-100>,"rationale":"<1-2 sentences based on real data>","entry_advice":"<1 sentence>","risk_warning":"<1 sentence>"}`,
    maxTokens: 500,
  });

  const retailConsensus = extractJsonObject(msRaw ?? "") ?? {
    stance: "neutral", bull: 40, bear: 30, neutral: 30,
    rationale: "Mixed signals on current Base market data",
    entry_advice: "Wait for confirmation", risk_warning: "High volatility",
  };

  // ── Step 4: Blue Agent — final verdict using real data ────────────────────
  const synthesisRaw = await runBlueSkill({
    task: `Analyze real live Base market data and give a final token pick verdict.
IMPORTANT: Base your analysis ONLY on the real data provided — do not invent token names, prices, or metrics not in the data.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "no_pick": <boolean>,
  "pick": {
    "token": "<real symbol from data or null>",
    "thesis": "<why this token based on real metrics>",
    "entry": "<price range from real data or null>",
    "kill_criterion": "<specific invalidation level>",
    "sizing": "small|medium|large|null",
    "horizon": "<hours/days/weeks>"
  },
  "near_misses": ["<token: reason from real data>"],
  "retail_consensus": {"bull":<0-100>,"bear":<0-100>,"neutral":<0-100>,"stance":"bull|bear|neutral"},
  "risk_flags": ["<flag based on real data>"],
  "blue_verdict": "BUY|WATCH|SKIP|NO_PICK",
  "confidence": <0-100>,
  "note": "<1 sentence grounded in real data>"
}`,
    skillFiles: ["base-ecosystem.md", "base-addresses.md"],
    input: `REAL LIVE DATA:\n${realMarketData}\n\nAeon analysis:\n${moversRaw ?? "unavailable"}\n\nAeon narrative:\n${narrativeRaw ?? "unavailable"}\n\nMiroShark retail:\n${JSON.stringify(retailConsensus)}`,
    maxTokens: 900,
  });

  const result = extractJsonObject(synthesisRaw ?? "");
  if (!result) throw new Error("Failed to parse synthesis");

  if (result.retail_consensus && typeof result.retail_consensus === "object") {
    const rc = result.retail_consensus as Record<string, unknown>;
    rc.bull    = (retailConsensus as Record<string, unknown>).bull    ?? rc.bull;
    rc.bear    = (retailConsensus as Record<string, unknown>).bear    ?? rc.bear;
    rc.neutral = (retailConsensus as Record<string, unknown>).neutral ?? rc.neutral;
  }

  return NextResponse.json({
    tool:       "token-pick-signal",
    timestamp:  new Date().toISOString(),
    data_source: "DexScreener live — Base chain",
    chain,
    tokens_analyzed: topMovers.length,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT, handleLocally);
}
