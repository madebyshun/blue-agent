import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/wallet-strategy-analyzer";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const address = (body.address as string) ?? "";
  const focus = (body.focus as string) ?? "general";
  if (!address) return NextResponse.json({ error: "address is required (wallet address 0x...)" }, { status: 400 });

  const moversRaw = await runAeonSkill("token-movers", `smart money wallet strategies on Base: what are top wallets holding, rotating into/out of, trading patterns that generate alpha. Context: analyzing ${address}`);

  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark analyst persona — on-chain strategy specialist.
CRITICAL: Return ONLY raw JSON.
Schema: {"strategy_type":"momentum|value|narrative|degen|yield|mixed","sophistication":"whale|smart_money|retail|bot","edge":"<str>","copy_worthiness":<0-10>,"analyst_verdict":"<str>"}`,
    messages: [{ role: "user", content: `Address: ${address}\nFocus: ${focus}\nMover signals: ${moversRaw ?? "Base chain"}` }],
    temperature: 0.3, maxTokens: 500,
  });
  const analyst = extractJsonObject(msRaw) ?? {};

  const resultRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — wallet strategy analyzer for Base chain.
CRITICAL: Return ONLY raw JSON.
Schema: {"strategy_score":<0-100>,"wallet_archetype":"whale|smart_money|degen|yield_farmer|builder|mixed","strategy":{"primary":"<str>","timeframe":"scalp|swing|position|long_term","risk_profile":"aggressive|moderate|conservative","key_behaviors":["<str>"]},"holdings_pattern":{"dominant_sectors":["<str>"],"typical_position_size":"<str>","entry_style":"<str>"},"replicable_plays":["<str>"],"watch_signals":["<str>"],"risk_flags":["<str>"],"summary":"<str>"}`,
    messages: [{ role: "user", content: `Address: ${address}\nFocus: ${focus}\nMovers: ${moversRaw ?? "Base chain"}\nAnalyst: ${JSON.stringify(analyst)}` }],
    temperature: 0.3, maxTokens: 1100,
  });
  const result = extractJsonObject(resultRaw);
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({ tool: "wallet-strategy-analyzer", timestamp: new Date().toISOString(), address, focus, analyst, ...result });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT);
}
