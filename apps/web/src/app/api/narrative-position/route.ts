import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { extractJsonObject, runAeonSkill, runMiroSharkSkill, runBlueSkill } from "@/app/api/_lib/llm";
import { fetchBaseTopMovers, formatTokensForLLM } from "@/app/api/_lib/realdata";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/narrative-position";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const focus = (body.focus as string) ?? "";

  // Real live data from DexScreener
  const topMovers = await fetchBaseTopMovers(20);
  const realData  = `=== LIVE BASE TOKEN DATA (DexScreener, ${new Date().toISOString()}) ===\n${formatTokensForLLM(topMovers)}`;

  const [narrativeRaw, moversRaw] = await Promise.all([
    runAeonSkill("narrative-tracker",
      `Identify real narratives from this live Base market data. What themes/categories do these tokens represent?\n${realData}\n${focus ? `Focus on: ${focus}` : ""}`),
    runAeonSkill("token-movers",
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
  if (!verdict) throw new Error("Failed to parse verdict");

  return NextResponse.json({
    tool: "narrative-position", timestamp: new Date().toISOString(),
    data_source: "DexScreener live — Base chain",
    tokens_analyzed: topMovers.length, ...verdict,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT, handleLocally);
}
