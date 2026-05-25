import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/base-protocol-comparison";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const protocol_a = (body.protocol_a as string) ?? "";
  const protocol_b = (body.protocol_b as string) ?? "";
  const category = (body.category as string) ?? "";
  const use_case = (body.use_case as string) ?? "";
  if (!protocol_a) return NextResponse.json({ error: "protocol_a is required" }, { status: 400 });

  const [resA, resB] = await Promise.all([
    runAeonSkill("deep-research", `${protocol_a} on Base: TVL, fees, security, team, audits, integrations, user growth, competitive position in ${category || "DeFi"}.`),
    protocol_b
      ? runAeonSkill("deep-research", `${protocol_b} on Base: TVL, fees, security, team, audits, integrations, user growth, competitive position in ${category || "DeFi"}.`)
      : runAeonSkill("deep-research", `Top protocols in ${category || "Base DeFi"} similar to ${protocol_a}: alternatives, comparisons, market positioning.`),
  ]);

  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark analyst persona — protocol comparison specialist.
CRITICAL: Return ONLY raw JSON.
Schema: {"winner":"<str>","margin":"clear|slight|toss-up","for_use_case":"<str>","risk_delta":"<str>","analyst_verdict":"<str>"}`,
    messages: [{ role: "user", content: `Protocol A: ${protocol_a}\nProtocol B: ${protocol_b || "alternatives"}\nCategory: ${category}\nUse case: ${use_case}\nA research: ${resA ?? protocol_a}\nB research: ${resB ?? protocol_b}` }],
    temperature: 0.3, maxTokens: 500,
  });
  const analyst = extractJsonObject(msRaw) ?? {};

  const resultRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — protocol comparison engine for Base builders.
CRITICAL: Return ONLY raw JSON.
Schema: {"comparison_score":<0-100>,"recommendation":"<str>","protocols":[{"name":"<str>","score":<0-100>,"tvl":"<str>","security":<0-10>,"ux":<0-10>,"yield":<0-10>,"integration_ease":<0-10>,"pros":["<str>"],"cons":["<str>"]}],"use_case_winner":"<str>","risk_comparison":"<str>","integration_notes":"<str>","summary":"<str>"}`,
    messages: [{ role: "user", content: `A: ${protocol_a}\nB: ${protocol_b || "alternatives"}\nCategory: ${category}\nUse case: ${use_case}\nA: ${resA ?? protocol_a}\nB: ${resB ?? protocol_b}\nAnalyst: ${JSON.stringify(analyst)}` }],
    temperature: 0.3, maxTokens: 1200,
  });
  const result = extractJsonObject(resultRaw);
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({ tool: "base-protocol-comparison", timestamp: new Date().toISOString(), protocol_a, protocol_b, category, use_case, analyst, ...result });
}

export async function POST(req: NextRequest) {
  const cloned = req.clone();
  const bankrRes = await proxyTool(req, ENDPOINT);
  if (bankrRes.status < 500) return bankrRes; // 2xx success, 402 payment, 4xx errors pass through
  console.log("[base-protocol-comparison] Bankr 502 → local fallback");
  try {
    let body: Record<string, unknown> = {};
    try { body = await cloned.json(); } catch {}
    return await handleLocally(body);
  } catch (error) {
    return NextResponse.json({ error: "Base protocol comparison failed", message: (error as Error).message }, { status: 500 });
  }
}
