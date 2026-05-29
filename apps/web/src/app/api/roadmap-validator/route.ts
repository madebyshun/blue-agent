import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { extractJsonObject, runAeonSkill, runMiroSharkSkill, runBlueSkill } from "@/app/api/_lib/llm";

export const runtime = "nodejs";
export const maxDuration = 120;

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/roadmap-validator";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const project = (body.project as string) ?? "";
  const roadmap = (body.roadmap as string) ?? "";
  const timeline = (body.timeline as string) ?? "6 months";

  if (!project || !roadmap) {
    return NextResponse.json({ error: "project and roadmap are required" }, { status: 400 });
  }

  // Step 1+2: Aeon parallel — narrative tracker + deep research on technical feasibility
  const [narrativeRaw, buildResearchRaw] = await Promise.all([
    runAeonSkill("narrative-tracker", `relevance to: ${project}. Which narratives support or conflict with this roadmap?`),
    runAeonSkill("deep-research", `Technical feasibility of this roadmap on Base: ${project} — ${roadmap}. Focus on realistic timelines, dependency risks, and what's missing.`),
  ]);

  // Step 3: MiroShark — 4-persona consensus on roadmap market timing and community reception
  const msRaw = await runMiroSharkSkill({
    scenario: `Evaluate this roadmap's market timing and community reception: ${project} — ${roadmap}`,
    context: {
      project,
      roadmap,
      timeline,
      narratives: narrativeRaw ?? "Base ecosystem",
      technical_context: buildResearchRaw ?? "Base ecosystem",
    },
    persona: "4-persona consensus — Analyst(1.8x), Influencer(2.8x), Retail(1.0x), Observer(0.5x)",
    outputSchema: `{"personas":{"analyst":{"stance":"bull|bear|neutral","weight":1.8,"rationale":"<1 sentence>"},"influencer":{"stance":"bull|bear|neutral","weight":2.8,"rationale":"<1 sentence>"},"retail":{"stance":"bull|bear|neutral","weight":1.0,"rationale":"<1 sentence>"},"observer":{"stance":"bull|bear|neutral","weight":0.5,"rationale":"<1 sentence>"}},"bull":<0-100>,"bear":<0-100>,"neutral":<0-100>,"recommendation":"execute|alert_human|skip","sentiment_summary":"<1 sentence>"}`,
    maxTokens: 800,
  });
  const consensus = extractJsonObject(msRaw ?? "") ?? { bull: 45, bear: 25, neutral: 30, recommendation: "alert_human" };

  // Step 4: Blue Agent synthesis — roadmap verdict
  const verdictRaw = await runBlueSkill({
    task: "Validate this roadmap for technical feasibility, narrative alignment, and market timing on Base. CRITICAL: Return ONLY raw JSON. No markdown.",
    skillFiles: ["base-ecosystem.md", "token-launch-guide.md"],
    input: `Project: ${project}\nRoadmap: ${roadmap}\nTimeline: ${timeline}\nTechnical research: ${buildResearchRaw ?? "Base ecosystem"}\nNarratives: ${narrativeRaw ?? "Base ecosystem"}\nConsensus: ${JSON.stringify(consensus)}`,
    outputSchema: `{"verdict":"SHIP|REVISE|PIVOT","score":<0-100>,"narrative_alignment":{"score":<0-10>,"aligned":<boolean>,"note":"<1 sentence>"},"timeline_assessment":"realistic|aggressive|too_slow","consensus":{"bull":<0-100>,"bear":<0-100>,"neutral":<0-100>},"strengths":["<strength>"],"gaps":["<gap>"],"recommended_changes":["<change>"],"builder_note":"<1 sentence>"}`,
    maxTokens: 1000,
  });

  const verdict = extractJsonObject(verdictRaw ?? "");
  if (!verdict) return NextResponse.json({ error: "LLM service temporarily unavailable", tool: "analysis", timestamp: new Date().toISOString() }, { status: 503 });

  return NextResponse.json({
    tool: "roadmap-validator",
    timestamp: new Date().toISOString(),
    project,
    timeline,
    miroshark: consensus,
    ...verdict,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT, handleLocally);
}
