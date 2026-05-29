import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { extractJsonObject, runAeonSkill, runMiroSharkSkill, runBlueSkill } from "@/app/api/_lib/llm";
import { fetchBaseTopMovers, searchBaseToken, formatTokensForLLM } from "@/app/api/_lib/realdata";

export const runtime = "nodejs";
export const maxDuration = 120;

const ENDPOINT = "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/whale-copy-signal";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const wallet = (body.wallet as string) ?? "";
  const token  = (body.token  as string) ?? "";

  // Fetch real market context
  const [topMovers, tokenData] = await Promise.all([
    fetchBaseTopMovers(20),
    token ? searchBaseToken(token) : Promise.resolve([]),
  ]);

  const realData = [
    `=== LIVE BASE MARKET DATA (DexScreener, ${new Date().toISOString()}) ===`,
    `Top Base tokens by volume:\n${formatTokensForLLM(topMovers.slice(0, 12))}`,
    tokenData.length ? `\nSpecific token data for "${token}":\n${formatTokensForLLM(tokenData)}` : "",
    wallet ? `\nWallet to analyze: ${wallet}` : "\nNo specific wallet — analyzing top Base market movers",
  ].filter(Boolean).join("\n");

  const [moversRaw, narrativeRaw] = await Promise.all([
    runAeonSkill("token-movers", `Real Base market data for whale copy analysis:\n${realData}`),
    runAeonSkill("narrative-tracker", `What narratives are driving these real Base token moves?\n${formatTokensForLLM(topMovers.slice(0, 10))}`),
  ]);

  const msRaw = await runMiroSharkSkill({
    scenario: "Whale copy trading signal based on real Base market data",
    context: { live_data: realData.slice(0, 500), aeon_analysis: moversRaw ?? "", wallet: wallet || "top Base whales" },
    persona: "analyst — evaluates smart money patterns and risk-adjusted entries",
    outputSchema: `{"copy_signal":"strong|moderate|weak","best_entry_token":"<real symbol>","entry_reasoning":"<based on real data>","risk_level":"high|medium|low","timing":"<specific advice>"}`,
    maxTokens: 500,
  });

  const copySignal = extractJsonObject(msRaw ?? "") ?? {};

  const verdictRaw = await runBlueSkill({
    task: `Generate whale copy trading signals based on real Base market data. Only reference real tokens from the data.
Note: Onchain wallet analysis requires a blockchain explorer — base signal on real market data patterns.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "signal": "copy|watch|avoid",
  "wallet_note": "<note about wallet analysis limitations if no explorer access>",
  "best_copy_opportunity": {"token":"<real symbol>","thesis":"<based on real data>","entry":"<price range from real data>","sizing":"small|medium|large"},
  "market_context": "<real market condition from data>",
  "risk_flags": ["<real risk based on data>"],
  "confidence": <0-100>,
  "note": "<honest caveat about data limitations>"
}`,
    skillFiles: ["base-ecosystem.md", "base-addresses.md"],
    input: `${realData}\n\nAeon:\n${moversRaw ?? ""}\n\nNarrative:\n${narrativeRaw ?? ""}\n\nCopy signal:\n${JSON.stringify(copySignal)}`,
    maxTokens: 800,
  });

  const verdict = extractJsonObject(verdictRaw ?? "");
  if (!verdict) return NextResponse.json({ error: "LLM service temporarily unavailable", tool: "analysis", timestamp: new Date().toISOString() }, { status: 503 });

  return NextResponse.json({
    tool: "whale-copy-signal", timestamp: new Date().toISOString(),
    data_source: "DexScreener live — Base chain",
    tokens_analyzed: topMovers.length, ...verdict,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT, handleLocally);
}
