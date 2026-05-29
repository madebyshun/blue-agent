import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { extractJsonObject, runAeonSkill, runMiroSharkSkill, runBlueSkill } from "@/app/api/_lib/llm";
import { fetchBaseTopMovers, searchBaseToken, formatTokensForLLM } from "@/app/api/_lib/realdata";
import { getAeonOutput, formatAeonForLLM } from "@/app/api/_lib/aeon-kv";

export const runtime = "nodejs";
export const maxDuration = 120;

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/token-momentum-scanner";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const timeframe = (body.timeframe as string) ?? "24h";
  const filter    = (body.filter    as string) ?? "";

  const [topMovers, filtered, realAeonMovers] = await Promise.all([
    fetchBaseTopMovers(25),
    filter ? searchBaseToken(filter) : Promise.resolve([]),
    getAeonOutput("token-movers"),
  ]);

  const byChange = [...topMovers].sort((a, b) => Math.abs(b.priceChange24h) - Math.abs(a.priceChange24h));
  const gainers  = byChange.filter(t => t.priceChange24h > 0).slice(0, 8);
  const losers   = byChange.filter(t => t.priceChange24h < 0).slice(0, 5);

  const realData = [
    `=== LIVE BASE MOMENTUM DATA (DexScreener, ${new Date().toISOString()}) ===`,
    `Timeframe: ${timeframe} | Filter: ${filter || "none"}`,
    "\nTop gainers (24h):\n" + formatTokensForLLM(gainers),
    "\nTop losers (24h):\n" + formatTokensForLLM(losers),
    filtered.length ? `\nFilter-matched:\n${formatTokensForLLM(filtered)}` : "",
  ].filter(Boolean).join("\n");

  const dataSource = realAeonMovers ? "DexScreener live + Real Aeon (KV)" : "DexScreener live";

  const [aeonRaw, msRaw] = await Promise.all([
    realAeonMovers
      ? Promise.resolve(formatAeonForLLM(realAeonMovers))
      : runAeonSkill("token-movers", `Analyze REAL live Base momentum data:\n${realData}`),
    runMiroSharkSkill({
      scenario: "Which Base tokens will retail FOMO into based on real data?",
      context: { live_data: realData.slice(0, 600) },
      persona: "retail — FOMO-driven, chases volume spikes and green candles",
      outputSchema: `{"top_fomo_pick":"<real symbol>","fomo_reasoning":"<1 sentence>","avoid":"<real symbol>","avoid_reason":"<1 sentence>"}`,
      maxTokens: 400,
    }),
  ]);

  const retailSignal = extractJsonObject(msRaw ?? "") ?? {};

  const verdictRaw = await runBlueSkill({
    task: `Synthesize real Base momentum data. Only reference tokens in the provided data.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "market_condition": "risk-on|risk-off|neutral",
  "top_movers": [{"token":"<real symbol>","change_24h":"<real %>","volume":"<real $>","signal":"breakout|watch|fade","thesis":"<1 sentence>"}],
  "narrative_driving": "<what is actually moving Base right now>",
  "recommendation": "<specific actionable advice>",
  "confidence": <0-100>
}`,
    skillFiles: ["base-ecosystem.md"],
    input: `${realData}\n\nAeon:\n${aeonRaw ?? ""}\n\nRetail:\n${JSON.stringify(retailSignal)}`,
    maxTokens: 800,
  });

  const verdict = extractJsonObject(verdictRaw ?? "");
  if (!verdict) return NextResponse.json({ error: "LLM service temporarily unavailable", tool: "analysis", timestamp: new Date().toISOString() }, { status: 503 });

  return NextResponse.json({
    tool: "token-momentum-scanner", timestamp: new Date().toISOString(),
    data_source: dataSource, timeframe,
    tokens_scanned: topMovers.length, ...verdict,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT, handleLocally);
}
