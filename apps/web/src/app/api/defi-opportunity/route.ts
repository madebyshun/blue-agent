import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { extractJsonObject, runAeonSkill, runMiroSharkSkill, runBlueSkill } from "@/app/api/_lib/llm";
import { fetchBaseTopMovers, searchBaseToken, formatTokensForLLM } from "@/app/api/_lib/realdata";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/defi-opportunity";

const DEFI_TOKENS = ["AERO", "WELL", "SEAM", "MORPHO", "cbETH"];

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const focus          = (body.focus          as string) ?? "";
  const risk_tolerance = (body.risk_tolerance as string) ?? "medium";

  const [topMovers, ...protocolResults] = await Promise.all([
    fetchBaseTopMovers(20),
    ...DEFI_TOKENS.map(t => searchBaseToken(t)),
  ]);

  const defiTokens = protocolResults.flat().filter(t => t.liquidity > 50_000);
  const focusTokens = focus ? await searchBaseToken(focus) : [];

  const realData = [
    `=== LIVE BASE DEFI DATA (DexScreener, ${new Date().toISOString()}) ===`,
    `Risk: ${risk_tolerance} | Focus: ${focus || "all Base DeFi"}`,
    `\nBase DeFi protocol tokens (by liquidity):\n${formatTokensForLLM(defiTokens.slice(0, 12))}`,
    focusTokens.length ? `\nFocus tokens:\n${formatTokensForLLM(focusTokens)}` : "",
    `\nBase top movers (market context):\n${formatTokensForLLM(topMovers.slice(0, 6))}`,
    `\nDATA NOTE: APY not available from DexScreener — volume and liquidity used as health proxies.`,
  ].filter(Boolean).join("\n");

  const [moversRaw, narrativeRaw] = await Promise.all([
    runAeonSkill("token-movers", `Find Base DeFi opportunities from real data:\n${realData}`),
    runAeonSkill("narrative-tracker", `Which Base DeFi protocols are gaining traction?\n${formatTokensForLLM(defiTokens.slice(0, 8))}`),
  ]);

  const msRaw = await runMiroSharkSkill({
    scenario: "Base DeFi opportunity scan based on real market data",
    context: { live_data: realData.slice(0, 600), risk_tolerance, aeon: moversRaw ?? "" },
    persona: "analyst — evaluates liquidity depth, volume consistency, protocol safety",
    outputSchema: `{"top_opportunity":"<real protocol>","reasoning":"<based on real metrics>","risk":"<honest assessment>","avoid":"<real concern>"}`,
    maxTokens: 400,
  });

  const signal = extractJsonObject(msRaw ?? "") ?? {};

  const verdictRaw = await runBlueSkill({
    task: `Identify real Base DeFi opportunities. Only reference protocols with data provided.
DO NOT fabricate APY — use volume and liquidity depth as proxies. Be honest about limitations.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "opportunities": [{"protocol":"<from data>","type":"LP|lending|staking","liquidity":"<real $>","volume_24h":"<real $>","signal":"accumulating|stable|declining","thesis":"<real data based>","risk":"low|medium|high"}],
  "market_condition": "<real Base DeFi condition>",
  "signal": "<overall signal>",
  "data_note": "<honest note about what data is available vs not>",
  "confidence": <0-100>
}`,
    skillFiles: ["base-ecosystem.md", "base-addresses.md"],
    input: `${realData}\n\nAeon:\n${moversRaw ?? ""}\n\nNarrative:\n${narrativeRaw ?? ""}\n\nSignal:\n${JSON.stringify(signal)}`,
    maxTokens: 900,
  });

  const verdict = extractJsonObject(verdictRaw ?? "");
  if (!verdict) throw new Error("Failed to parse verdict");

  return NextResponse.json({
    tool: "defi-opportunity", timestamp: new Date().toISOString(),
    data_source: "DexScreener live — Base chain",
    protocols_analyzed: defiTokens.length, ...verdict,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT, handleLocally);
}
