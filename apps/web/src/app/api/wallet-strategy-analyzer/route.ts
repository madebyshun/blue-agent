import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { extractJsonObject, runAeonSkill, runMiroSharkSkill, runBlueSkill } from "@/app/api/_lib/llm";
import { fetchBaseTopMovers, formatTokensForLLM } from "@/app/api/_lib/realdata";

export const runtime = "nodejs";
export const maxDuration = 120;

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/wallet-strategy-analyzer";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const address = (body.address as string) ?? "";
  const focus   = (body.focus   as string) ?? "";
  if (!address) return NextResponse.json({ error: "wallet address is required" }, { status: 400 });

  // Fetch real Base market context
  // Note: reading actual wallet tx requires Alchemy/BaseScan API key — not available here
  // We provide real market context and honest analysis framework instead
  const topMovers = await fetchBaseTopMovers(15);

  const realData = [
    `=== LIVE BASE MARKET CONTEXT (DexScreener, ${new Date().toISOString()}) ===`,
    `Wallet to analyze: ${address}`,
    focus ? `Analysis focus: ${focus}` : "",
    `\nCurrent Base market (for strategy contextualization):\n${formatTokensForLLM(topMovers.slice(0, 12))}`,
    `\nDATA NOTE: Actual wallet transaction history requires BaseScan/Alchemy API.`,
    `Analysis will be based on the wallet address pattern + current market context.`,
    `For full onchain analysis, check: https://basescan.org/address/${address}`,
  ].filter(Boolean).join("\n");

  const [moversRaw, narrativeRaw] = await Promise.all([
    runAeonSkill("token-movers", `Market context for wallet strategy analysis on Base:\n${formatTokensForLLM(topMovers.slice(0, 10))}`),
    runAeonSkill("narrative-tracker", `Which Base narratives would a sophisticated wallet be positioning in right now?`),
  ]);

  const msRaw = await runMiroSharkSkill({
    scenario: `Wallet strategy analysis for ${address.slice(0, 8)}...${address.slice(-6)} on Base`,
    context: { address, focus: focus || "general strategy", market_context: formatTokensForLLM(topMovers.slice(0, 6)) },
    persona: "analyst — pattern recognition, smart money behavior analysis",
    outputSchema: `{"likely_strategy":"<educated analysis>","market_alignment":"<vs current Base market>","recommendation":"<based on market context>"}`,
    maxTokens: 400,
  });

  const signal = extractJsonObject(msRaw ?? "") ?? {};

  const verdictRaw = await runBlueSkill({
    task: `Analyze wallet strategy on Base. Be completely honest about data limitations.
You do NOT have access to actual transaction history — say so clearly.
Provide framework analysis based on wallet address + current market context.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "wallet": "<address>",
  "data_available": false,
  "onchain_data_note": "Full transaction analysis requires BaseScan API — check basescan.org/address/<address>",
  "market_context_analysis": "<what smart money likely does in current Base conditions>",
  "strategy_frameworks": ["<general framework applicable to current market>"],
  "current_base_opportunities": ["<real opportunity from live data>"],
  "recommended_focus": "<based on real market conditions>",
  "basescan_link": "https://basescan.org/address/<address>",
  "confidence": <0-100>
}`,
    skillFiles: ["base-ecosystem.md", "base-addresses.md"],
    input: `${realData}\n\nAeon market:\n${moversRaw ?? ""}\n\nNarrative:\n${narrativeRaw ?? ""}\n\nSignal:\n${JSON.stringify(signal)}`,
    maxTokens: 900,
  });

  const verdict = extractJsonObject(verdictRaw ?? "");
  if (!verdict) return NextResponse.json({ error: "LLM service temporarily unavailable", tool: "analysis", timestamp: new Date().toISOString() }, { status: 503 });

  // Always inject honest data note
  (verdict as Record<string,unknown>).data_available = false;
  (verdict as Record<string,unknown>).basescan_link = `https://basescan.org/address/${address}`;
  (verdict as Record<string,unknown>).onchain_data_note = `Full transaction history not available without BaseScan API. View real data at basescan.org/address/${address}`;

  return NextResponse.json({
    tool: "wallet-strategy-analyzer", timestamp: new Date().toISOString(),
    data_source: "DexScreener market context + LLM analysis (no onchain tx data)",
    ...verdict,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT, handleLocally);
}
