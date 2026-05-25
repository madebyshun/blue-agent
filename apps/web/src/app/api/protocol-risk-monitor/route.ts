import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/protocol-risk-monitor";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const protocol = (body.protocol as string) ?? "";
  const position = (body.position as string) ?? "";
  if (!protocol) return NextResponse.json({ error: "protocol is required (e.g. 'Aerodrome', 'Aave Base')" }, { status: 400 });

  // Use narrative-tracker as fallback since defi-monitor skill may not exist
  const defiRaw = await runAeonSkill("narrative-tracker", `${protocol} on Base: current TVL health, liquidity depth, recent unusual activity, smart contract risk signals, exploit history, centralization risks, oracle dependencies.`);

  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark analyst persona — DeFi risk specialist.
CRITICAL: Return ONLY raw JSON.
Schema: {"risk_level":"critical|high|medium|low|minimal","exit_urgency":"exit_now|reduce|hold|add","biggest_risk":"<str>","time_horizon":"<str>","analyst_verdict":"<str>"}`,
    messages: [{ role: "user", content: `Protocol: ${protocol}\nPosition: ${position || "general exposure"}\nDeFi signals: ${defiRaw ?? "Base DeFi"}` }],
    temperature: 0.3, maxTokens: 500,
  });
  const analyst = extractJsonObject(msRaw) ?? {};

  const resultRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — protocol risk monitor for Base DeFi positions.
CRITICAL: Return ONLY raw JSON.
Schema: {"risk_score":<0-100>,"overall_risk":"critical|high|medium|low|minimal","action":"EXIT_NOW|REDUCE|HOLD|ADD","risk_dimensions":{"smart_contract":<0-10>,"liquidity":<0-10>,"oracle":<0-10>,"governance":<0-10>,"market":<0-10>},"active_risks":[{"risk":"<str>","severity":"critical|high|medium|low","description":"<str>"}],"watch_for":["<str>"],"safe_exit_path":"<str>","position_sizing":"<str>","summary":"<str>"}`,
    messages: [{ role: "user", content: `Protocol: ${protocol}\nPosition: ${position}\nDeFi: ${defiRaw ?? "Base DeFi"}\nAnalyst: ${JSON.stringify(analyst)}` }],
    temperature: 0.3, maxTokens: 1100,
  });
  const result = extractJsonObject(resultRaw);
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({ tool: "protocol-risk-monitor", timestamp: new Date().toISOString(), protocol, position, analyst, ...result });
}

export async function POST(req: NextRequest) {
  const cloned = req.clone();
  const bankrRes = await proxyTool(req, ENDPOINT);
  if (bankrRes.status < 500) return bankrRes; // 2xx success, 402 payment, 4xx errors pass through
  console.log("[protocol-risk-monitor] Bankr 502 → local fallback");
  try {
    let body: Record<string, unknown> = {};
    try { body = await cloned.json(); } catch {}
    return await handleLocally(body);
  } catch (error) {
    return NextResponse.json({ error: "Protocol risk monitor failed", message: (error as Error).message }, { status: 500 });
  }
}
