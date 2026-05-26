import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { extractJsonObject, runAeonSkill, runMiroSharkSkill, runBlueSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/base-protocol-comparison";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const protocol_a = (body.protocol_a as string) ?? "";
  const protocol_b = (body.protocol_b as string) ?? "";
  const category = (body.category as string) ?? "";
  const use_case = (body.use_case as string) ?? "";

  if (!protocol_a) return NextResponse.json({ error: "protocol_a is required" }, { status: 400 });

  // Step 1+2: Aeon parallel — research both protocols
  const [resA, resB] = await Promise.all([
    runAeonSkill("deep-research", `${protocol_a} on Base: TVL, fees, security, team, audits, integrations, user growth, competitive position in ${category || "DeFi"}.`),
    protocol_b
      ? runAeonSkill("deep-research", `${protocol_b} on Base: TVL, fees, security, team, audits, integrations, user growth, competitive position in ${category || "DeFi"}.`)
      : runAeonSkill("deep-research", `Top protocols in ${category || "Base DeFi"} similar to ${protocol_a}: alternatives, comparisons, market positioning.`),
  ]);

  // Step 3: MiroShark — analyst persona on protocol comparison
  const msRaw = await runMiroSharkSkill({
    scenario: `Compare ${protocol_a} vs ${protocol_b || "alternatives"} for use case: ${use_case || category || "general Base DeFi"}`,
    context: {
      protocol_a,
      protocol_b: protocol_b || "alternatives",
      category: category || "DeFi",
      use_case: use_case || "general",
      protocol_a_research: resA ?? protocol_a,
      protocol_b_research: resB ?? protocol_b,
    },
    persona: "analyst — evaluates agent economics, token utility, market positioning",
    outputSchema: `{"winner":"<str>","margin":"clear|slight|toss-up","for_use_case":"<str>","risk_delta":"<str>","analyst_verdict":"<str>"}`,
    maxTokens: 500,
  });
  const analyst = extractJsonObject(msRaw ?? "") ?? {};

  // Step 4: Blue Agent synthesis — protocol comparison
  const resultRaw = await runBlueSkill({
    task: "Compare these Base protocols and provide a definitive recommendation for builders. CRITICAL: Return ONLY raw JSON. No markdown.",
    skillFiles: ["base-ecosystem.md", "base-addresses.md"],
    input: `Protocol A: ${protocol_a}\nProtocol B: ${protocol_b || "alternatives"}\nCategory: ${category}\nUse case: ${use_case}\nA research: ${resA ?? protocol_a}\nB research: ${resB ?? protocol_b}\nAnalyst: ${JSON.stringify(analyst)}`,
    outputSchema: `{"comparison_score":<0-100>,"recommendation":"<str>","protocols":[{"name":"<str>","score":<0-100>,"tvl":"<str>","security":<0-10>,"ux":<0-10>,"yield":<0-10>,"integration_ease":<0-10>,"pros":["<str>"],"cons":["<str>"]}],"use_case_winner":"<str>","risk_comparison":"<str>","integration_notes":"<str>","summary":"<str>"}`,
    maxTokens: 1200,
  });

  const result = extractJsonObject(resultRaw ?? "");
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({
    tool: "base-protocol-comparison",
    timestamp: new Date().toISOString(),
    protocol_a,
    protocol_b,
    category,
    use_case,
    analyst,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT, handleLocally);
}
