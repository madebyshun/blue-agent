import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { extractJsonObject, runAeonSkill, runMiroSharkSkill, runBlueSkill } from "@/app/api/_lib/llm";

export const runtime = "nodejs";
export const maxDuration = 120;

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/builder-brand-score";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const builder = (body.builder as string) ?? "";
  const project = (body.project as string) ?? "";
  const handle = (body.handle as string) ?? "";

  if (!builder && !handle) {
    return NextResponse.json({ error: "builder or handle is required" }, { status: 400 });
  }

  const target = builder || handle;

  // Step 1+2: Aeon parallel — deep research on reputation + narrative tracker on brand positioning
  const [researchRaw, narrativeRaw] = await Promise.all([
    runAeonSkill("deep-research", `${target}${project ? ` — ${project}` : ""}: reputation in Base/crypto ecosystem, CT presence, community standing, past projects, credibility signals.`),
    runAeonSkill("narrative-tracker", `${target} brand positioning: how are they perceived on CT? What narratives are they associated with? Brand strength in Base ecosystem.`),
  ]);

  // Step 3: MiroShark — influencer persona on brand authenticity and CT presence
  const msRaw = await runMiroSharkSkill({
    scenario: `Score builder brand for ${target}${project ? ` (${project})` : ""} — real brand vs hype in crypto`,
    context: {
      builder: target,
      project: project || "unknown",
      research: researchRaw ?? target,
      narratives: narrativeRaw ?? target,
    },
    persona: "influencer — CT engagement focused, viral mechanics, audience growth",
    outputSchema: `{"brand_tier":"S|A|B|C|D","ct_presence":"dominant|strong|moderate|weak|unknown","authenticity":<0-10>,"narrative_alignment":"<what narrative they own>","influencer_verdict":"<1-2 sentences>"}`,
    maxTokens: 500,
  });
  const influencer = extractJsonObject(msRaw ?? "") ?? {};

  // Step 4: Blue Agent synthesis — builder brand score
  const resultRaw = await runBlueSkill({
    task: "Score this builder's brand in the Base ecosystem with actionable improvement recommendations. CRITICAL: Return ONLY raw JSON. No markdown.",
    skillFiles: ["base-ecosystem.md"],
    input: `Builder: ${target}\nProject: ${project || "unknown"}\nResearch: ${researchRaw ?? target}\nNarratives: ${narrativeRaw ?? target}\nInfluencer: ${JSON.stringify(influencer)}`,
    outputSchema: `{"brand_score":<0-100>,"tier":"S|A|B|C|D","dimensions":{"visibility":<0-10>,"credibility":<0-10>,"community":<0-10>,"consistency":<0-10>,"narrative_ownership":<0-10>},"strengths":["<brand strength>"],"gaps":["<brand gap>"],"quick_wins":["<easy action to improve brand>"],"brand_keywords":["<what they're known for>"],"recommended_positioning":"<1-2 sentences on how to strengthen brand>","summary":"<2 sentences>"}`,
    maxTokens: 1000,
  });

  const result = extractJsonObject(resultRaw ?? "");
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({
    tool: "builder-brand-score",
    timestamp: new Date().toISOString(),
    builder: target,
    project,
    influencer,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT, handleLocally);
}
