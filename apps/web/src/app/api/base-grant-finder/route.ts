import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { extractJsonObject, runAeonSkill, runMiroSharkSkill, runBlueSkill } from "@/app/api/_lib/llm";

export const runtime = "nodejs";
export const maxDuration = 120;

const ENDPOINT = "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/base-grant-finder";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const project = (body.project as string) ?? "";
  const description = (body.description as string) ?? "";
  const stage = (body.stage as string) ?? "early";
  const sector = (body.sector as string) ?? "";

  if (!project) return NextResponse.json({ error: "project is required" }, { status: 400 });

  // Step 1+2: Aeon parallel — grant research + narrative tracker for grant positioning
  const [researchRaw, narrativeRaw] = await Promise.all([
    runAeonSkill("deep-research", `Base ecosystem grants and funding programs: Coinbase Grants, Base Builder grants, Optimism RetroPGF, ecosystem funds. Requirements, amounts, application tips for ${sector || "general"} projects at ${stage} stage.`),
    runAeonSkill("narrative-tracker", `Grant-winning narratives on Base: what stories resonate with Coinbase/Base grant committees? What sectors are getting funded in ${new Date().getFullYear()}? ${sector || "general"} focus.`),
  ]);

  // Step 3: MiroShark — analyst persona on grant fit and success probability
  const msRaw = await runMiroSharkSkill({
    scenario: `Evaluate grant fit for ${project} — ${stage} stage ${sector || "general"} project seeking Base ecosystem funding`,
    context: {
      project,
      description,
      stage,
      sector: sector || "general",
      grant_research: researchRaw ?? "Base grants",
      narratives: narrativeRaw ?? "Base ecosystem",
    },
    persona: "analyst — evaluates agent economics, token utility, market positioning",
    outputSchema: `{"grant_fit":"excellent|good|fair|poor","best_match":"<str>","estimated_amount":"<str>","success_probability":<0-100>,"analyst_verdict":"<str>"}`,
    maxTokens: 500,
  });
  const analyst = extractJsonObject(msRaw ?? "") ?? {};

  // Step 4: Blue Agent synthesis — grant finder results
  const resultRaw = await runBlueSkill({
    task: "Find and rank the best grant opportunities for this Base ecosystem project with application strategy. CRITICAL: Return ONLY raw JSON. No markdown.",
    skillFiles: ["base-ecosystem.md", "base-addresses.md"],
    input: `Project: ${project}\nDescription: ${description}\nStage: ${stage}\nSector: ${sector}\nGrant research: ${researchRaw ?? "Base ecosystem"}\nNarratives: ${narrativeRaw ?? "Base"}\nAnalyst: ${JSON.stringify(analyst)}`,
    outputSchema: `{"match_score":<0-100>,"grants":[{"name":"<str>","org":"<str>","amount":"<str>","fit":"perfect|good|stretch","requirements":["<str>"],"apply_by":"<str>","application_tip":"<str>"}],"strongest_narrative":"<str>","application_priorities":["<str>"],"missing_credentials":["<str>"],"estimated_total":"<str>","summary":"<str>"}`,
    maxTokens: 1200,
  });

  const result = extractJsonObject(resultRaw ?? "");
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({
    tool: "base-grant-finder",
    timestamp: new Date().toISOString(),
    project,
    stage,
    sector,
    analyst,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT, handleLocally);
}
