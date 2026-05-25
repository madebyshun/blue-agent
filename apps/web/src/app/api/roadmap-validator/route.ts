import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/roadmap-validator";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const project = (body.project as string) ?? "";
  const roadmap = (body.roadmap as string) ?? "";
  const timeline = (body.timeline as string) ?? "6 months";

  if (!project || !roadmap) {
    return NextResponse.json({ error: "project and roadmap are required" }, { status: 400 });
  }

  const [narrativeRaw, buildRaw] = await Promise.all([
    runAeonSkill("narrative-tracker", `relevance to: ${project}. Which narratives support or conflict with this roadmap?`),
    callBankrLLM({
      model: "claude-haiku-4-5",
      system: `You are Blue Agent running 'blue build'. Analyze this roadmap for technical feasibility on Base.
CRITICAL: Return ONLY raw JSON.
Schema: {"feasibility_score":<0-10>,"phases":[{"name":"<phase>","realistic":<boolean>,"concern":"<or null>"}],"missing":["<missing item>"],"dependency_risks":["<risk>"],"build_note":"<1 sentence>"}`,
      messages: [{ role: "user", content: `Project: ${project}\nRoadmap: ${roadmap}\nTimeline: ${timeline}` }],
      temperature: 0.3,
      maxTokens: 800,
    }),
  ]);

  const buildAnalysis = extractJsonObject(buildRaw) ?? {};

  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark — 4-persona consensus engine.
Personas: Analyst(1.8x), Influencer(2.8x), Retail(1.0x), Observer(0.5x).
Evaluate this roadmap's market timing and community reception.
CRITICAL: Return ONLY raw JSON.
Schema: {"personas":{"analyst":{"stance":"bull|bear|neutral","weight":1.8,"rationale":"<1 sentence>"},"influencer":{"stance":"bull|bear|neutral","weight":2.8,"rationale":"<1 sentence>"},"retail":{"stance":"bull|bear|neutral","weight":1.0,"rationale":"<1 sentence>"},"observer":{"stance":"bull|bear|neutral","weight":0.5,"rationale":"<1 sentence>"}},"bull":<0-100>,"bear":<0-100>,"neutral":<0-100>,"recommendation":"execute|alert_human|skip","sentiment_summary":"<1 sentence>"}`,
    messages: [{ role: "user", content: `Project: ${project}\nRoadmap: ${roadmap}\nEcosystem: ${narrativeRaw ?? "Base ecosystem"}` }],
    temperature: 0.5,
    maxTokens: 800,
  });
  const consensus = extractJsonObject(msRaw) ?? { bull: 45, bear: 25, neutral: 30, recommendation: "alert_human" };

  const verdictRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — roadmap validation engine.
CRITICAL: Return ONLY raw JSON.
Schema: {"verdict":"SHIP|REVISE|PIVOT","score":<0-100>,"narrative_alignment":{"score":<0-10>,"aligned":<boolean>,"note":"<1 sentence>"},"timeline_assessment":"realistic|aggressive|too_slow","consensus":{"bull":<0-100>,"bear":<0-100>,"neutral":<0-100>},"strengths":["<strength>"],"gaps":["<gap>"],"recommended_changes":["<change>"],"builder_note":"<1 sentence>"}`,
    messages: [{ role: "user", content: `Project: ${project}\nRoadmap: ${roadmap}\nBuild analysis: ${JSON.stringify(buildAnalysis)}\nNarratives: ${narrativeRaw ?? "Base ecosystem"}\nConsensus: ${JSON.stringify(consensus)}` }],
    temperature: 0.3,
    maxTokens: 1000,
  });

  const verdict = extractJsonObject(verdictRaw);
  if (!verdict) throw new Error("Failed to parse verdict");

  return NextResponse.json({
    tool: "roadmap-validator",
    timestamp: new Date().toISOString(),
    project,
    timeline,
    build_analysis: buildAnalysis,
    miroshark: consensus,
    ...verdict,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT);
}
