import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/token-distribution-plan";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const token = (body.token as string) ?? "";
  const ticker = (body.ticker as string) ?? "";
  const total_supply = (body.total_supply as number) ?? 1000000000;
  const description = (body.description as string) ?? "";

  if (!token) {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }

  const moversRaw = await runAeonSkill("token-movers", "Base token distributions, successful tokenomics patterns, community allocations");

  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark retail persona.
What distribution do retail holders expect and respond well to?
CRITICAL: Return ONLY raw JSON.
Schema: {"preferred_allocation":{"community_pct":<0-100>,"team_pct":<0-100>,"treasury_pct":<0-100>,"lp_pct":<0-100>},"airdrop_preference":"yes|no|maybe","vesting_tolerance":"strict|moderate|loose","retail_verdict":"<1 sentence>"}`,
    messages: [{ role: "user", content: `Token: ${token} ${ticker ? `($${ticker})` : ""}\nDescription: ${description}\nMarket context: ${moversRaw ?? "Base ecosystem"}` }],
    temperature: 0.4,
    maxTokens: 500,
  });
  const retailPref = extractJsonObject(msRaw) ?? {};

  const resultRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — tokenomics and distribution planning engine for Base.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "distribution_score": <0-100>,
  "allocation": {
    "community": {"pct":<0-100>,"vesting":"<e.g. no vesting>","purpose":"<1 sentence>"},
    "team": {"pct":<0-100>,"vesting":"<e.g. 2yr cliff + 2yr linear>","purpose":"<1 sentence>"},
    "treasury": {"pct":<0-100>,"vesting":"<>","purpose":"<1 sentence>"},
    "liquidity": {"pct":<0-100>,"vesting":"<>","purpose":"<1 sentence>"},
    "airdrop": {"pct":<0-100>,"vesting":"<>","purpose":"<1 sentence>"}
  },
  "launch_strategy": "fair_launch|presale|lp_bootstrap|airdrop_first",
  "initial_liquidity_rec": "<USDC amount recommendation>",
  "airdrop_criteria": ["<eligibility criteria>"],
  "red_flags_avoided": ["<bad tokenomics pattern avoided>"],
  "distribution_note": "<2 sentences>"
}`,
    messages: [{ role: "user", content: `Token: ${token} ${ticker ? `($${ticker})` : ""}\nTotal supply: ${total_supply.toLocaleString()}\nDescription: ${description}\nMarket: ${moversRaw ?? "Base"}\nRetail preference: ${JSON.stringify(retailPref)}` }],
    temperature: 0.3,
    maxTokens: 1000,
  });

  const result = extractJsonObject(resultRaw);
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({
    tool: "token-distribution-plan",
    timestamp: new Date().toISOString(),
    token,
    ticker: ticker || null,
    total_supply,
    retail_preference: retailPref,
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
