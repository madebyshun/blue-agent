import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { extractJsonObject, runAeonSkill, runMiroSharkSkill, runBlueSkill } from "@/app/api/_lib/llm";
import { searchBaseToken, fetchBaseTopMovers, formatTokensForLLM } from "@/app/api/_lib/realdata";

export const runtime = "nodejs";
export const maxDuration = 120;

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/portfolio-rebalancer";

function extractTickers(text: string): string[] {
  const matches = text.toUpperCase().match(/\b([A-Z]{2,10})\b/g) ?? [];
  const skip = new Set(["ETH","USDC","USDT","BTC","CBBTC","WETH","AND","THE","FOR","WITH","HIGH","LOW"]);
  return [...new Set(matches.filter(m => !skip.has(m)))].slice(0, 6);
}

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const holdings = (body.holdings as string) ?? "";
  const goal     = (body.goal     as string) ?? "";
  if (!holdings) return NextResponse.json({ error: "holdings is required" }, { status: 400 });

  // Extract tickers from user input and fetch real prices
  const tickers = extractTickers(holdings);
  const [topMovers, ...tokenResults] = await Promise.all([
    fetchBaseTopMovers(15),
    ...tickers.map(t => searchBaseToken(t)),
  ]);

  const userTokenData = tokenResults.flat().filter(t => t.symbol);
  const realData = [
    `=== LIVE PRICE DATA (DexScreener, ${new Date().toISOString()}) ===`,
    `User portfolio tokens found on Base:\n${formatTokensForLLM(userTokenData)}`,
    `\nBase market context (top movers):\n${formatTokensForLLM(topMovers.slice(0, 8))}`,
    `\nUser holdings: ${holdings}`,
    `Goal: ${goal || "optimize risk/reward"}`,
  ].join("\n");

  const [moversRaw, narrativeRaw] = await Promise.all([
    runAeonSkill("token-movers", `Market conditions for portfolio rebalancing:\n${realData}`),
    runAeonSkill("narrative-tracker", `Which narratives support or undermine these holdings:\n${formatTokensForLLM(userTokenData)}`),
  ]);

  const msRaw = await runMiroSharkSkill({
    scenario: "Portfolio rebalancing recommendation based on real market data",
    context: { live_prices: formatTokensForLLM(userTokenData), market: formatTokensForLLM(topMovers.slice(0, 6)), holdings, goal },
    persona: "analyst — risk-adjusted portfolio strategy, not financial advice",
    outputSchema: `{"overall_assessment":"<honest assessment>","key_risk":"<specific concern based on real data>","opportunity":"<real data based>"}`,
    maxTokens: 400,
  });

  const signal = extractJsonObject(msRaw ?? "") ?? {};

  const verdictRaw = await runBlueSkill({
    task: `Generate portfolio rebalancing recommendations based on real Base market prices.
Use actual prices from data where available. Be honest when data is unavailable.
DISCLAIMER: This is analysis only, not financial advice.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "current_assessment": "<assessment based on real prices found>",
  "recommended_allocation": {"token":"<symbol>","current_pct":"<from user input>","suggested_pct":"<recommendation>","reason":"<real data based>"},
  "actions": [{"action":"reduce|add|hold","asset":"<real symbol>","reason":"<based on real price data>"}],
  "market_alignment": "<how portfolio aligns with current Base market>",
  "rationale": "<strategy rationale>",
  "disclaimer": "Not financial advice — portfolio decisions should be made with full context",
  "confidence": <0-100>
}`,
    skillFiles: ["base-ecosystem.md"],
    input: `${realData}\n\nAeon market:\n${moversRaw ?? ""}\n\nNarrative:\n${narrativeRaw ?? ""}\n\nAnalysis:\n${JSON.stringify(signal)}`,
    maxTokens: 900,
  });

  const verdict = extractJsonObject(verdictRaw ?? "");
  if (!verdict) throw new Error("Failed to parse verdict");

  return NextResponse.json({
    tool: "portfolio-rebalancer", timestamp: new Date().toISOString(),
    data_source: "DexScreener live — Base chain",
    tokens_with_live_data: userTokenData.length, ...verdict,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT, handleLocally);
}
