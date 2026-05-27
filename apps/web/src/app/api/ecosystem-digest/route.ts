import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { extractJsonObject, runAeonSkill, runMiroSharkSkill, runBlueSkill } from "@/app/api/_lib/llm";
import { fetchBaseTopMovers, formatTokensForLLM } from "@/app/api/_lib/realdata";
import { getAeonOutput, formatAeonForLLM } from "@/app/api/_lib/aeon-kv";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/ecosystem-digest";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const focus = (body.focus as string) ?? "";

  // Real live Base ecosystem data + real Aeon from KV
  const [topMovers, realAeonBrief, realAeonNarrative, realAeonPick] = await Promise.all([
    fetchBaseTopMovers(25),
    getAeonOutput("morning-brief"),
    getAeonOutput("narrative-tracker"),
    getAeonOutput("token-pick"),
  ]);
  const byVol     = [...topMovers].sort((a, b) => b.volume24h - a.volume24h).slice(0, 15);
  const byChange  = [...topMovers].sort((a, b) => b.priceChange24h - a.priceChange24h).slice(0, 8);

  const realData = [
    `=== LIVE BASE ECOSYSTEM DATA (DexScreener, ${new Date().toISOString()}) ===`,
    `\nTop tokens by volume:\n${formatTokensForLLM(byVol)}`,
    `\nTop gainers today:\n${formatTokensForLLM(byChange)}`,
    focus ? `\nFocus area: ${focus}` : "",
  ].filter(Boolean).join("\n");

  const hasAeon = !!(realAeonBrief || realAeonNarrative || realAeonPick);
  const dataSource = hasAeon ? "CoinGecko + DexScreener + Real Aeon (KV)" : "CoinGecko + DexScreener live";

  const [moversRaw, narrativeRaw] = await Promise.all([
    (realAeonBrief ?? realAeonPick)
      ? Promise.resolve(formatAeonForLLM(realAeonBrief ?? realAeonPick!))
      : runAeonSkill("token-movers", `Analyze this real Base ecosystem data for weekly digest:\n${realData}`),
    (realAeonNarrative ?? realAeonPick)
      ? Promise.resolve(formatAeonForLLM(realAeonNarrative ?? realAeonPick!))
      : runAeonSkill("narrative-tracker", `What narratives and trends does this real Base data show?\n${formatTokensForLLM(byVol.slice(0, 10))}\n${focus ? `Focus: ${focus}` : ""}`),
  ]);

  const msRaw = await runMiroSharkSkill({
    scenario: "Weekly Base ecosystem pulse — what are builders and traders actually doing?",
    context: { live_data: realData.slice(0, 600), aeon_analysis: moversRaw ?? "", focus: focus || "full ecosystem" },
    persona: "4-persona consensus — Analyst(1.8x), Influencer(2.8x), Retail(1.0x), Observer(0.5x)",
    outputSchema: `{"ecosystem_mood":"bullish|bearish|neutral","key_trend":"<1 sentence from real data>","builder_signal":"<what builders should know>","trader_signal":"<what traders should know>"}`,
    maxTokens: 500,
  });

  const pulse = extractJsonObject(msRaw ?? "") ?? {};

  const verdictRaw = await runBlueSkill({
    task: `Create a Base ecosystem digest grounded in real live market data. Do not fabricate protocols, TVL, or metrics not in the data.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "week": "<current month + year>",
  "ecosystem_health": "expanding|stable|contracting",
  "top_tokens_by_volume": [{"symbol":"<real>","volume_24h":"<real $>","narrative":"<category>"}],
  "top_gainers": [{"symbol":"<real>","change_24h":"<real %>","signal":"<why moving>"}],
  "dominant_narrative": "<what's actually driving Base right now>",
  "narrative_shifts": ["<real shift based on data>"],
  "signal": "<overall ecosystem signal in 1 sentence>",
  "confidence": <0-100>
}`,
    skillFiles: ["base-ecosystem.md"],
    input: `${realData}\n\nAeon movers:\n${moversRaw ?? ""}\n\nAeon narratives:\n${narrativeRaw ?? ""}\n\nMiroShark pulse:\n${JSON.stringify(pulse)}`,
    maxTokens: 1000,
  });

  const verdict = extractJsonObject(verdictRaw ?? "");
  if (!verdict) throw new Error("Failed to parse verdict");

  return NextResponse.json({
    tool: "ecosystem-digest", timestamp: new Date().toISOString(),
    data_source: dataSource,
    tokens_analyzed: topMovers.length, ...verdict,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT, handleLocally);
}
