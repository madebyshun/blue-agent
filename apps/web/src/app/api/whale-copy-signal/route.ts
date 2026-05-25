import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/whale-copy-signal";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const token = (body.token as string) ?? "";
  const wallet = (body.wallet as string) ?? "";

  const moversRaw = await runAeonSkill("token-movers", `smart money and whale activity${token ? ` for ${token}` : " on Base"}. Focus on wallet clustering, accumulation patterns, copy-trade setups.`);

  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark analyst persona — data-driven, smart money focused.
Identify copy-trade opportunities from whale/smart money signals.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "smart_money_signal": "accumulating|distributing|neutral",
  "copy_confidence": <0-10>,
  "entry_window": "<now|wait 24h|wait 48h+>",
  "risk_level": "high|medium|low",
  "analyst_take": "<1-2 sentences>"
}`,
    messages: [{ role: "user", content: `Token: ${token || "Base ecosystem"}\nWallet: ${wallet || "general"}\nMover signals: ${moversRaw ?? "Base chain"}` }],
    temperature: 0.3,
    maxTokens: 500,
  });
  const analyst = extractJsonObject(msRaw) ?? {};

  const resultRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — smart money copy signal engine for Base.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "signal": "STRONG_BUY|BUY|WATCH|PASS",
  "confidence": <0-100>,
  "whale_activity": "accumulating|distributing|neutral|mixed",
  "copy_targets": [{"token":"<name>","action":"buy|watch|avoid","size_hint":"<small|medium|large>","rationale":"<1 sentence>"}],
  "entry_timing": "<immediate|wait for dip|wait for confirmation>",
  "stop_loss_hint": "<price action trigger>",
  "smart_money_wallets_active": <number>,
  "summary": "<2 sentences>"
}`,
    messages: [{ role: "user", content: `Token: ${token || "Base"}\nMover data: ${moversRaw ?? "Base chain"}\nAnalyst: ${JSON.stringify(analyst)}` }],
    temperature: 0.3,
    maxTokens: 900,
  });

  const result = extractJsonObject(resultRaw);
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({
    tool: "whale-copy-signal",
    timestamp: new Date().toISOString(),
    token,
    analyst,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  const cloned = req.clone();
  const bankrRes = await proxyTool(req, ENDPOINT);
  if (bankrRes.status < 500) return bankrRes;
  try {
    let body: Record<string, unknown> = {};
    try { body = await cloned.json(); } catch {}
    return await handleLocally(body);
  } catch (error) {
    return NextResponse.json(
      { error: "Tool failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
