import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { extractJsonObject, runAeonSkill, runMiroSharkSkill, runBlueSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/base-builder-network-match";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const builder = (body.builder as string) ?? "";
  const project = (body.project as string) ?? "";
  const looking_for = (body.looking_for as string) ?? "";
  const skills = (body.skills as string) ?? "";

  if (!builder && !project) return NextResponse.json({ error: "builder or project is required" }, { status: 400 });

  const target = builder || project;

  // Step 1+2: Aeon parallel — ecosystem network research + builder profile research
  const [researchRaw, profileRaw] = await Promise.all([
    runAeonSkill("deep-research", `Base ecosystem builder network: active builders, their projects, complementary skills, collaboration patterns. Context: ${target} — ${skills || "full-stack"} builder looking for ${looking_for || "collaborators"}.`),
    runAeonSkill("deep-research", `Builder archetype and positioning for ${target}: skills in ${skills || "full-stack development"}, what they bring to collaborations, ideal partners and projects on Base.`),
  ]);

  // Step 3: MiroShark — analyst persona on network fit and synergy
  const msRaw = await runMiroSharkSkill({
    scenario: `Find best network matches for ${target} — ${skills || "full-stack"} builder looking for ${looking_for || "collaborators"} on Base`,
    context: {
      builder: target,
      skills: skills || "full-stack",
      looking_for: looking_for || "collaborators",
      ecosystem_research: researchRaw ?? "Base builders",
      profile_research: profileRaw ?? target,
    },
    persona: "analyst — evaluates agent economics, token utility, market positioning",
    outputSchema: `{"network_fit":"excellent|good|fair|limited","top_match_type":"<str>","synergy_score":<0-10>,"ecosystem_position":"<str>","analyst_verdict":"<str>"}`,
    maxTokens: 500,
  });
  const analyst = extractJsonObject(msRaw ?? "") ?? {};

  // Step 4: Blue Agent synthesis — builder network match
  const resultRaw = await runBlueSkill({
    task: "Match this Base builder with the best collaboration opportunities and network connections. CRITICAL: Return ONLY raw JSON. No markdown.",
    skillFiles: ["base-ecosystem.md", "base-addresses.md"],
    input: `Builder: ${target}\nSkills: ${skills}\nLooking for: ${looking_for}\nEcosystem research: ${researchRaw ?? "Base"}\nProfile research: ${profileRaw ?? target}\nAnalyst: ${JSON.stringify(analyst)}`,
    outputSchema: `{"match_score":<0-100>,"matches":[{"type":"<str>","profile":"<str>","where_to_find":"<str>","outreach_angle":"<str>","synergy":"<str>"}],"builder_archetype":"<str>","value_proposition":"<str>","network_gaps":["<str>"],"first_steps":["<str>"],"ecosystem_fit":"<str>","summary":"<str>"}`,
    maxTokens: 1100,
  });

  const result = extractJsonObject(resultRaw ?? "");
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({
    tool: "base-builder-network-match",
    timestamp: new Date().toISOString(),
    builder: target,
    looking_for,
    analyst,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT, handleLocally);
}
