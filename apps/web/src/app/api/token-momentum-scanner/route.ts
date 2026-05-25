import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/token-momentum-scanner";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const chain = (body.chain as string) ?? "base";
  const min_mcap = (body.min_mcap as number) ?? 500000;

  const moversRaw = await runAeonSkill("token-movers", `${chain} chain momentum plays: pre-pump setups, breakout candidates, volume spikes, min mcap $${min_mcap.toLocaleString()}. Look for early momentum before CT picks up.`);

  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark — retail momentum sentiment engine.
Score these momentum setups from a retail trader perspective.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "retail_fomo_level": "high|medium|low",
  "top_momentum_pick": "<token name>",
  "momentum_stage": "early|mid|late|extended",
  "risk_reward": "<e.g. 3:1>",
  "retail_take": "<1 sentence>"
}`,
    messages: [{ role: "user", content: `Chain: ${chain}\nMomentum signals: ${moversRaw ?? "Base chain tokens"}` }],
    temperature: 0.4,
    maxTokens: 500,
  });
  const retail = extractJsonObject(msRaw) ?? {};

  const resultRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — momentum scanner for Base chain tokens.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "scan_score": <0-100>,
  "market_phase": "accumulation|markup|distribution|markdown",
  "momentum_plays": [
    {
      "token": "<name>",
      "momentum_score": <0-100>,
      "stage": "early|mid|late",
      "catalyst": "<what's driving it>",
      "entry_zone": "<price level or condition>",
      "target": "<price target or %>",
      "invalidation": "<when thesis is wrong>"
    }
  ],
  "avoid": ["<token to avoid>"],
  "best_setup": "<token with best risk/reward>",
  "summary": "<2 sentences>"
}`,
    messages: [{ role: "user", content: `Chain: ${chain}\nMin mcap: $${min_mcap}\nMovers: ${moversRaw ?? "Base chain"}\nRetail: ${JSON.stringify(retail)}` }],
    temperature: 0.3,
    maxTokens: 1000,
  });

  const result = extractJsonObject(resultRaw);
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({
    tool: "token-momentum-scanner",
    timestamp: new Date().toISOString(),
    chain,
    min_mcap,
    retail,
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
