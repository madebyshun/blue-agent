import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { extractJsonObject, runAeonSkill, runMiroSharkSkill, runBlueSkill } from "@/app/api/_lib/llm";
import { searchBaseToken, formatTokensForLLM } from "@/app/api/_lib/realdata";

export const runtime = "nodejs";
export const maxDuration = 120;

const ENDPOINT = "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/protocol-risk-monitor";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const protocol = (body.protocol as string) ?? "";
  const position = (body.position as string) ?? "";
  if (!protocol) return NextResponse.json({ error: "protocol is required" }, { status: 400 });

  // Fetch real token data for the protocol
  const protocolTokens = await searchBaseToken(protocol);
  const hasData = protocolTokens.length > 0;

  const realData = [
    `=== LIVE PROTOCOL DATA (DexScreener, ${new Date().toISOString()}) ===`,
    `Protocol: ${protocol}`,
    hasData
      ? `Real token data:\n${formatTokensForLLM(protocolTokens)}`
      : `No direct token match found on DexScreener for "${protocol}" — analysis based on general knowledge.`,
    position ? `User position: ${position}` : "",
    `\nDATA NOTE: DexScreener provides token/pair data. TVL and protocol-specific metrics require dedicated DeFi APIs (DeFi Llama, etc).`,
  ].filter(Boolean).join("\n");

  const [aeonRaw, narrativeRaw] = await Promise.all([
    runAeonSkill("token-movers", `Assess risk signals for ${protocol} on Base:\n${realData}`),
    runAeonSkill("narrative-tracker", `Is ${protocol} gaining or losing mindshare on Base? Real data:\n${realData}`),
  ]);

  const msRaw = await runMiroSharkSkill({
    scenario: `Risk assessment for ${protocol} position on Base`,
    context: { protocol, position: position || "general", live_data: realData.slice(0, 500) },
    persona: "analyst — conservative risk evaluation, DeFi security focus",
    outputSchema: `{"sentiment":"positive|neutral|negative","key_risk":"<specific concern>","exit_signal":"hold|reduce|exit","reasoning":"<based on available data>"}`,
    maxTokens: 400,
  });

  const riskSignal = extractJsonObject(msRaw ?? "") ?? {};

  const verdictRaw = await runBlueSkill({
    task: `Assess risk for a Base DeFi protocol position. Be honest about data limitations.
Do NOT fabricate TVL numbers, APY, or contract audit status not in the data.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "protocol": "<name>",
  "risk_score": <0-100>,
  "risk_level": "low|medium|high|critical",
  "token_health": ${hasData ? '{"price":"<real>","change_24h":"<real>","liquidity":"<real>","volume":"<real>"}' : '"data_unavailable"'},
  "risk_factors": ["<specific risk based on available data>"],
  "exit_signal": "hold|reduce|exit",
  "alerts": ["<only real alerts based on data>"],
  "recommendation": "<specific advice>",
  "data_limitations": "<honest note about what could not be verified>",
  "confidence": <0-100>
}`,
    skillFiles: ["base-ecosystem.md", "base-addresses.md"],
    input: `${realData}\n\nAeon risk:\n${aeonRaw ?? ""}\n\nNarrative:\n${narrativeRaw ?? ""}\n\nRisk signal:\n${JSON.stringify(riskSignal)}`,
    maxTokens: 900,
  });

  const verdict = extractJsonObject(verdictRaw ?? "");
  if (!verdict) return NextResponse.json({ error: "LLM service temporarily unavailable", tool: "analysis", timestamp: new Date().toISOString() }, { status: 503 });

  return NextResponse.json({
    tool: "protocol-risk-monitor", timestamp: new Date().toISOString(),
    data_source: hasData ? "DexScreener live — Base chain" : "LLM knowledge (no live token data found)",
    live_data_available: hasData, ...verdict,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT, handleLocally);
}
