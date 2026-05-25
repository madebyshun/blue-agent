import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/defi-opportunity";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const strategy = (body.strategy as string) ?? "yield";
  const risk_tolerance = (body.risk_tolerance as string) ?? "medium";

  const defiRaw = await runAeonSkill("defi-monitor", `Base chain DeFi: ${strategy} opportunities, risk_tolerance=${risk_tolerance}. Focus on Aerodrome, Uniswap v4, Aave, active yield farms.`);

  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark analyst persona — data-driven, risk-aware.
Evaluate these DeFi opportunities on Base.
CRITICAL: Return ONLY raw JSON.
Schema: {"top_opportunity":"<protocol/pool>","risk_level":"high|medium|low","confidence":<0-10>,"smart_money_signal":"accumulating|neutral|exiting","analyst_take":"<1-2 sentences>"}`,
    messages: [{ role: "user", content: `DeFi signals: ${defiRaw ?? "Base DeFi ecosystem"}\nStrategy: ${strategy}\nRisk tolerance: ${risk_tolerance}` }],
    temperature: 0.3,
    maxTokens: 500,
  });
  const analyst = extractJsonObject(msRaw) ?? {};

  const resultRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — DeFi opportunity scanner for Base.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "scan_score": <0-100>,
  "market_condition": "favorable|neutral|unfavorable",
  "opportunities": [
    {
      "protocol": "<name>",
      "type": "yield|lp|lending|farming|staking",
      "apy_range": "<e.g. 8-12%>",
      "risk": "high|medium|low",
      "entry": "<how to enter>",
      "watch_for": "<risk signal>"
    }
  ],
  "avoid_now": ["<protocol or strategy to avoid>"],
  "best_entry_timing": "<immediate|wait for X>",
  "summary": "<2 sentences>"
}`,
    messages: [{ role: "user", content: `Strategy: ${strategy}\nRisk: ${risk_tolerance}\nDeFi monitor: ${defiRaw ?? "Base DeFi"}\nAnalyst: ${JSON.stringify(analyst)}` }],
    temperature: 0.3,
    maxTokens: 1000,
  });

  const result = extractJsonObject(resultRaw);
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({
    tool: "defi-opportunity",
    timestamp: new Date().toISOString(),
    strategy,
    risk_tolerance,
    analyst,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT);
}
