import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { extractJsonObject, runAeonSkill, runMiroSharkSkill, runBlueSkill } from "@/app/api/_lib/llm";
import { fetchBaseTopMovers, formatTokensForLLM } from "@/app/api/_lib/realdata";
import { getAeonOutput, formatAeonForLLM } from "@/app/api/_lib/aeon-kv";

export const runtime = "nodejs";
export const maxDuration = 120;

const ENDPOINT = "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/narrative-position";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const focus = (body.focus as string) ?? "";

  // Real live data from DexScreener + real Aeon from KV
  const [topMovers, realAeonNarrative, realAeonMovers] = await Promise.all([
    fetchBaseTopMovers(20),
    getAeonOutput("narrative-tracker"),
    getAeonOutput("token-movers"),
  ]);
  const realData  = `=== LIVE BASE TOKEN DATA (DexScreener, ${new Date().toISOString()}) ===\n${formatTokensForLLM(topMovers)}`;
  const dataSource = realAeonNarrative ? "DexScreener live + Real Aeon (KV)" : "DexScreener live";

  const [narrativeRaw, moversRaw] = await Promise.all([
    realAeonNarrative
      ? Promise.resolve(formatAeonForLLM(realAeonNarrative))
      : runAeonSkill("narrative-tracker",
          `Identify real narratives from this live Base market data. What themes/categories do these tokens represent?\n${realData}\n${focus ? `Focus on: ${focus}` : ""}`),
    realAeonMovers
      ? Promise.resolve(formatAeonForLLM(realAeonMovers))
      : runAeonSkill("token-movers",
          `Which narrative categories do these real Base tokens belong to?\n${formatTokensForLLM(topMovers.slice(0, 12))}`),
  ]);

  const msRaw = await runMiroSharkSkill({
    scenario: "Which Base narratives are CT actually positioning in right now based on real token data?",
    context: { live_data: realData.slice(0, 500), aeon_narratives: narrativeRaw ?? "", focus: focus || "Base ecosystem" },
    persona: "4-persona consensus — Analyst(1.8x), Influencer(2.8x), Retail(1.0x), Observer(0.5x)",
    outputSchema: `{"building":[{"narrative":"<name>","signal":"<real evidence>","tokens":["<real symbol>"]}],"peaking":[{"narrative":"<name>","signal":"<why>"}],"fading":[{"narrative":"<name>","signal":"<why>"}],"best_position":"<specific>","avoid":"<specific>"}`,
    maxTokens: 700,
  });

  const narrativeMap = extractJsonObject(msRaw ?? "") ?? {};

  const verdictRaw = await runBlueSkill({
    task: `Synthesize real Base market data into narrative positioning. Only cite narratives with evidence from the provided data.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "top_narratives": [{"name":"<narrative>","momentum":"building|peaking|fading","position":"early|mid|late","evidence":"<real token examples>"}],
  "best_position": "<narrative to enter now + reason>",
  "avoid": "<narrative losing steam + reason>",
  "timeframe": "<how long this is valid>",
  "confidence": <0-100>
}`,
    skillFiles: ["base-ecosystem.md"],
    input: `${realData}\n\nAeon narratives:\n${narrativeRaw ?? ""}\n\nAeon movers:\n${moversRaw ?? ""}\n\nMiroShark:\n${JSON.stringify(narrativeMap)}`,
    maxTokens: 800,
  });

  const verdict = extractJsonObject(verdictRaw ?? "");
  if (!verdict) return NextResponse.json({ error: "LLM service temporarily unavailable", tool: "analysis", timestamp: new Date().toISOString() }, { status: 503 });

  return NextResponse.json({
    tool: "narrative-position", timestamp: new Date().toISOString(),
    data_source: dataSource,
    tokens_analyzed: topMovers.length, ...verdict,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT, handleLocally);
}
