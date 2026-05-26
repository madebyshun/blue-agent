import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { extractJsonObject, runAeonSkill, runMiroSharkSkill, runBlueSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/token-distribution-plan";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const token = (body.token as string) ?? "";
  const ticker = (body.ticker as string) ?? "";
  const total_supply = (body.total_supply as number) ?? 1000000000;
  const description = (body.description as string) ?? "";

  if (!token) {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }

  // Step 1+2: Aeon parallel — token movers (market patterns) + narrative tracker (positioning)
  const [moversRaw, narrativeRaw] = await Promise.all([
    runAeonSkill("token-movers", "Base token distributions, successful tokenomics patterns, community allocations"),
    runAeonSkill("narrative-tracker", `token launch narrative for ${token} ${ticker ? `($${ticker})` : ""}: ${description}. What tokenomics stories resonate on Base right now?`),
  ]);

  // Step 3: MiroShark — retail + analyst persona on distribution preferences
  const msRaw = await runMiroSharkSkill({
    scenario: `Evaluate token distribution plan for ${token} ${ticker ? `($${ticker})` : ""} — total supply: ${total_supply.toLocaleString()}`,
    context: {
      token,
      ticker: ticker || null,
      total_supply,
      description,
      market_context: moversRaw ?? "Base ecosystem",
      narratives: narrativeRaw ?? "Base ecosystem",
    },
    persona: "analyst — evaluates agent economics, token utility, market positioning",
    outputSchema: `{"preferred_allocation":{"community_pct":<0-100>,"team_pct":<0-100>,"treasury_pct":<0-100>,"lp_pct":<0-100>},"airdrop_preference":"yes|no|maybe","vesting_tolerance":"strict|moderate|loose","retail_verdict":"<1 sentence>"}`,
    maxTokens: 500,
  });
  const retailPref = extractJsonObject(msRaw ?? "") ?? {};

  // Step 4: Blue Agent synthesis — token distribution plan
  const resultRaw = await runBlueSkill({
    task: "Design optimal token distribution plan for this Base project. CRITICAL: Return ONLY raw JSON. No markdown.",
    skillFiles: ["base-ecosystem.md", "token-launch-guide.md"],
    input: `Token: ${token} ${ticker ? `($${ticker})` : ""}\nTotal supply: ${total_supply.toLocaleString()}\nDescription: ${description}\nMarket: ${moversRaw ?? "Base"}\nNarratives: ${narrativeRaw ?? "Base"}\nRetail preference: ${JSON.stringify(retailPref)}`,
    outputSchema: `{"distribution_score":<0-100>,"allocation":{"community":{"pct":<0-100>,"vesting":"<e.g. no vesting>","purpose":"<1 sentence>"},"team":{"pct":<0-100>,"vesting":"<e.g. 2yr cliff + 2yr linear>","purpose":"<1 sentence>"},"treasury":{"pct":<0-100>,"vesting":"<>","purpose":"<1 sentence>"},"liquidity":{"pct":<0-100>,"vesting":"<>","purpose":"<1 sentence>"},"airdrop":{"pct":<0-100>,"vesting":"<>","purpose":"<1 sentence>"}},"launch_strategy":"fair_launch|presale|lp_bootstrap|airdrop_first","initial_liquidity_rec":"<USDC amount recommendation>","airdrop_criteria":["<eligibility criteria>"],"red_flags_avoided":["<bad tokenomics pattern avoided>"],"distribution_note":"<2 sentences>"}`,
    maxTokens: 1000,
  });

  const result = extractJsonObject(resultRaw ?? "");
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
  return proxyTool(req, ENDPOINT, handleLocally);
}
