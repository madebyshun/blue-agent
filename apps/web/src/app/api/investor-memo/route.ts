import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { extractJsonObject, runAeonSkill, runMiroSharkSkill, runBlueSkill } from "@/app/api/_lib/llm";

export const runtime = "nodejs";
export const maxDuration = 120;

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/investor-memo";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const project = (body.project as string) ?? "";
  const description = (body.description as string) ?? "";
  const ask = (body.ask as string) ?? "";
  const stage = (body.stage as string) ?? "pre-seed";
  const traction = (body.traction as string) ?? "";

  if (!project || !description) {
    return NextResponse.json({ error: "project and description are required" }, { status: 400 });
  }

  // Step 1+2: Aeon parallel — market research + narrative tracker
  const [marketResearch, narrativeRaw] = await Promise.all([
    runAeonSkill("deep-research", `Market size and opportunity for ${description} on Base. Comparable projects, TAM, key risks.`),
    runAeonSkill("narrative-tracker", `investor narrative and momentum for ${project}: ${description}. What narratives attract capital right now on Base?`),
  ]);

  // Step 3: MiroShark — 4-persona consensus on investment thesis
  const msRaw = await runMiroSharkSkill({
    scenario: `Evaluate investment thesis for ${project} — ${stage} raise of ${ask || "undisclosed"}`,
    context: {
      project,
      description,
      ask,
      stage,
      traction: traction || "pre-traction",
      market_research: marketResearch ?? "Base ecosystem",
      narratives: narrativeRaw ?? "Base ecosystem",
    },
    persona: "4-persona consensus — Analyst(1.8x), Influencer(2.8x), Retail(1.0x), Observer(0.5x)",
    outputSchema: `{"investment_grade":"A|B|C|D","key_risks":["<risk>"],"key_strengths":["<strength>"],"hype_potential":<0-10>,"viral_angle":"<best angle>","comparable":"<similar funded project>","consensus_verdict":"<2-3 sentences>"}`,
    maxTokens: 800,
  });
  const consensus = extractJsonObject(msRaw ?? "") ?? {};

  // Step 4: Blue Agent synthesis — investor memo
  const resultRaw = await runBlueSkill({
    task: "Generate a complete investor memo for this Base project. CRITICAL: Return ONLY raw JSON. No markdown.",
    skillFiles: ["base-ecosystem.md", "token-launch-guide.md"],
    input: `Project: ${project}\nDescription: ${description}\nAsk: ${ask}\nStage: ${stage}\nTraction: ${traction || "pre-traction"}\nMarket: ${marketResearch ?? "Base"}\nNarratives: ${narrativeRaw ?? "Base"}\nConsensus: ${JSON.stringify(consensus)}`,
    outputSchema: `{"memo_score":<0-100>,"one_pager":{"headline":"<10 words>","problem":"<1 sentence>","solution":"<1 sentence>","market":"<TAM estimate>","traction":"<or pre-traction>","ask":"<amount + stage>","why_now":"<1 sentence>"},"investor_fit":["<type of investor who'd say yes>"],"red_flags_to_address":["<flag>"],"strongest_angle":"<1 sentence>","cold_outreach_subject":"<email subject line>"}`,
    maxTokens: 1000,
  });

  const result = extractJsonObject(resultRaw ?? "");
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({
    tool: "investor-memo",
    timestamp: new Date().toISOString(),
    project,
    stage,
    miroshark: consensus,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT, handleLocally);
}
