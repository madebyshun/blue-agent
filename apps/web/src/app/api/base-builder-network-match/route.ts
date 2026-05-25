import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/base-builder-network-match";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const builder = (body.builder as string) ?? "";
  const project = (body.project as string) ?? "";
  const looking_for = (body.looking_for as string) ?? "";
  const skills = (body.skills as string) ?? "";
  if (!builder && !project) return NextResponse.json({ error: "builder or project is required" }, { status: 400 });

  const target = builder || project;
  const researchRaw = await runAeonSkill("deep-research", `Base ecosystem builder network: active builders, their projects, complementary skills, collaboration patterns. Context: ${target} — ${skills || "full-stack"} builder looking for ${looking_for || "collaborators"}.`);

  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark analyst persona — network and synergy specialist.
CRITICAL: Return ONLY raw JSON.
Schema: {"network_fit":"excellent|good|fair|limited","top_match_type":"<str>","synergy_score":<0-10>,"ecosystem_position":"<str>","analyst_verdict":"<str>"}`,
    messages: [{ role: "user", content: `Builder: ${target}\nSkills: ${skills}\nLooking for: ${looking_for}\nResearch: ${researchRaw ?? "Base builders"}` }],
    temperature: 0.3, maxTokens: 500,
  });
  const analyst = extractJsonObject(msRaw) ?? {};

  const resultRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — builder network match engine for Base ecosystem.
CRITICAL: Return ONLY raw JSON.
Schema: {"match_score":<0-100>,"matches":[{"type":"<str>","profile":"<str>","where_to_find":"<str>","outreach_angle":"<str>","synergy":"<str>"}],"builder_archetype":"<str>","value_proposition":"<str>","network_gaps":["<str>"],"first_steps":["<str>"],"ecosystem_fit":"<str>","summary":"<str>"}`,
    messages: [{ role: "user", content: `Builder: ${target}\nSkills: ${skills}\nLooking for: ${looking_for}\nResearch: ${researchRaw ?? "Base"}\nAnalyst: ${JSON.stringify(analyst)}` }],
    temperature: 0.3, maxTokens: 1100,
  });
  const result = extractJsonObject(resultRaw);
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({ tool: "base-builder-network-match", timestamp: new Date().toISOString(), builder: target, looking_for, analyst, ...result });
}

export async function POST(req: NextRequest) {
  const cloned = req.clone();
  const bankrRes = await proxyTool(req, ENDPOINT);
  if (bankrRes.status < 500) return bankrRes; // 2xx success, 402 payment, 4xx errors pass through
  console.log("[base-builder-network-match] Bankr 502 → local fallback");
  try {
    let body: Record<string, unknown> = {};
    try { body = await cloned.json(); } catch {}
    return await handleLocally(body);
  } catch (error) {
    return NextResponse.json({ error: "Base builder network match failed", message: (error as Error).message }, { status: 500 });
  }
}
