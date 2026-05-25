import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/agent-token-strategy";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const agent = (body.agent as string) ?? "";
  const description = (body.description as string) ?? "";
  const token_name = (body.token_name as string) ?? "";
  const total_supply = (body.total_supply as string) ?? "1000000000";

  if (!agent) {
    return NextResponse.json({ error: "agent is required" }, { status: 400 });
  }

  const [moversRaw, narrativeRaw] = await Promise.all([
    runAeonSkill("token-movers", `AI agent tokens on Base: what's working, what tokenomics patterns succeed for agent-owned projects. Examples like VIRTUAL, ARC, similar.`),
    runAeonSkill("narrative-tracker", `AI agent token narrative on Base: what story resonates for agent tokens? Utility vs memecoin positioning. ${agent} ${description}`),
  ]);

  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark — retail perspective (1.0x weight) on agent token strategies.
What makes retail buy and hold an agent token?
CRITICAL: Return ONLY raw JSON.
Schema: {
  "retail_appeal": <0-10>,
  "token_type_fit": "utility|governance|memecoin|hybrid",
  "buy_trigger": "<what makes retail buy>",
  "hold_reason": "<what makes retail hold>",
  "retail_verdict": "<1 sentence>"
}`,
    messages: [{ role: "user", content: `Agent: ${agent}\nDescription: ${description}\nToken: ${token_name || "unnamed"}\nMovers: ${moversRaw ?? "agent tokens"}\nNarratives: ${narrativeRaw ?? "AI agent tokens"}` }],
    temperature: 0.4,
    maxTokens: 500,
  });
  const retail = extractJsonObject(msRaw) ?? {};

  const resultRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — token strategy engine for AI agent projects on Base.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "strategy_score": <0-100>,
  "recommended_type": "utility|governance|memecoin|hybrid",
  "tokenomics": {
    "total_supply": "<supply>",
    "allocation": {"team":"<%>","community":"<%>","treasury":"<%>","liquidity":"<%>","rewards":"<%>"},
    "vesting": "<team vesting schedule>",
    "utility": ["<token use case>"]
  },
  "narrative_angle": "<the story to tell>",
  "launch_sequence": ["<step 1>", "<step 2>", "<step 3>"],
  "comparable_agents": ["<similar successful agent token>"],
  "risks": ["<tokenomics risk>"],
  "summary": "<2 sentences>"
}`,
    messages: [{ role: "user", content: `Agent: ${agent}\nDescription: ${description}\nToken: ${token_name}\nSupply: ${total_supply}\nMovers: ${moversRaw ?? "agent tokens"}\nNarratives: ${narrativeRaw ?? "Base"}\nRetail: ${JSON.stringify(retail)}` }],
    temperature: 0.3,
    maxTokens: 1200,
  });

  const result = extractJsonObject(resultRaw);
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
  const cloned = req.clone();
  const bankrRes = await proxyTool(req, ENDPOINT);

  if (bankrRes.status !== 502) return bankrRes;

  console.log("[agent-token-strategy] Bankr 502 → falling back to local handler");
  try {
    let body: Record<string, unknown> = {};
    try { body = await cloned.json(); } catch {}
    return await handleLocally(body);
  } catch (error) {
    console.error("[agent-token-strategy] Local handler failed:", error);
    return NextResponse.json(
      { error: "Agent token strategy failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
