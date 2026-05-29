import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { extractJsonObject, runAeonSkill, runMiroSharkSkill, runBlueSkill } from "@/app/api/_lib/llm";

export const runtime = "nodejs";
export const maxDuration = 120;

const ENDPOINT = "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/agent-token-strategy";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const agent = (body.agent as string) ?? "";
  const description = (body.description as string) ?? "";
  const token_name = (body.token_name as string) ?? "";
  const total_supply = (body.total_supply as string) ?? "1000000000";

  if (!agent) {
    return NextResponse.json({ error: "agent is required" }, { status: 400 });
  }

  // Step 1+2: Aeon parallel — token movers (agent token patterns) + narrative tracker (agent token story)
  const [moversRaw, narrativeRaw] = await Promise.all([
    runAeonSkill("token-movers", `AI agent tokens on Base: what's working, what tokenomics patterns succeed for agent-owned projects. Examples like VIRTUAL, ARC, similar.`),
    runAeonSkill("narrative-tracker", `AI agent token narrative on Base: what story resonates for agent tokens? Utility vs memecoin positioning. ${agent} ${description}`),
  ]);

  // Step 3: MiroShark — analyst + retail consensus on agent token strategy
  const msRaw = await runMiroSharkSkill({
    scenario: `Evaluate token strategy for AI agent ${agent}${token_name ? ` — token: ${token_name}` : ""} — supply: ${total_supply}`,
    context: {
      agent,
      description,
      token_name: token_name || "unnamed",
      total_supply,
      market_movers: moversRaw ?? "agent tokens",
      narratives: narrativeRaw ?? "AI agent tokens",
    },
    persona: "analyst — evaluates agent economics, token utility, market positioning",
    outputSchema: `{"retail_appeal":<0-10>,"token_type_fit":"utility|governance|memecoin|hybrid","buy_trigger":"<what makes retail buy>","hold_reason":"<what makes retail hold>","retail_verdict":"<1 sentence>"}`,
    maxTokens: 500,
  });
  const retail = extractJsonObject(msRaw ?? "") ?? {};

  // Step 4: Blue Agent synthesis — agent token strategy
  const resultRaw = await runBlueSkill({
    task: "Design optimal token strategy for this AI agent project on Base. CRITICAL: Return ONLY raw JSON. No markdown.",
    skillFiles: ["base-ecosystem.md", "token-launch-guide.md"],
    input: `Agent: ${agent}\nDescription: ${description}\nToken: ${token_name}\nSupply: ${total_supply}\nMarket movers: ${moversRaw ?? "agent tokens"}\nNarratives: ${narrativeRaw ?? "Base"}\nRetail: ${JSON.stringify(retail)}`,
    outputSchema: `{"strategy_score":<0-100>,"recommended_type":"utility|governance|memecoin|hybrid","tokenomics":{"total_supply":"<supply>","allocation":{"team":"<%>","community":"<%>","treasury":"<%>","liquidity":"<%>","rewards":"<%>"},"vesting":"<team vesting schedule>","utility":["<token use case>"]},"narrative_angle":"<the story to tell>","launch_sequence":["<step 1>","<step 2>","<step 3>"],"comparable_agents":["<similar successful agent token>"],"risks":["<tokenomics risk>"],"summary":"<2 sentences>"}`,
    maxTokens: 1200,
  });

  const result = extractJsonObject(resultRaw ?? "");
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({
    tool: "agent-token-strategy",
    timestamp: new Date().toISOString(),
    agent,
    token_name,
    total_supply,
    retail,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT, handleLocally);
}
