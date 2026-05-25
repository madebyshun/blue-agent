import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/portfolio-rebalancer";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const holdings = (body.holdings as string) ?? "";
  const risk_profile = (body.risk_profile as string) ?? "medium";
  const goal = (body.goal as string) ?? "growth";

  const [moversRaw, narrativeRaw] = await Promise.all([
    runAeonSkill("token-movers", `Base chain top performers and underperformers for portfolio rebalancing. Risk profile: ${risk_profile}.`),
    runAeonSkill("narrative-tracker", `Base chain narratives to position for: ${goal}. What sectors are gaining vs losing momentum?`),
  ]);

  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark analyst persona — portfolio allocation specialist.
Recommend rebalancing based on market signals.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "rebalance_urgency": "immediate|soon|optional|hold",
  "market_regime": "risk_on|neutral|risk_off",
  "add_exposure": ["<sector or token>"],
  "reduce_exposure": ["<sector or token>"],
  "analyst_rationale": "<2 sentences>"
}`,
    messages: [{ role: "user", content: `Holdings: ${holdings || "unspecified"}\nRisk: ${risk_profile}\nGoal: ${goal}\nMovers: ${moversRaw ?? "Base chain"}\nNarratives: ${narrativeRaw ?? "Base"}` }],
    temperature: 0.3,
    maxTokens: 600,
  });
  const analyst = extractJsonObject(msRaw) ?? {};

  const resultRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — portfolio rebalancer for Base chain assets.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "rebalance_score": <0-100>,
  "action": "REBALANCE_NOW|TRIM|ACCUMULATE|HOLD",
  "suggested_allocation": [{"asset":"<name>","current_pct":<number>,"target_pct":<number>,"action":"add|reduce|hold"}],
  "rotate_from": ["<overweight positions>"],
  "rotate_into": ["<underweight opportunities>"],
  "reasoning": "<2-3 sentences>",
  "risk_warnings": ["<warning>"],
  "summary": "<2 sentences>"
}`,
    messages: [{ role: "user", content: `Holdings: ${holdings || "unspecified"}\nRisk: ${risk_profile}\nGoal: ${goal}\nMovers: ${moversRaw ?? "Base"}\nNarratives: ${narrativeRaw ?? "Base"}\nAnalyst: ${JSON.stringify(analyst)}` }],
    temperature: 0.3,
    maxTokens: 1000,
  });

  const result = extractJsonObject(resultRaw);
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({
    tool: "portfolio-rebalancer",
    timestamp: new Date().toISOString(),
    holdings,
    risk_profile,
    goal,
    analyst,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  const cloned = req.clone();
  const bankrRes = await proxyTool(req, ENDPOINT);

  if (bankrRes.status < 500) return bankrRes; // 2xx success, 402 payment, 4xx errors pass through

  console.log("[portfolio-rebalancer] Bankr 502 → falling back to local handler");
  try {
    let body: Record<string, unknown> = {};
    try { body = await cloned.json(); } catch {}
    return await handleLocally(body);
  } catch (error) {
    console.error("[portfolio-rebalancer] Local handler failed:", error);
    return NextResponse.json(
      { error: "Portfolio rebalancer failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
