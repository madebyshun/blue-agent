import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/base-grant-finder";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const project = (body.project as string) ?? "";
  const description = (body.description as string) ?? "";
  const stage = (body.stage as string) ?? "early";
  const sector = (body.sector as string) ?? "";
  if (!project) return NextResponse.json({ error: "project is required" }, { status: 400 });

  const researchRaw = await runAeonSkill("deep-research", `Base ecosystem grants and funding programs: Coinbase Grants, Base Builder grants, Optimism RetroPGF, ecosystem funds. Requirements, amounts, application tips for ${sector || "general"} projects at ${stage} stage.`);

  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark analyst persona — grant and funding specialist.
CRITICAL: Return ONLY raw JSON.
Schema: {"grant_fit":"excellent|good|fair|poor","best_match":"<str>","estimated_amount":"<str>","success_probability":<0-100>,"analyst_verdict":"<str>"}`,
    messages: [{ role: "user", content: `Project: ${project}\nDescription: ${description}\nStage: ${stage}\nSector: ${sector}\nResearch: ${researchRaw ?? "Base grants"}` }],
    temperature: 0.3, maxTokens: 500,
  });
  const analyst = extractJsonObject(msRaw) ?? {};

  const resultRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — grant finder for Base ecosystem builders.
CRITICAL: Return ONLY raw JSON.
Schema: {"match_score":<0-100>,"grants":[{"name":"<str>","org":"<str>","amount":"<str>","fit":"perfect|good|stretch","requirements":["<str>"],"apply_by":"<str>","application_tip":"<str>"}],"strongest_narrative":"<str>","application_priorities":["<str>"],"missing_credentials":["<str>"],"estimated_total":"<str>","summary":"<str>"}`,
    messages: [{ role: "user", content: `Project: ${project}\nDescription: ${description}\nStage: ${stage}\nSector: ${sector}\nResearch: ${researchRaw ?? "Base ecosystem"}\nAnalyst: ${JSON.stringify(analyst)}` }],
    temperature: 0.3, maxTokens: 1200,
  });
  const result = extractJsonObject(resultRaw);
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({ tool: "base-grant-finder", timestamp: new Date().toISOString(), project, stage, sector, analyst, ...result });
}

export async function POST(req: NextRequest) {
  const cloned = req.clone();
  const bankrRes = await proxyTool(req, ENDPOINT);
  if (bankrRes.status < 500) return bankrRes; // 2xx success, 402 payment, 4xx errors pass through
  console.log("[base-grant-finder] Bankr 502 → local fallback");
  try {
    let body: Record<string, unknown> = {};
    try { body = await cloned.json(); } catch {}
    return await handleLocally(body);
  } catch (error) {
    return NextResponse.json({ error: "Base grant finder failed", message: (error as Error).message }, { status: 500 });
  }
}
