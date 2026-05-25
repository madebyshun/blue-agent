import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/token-launch-readiness";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const name = (body.name as string) ?? (body.project as string) ?? "";
  const ticker = (body.ticker as string) ?? "";
  const description = (body.description as string) ?? (body.traction as string) ?? "";

  if (!name) {
    return NextResponse.json({ error: "project name is required" }, { status: 400 });
  }

  // Step 1+2: Aeon token-movers + narrative-tracker in parallel
  const [moversRaw, narrativeRaw] = await Promise.all([
    runAeonSkill("token-movers", "Base chain tokens, recent launches, market conditions for new token launches"),
    runAeonSkill("narrative-tracker", `narrative fit for ${name} ${ticker ? `($${ticker})` : ""}: ${description}. Which narratives support this launch?`),
  ]);

  // Step 3: MiroShark retail appetite
  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark retail persona — FOMO-driven, focuses on price action, entry points, easy onboarding.
Evaluate retail appetite for this token launch on Base.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "stance": "bull|bear|neutral",
  "bull": <0-100>,
  "bear": <0-100>,
  "neutral": <0-100>,
  "fomo_level": "high|medium|low",
  "entry_interest": "<1 sentence>",
  "concern": "<1 sentence>",
  "viral_hook": "<what would make retail share this>"
}`,
    messages: [{ role: "user", content: `Token: ${name} ${ticker ? `($${ticker})` : ""}\n${description}\n\nMarket conditions:\n${moversRaw ?? "Base market active"}\n\nNarrative context:\n${narrativeRaw ?? "Base ecosystem"}` }],
    temperature: 0.5,
    maxTokens: 500,
  });

  const retailAppetite = extractJsonObject(msRaw) ?? { stance: "neutral", bull: 40, bear: 30, neutral: 30, fomo_level: "medium", entry_interest: "Moderate interest", concern: "Unclear differentiation", viral_hook: "Strong narrative needed" };

  // Step 4: Blue Agent ship — deployment checklist + final readiness score
  const readinessRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent running the 'blue ship' command for token launches on Base.
Evaluate token launch readiness and produce a deployment checklist.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "readiness_score": <0-100>,
  "verdict": "GO|WAIT",
  "market_timing": {"score":<0-10>,"notes":"<1 sentence>"},
  "narrative_fit": {"score":<0-10>,"aligned":<boolean>,"notes":"<1 sentence>"},
  "retail_appetite": {"score":<0-10>,"notes":"<1 sentence>"},
  "checklist": [
    {"item":"<task>","status":"done|pending|critical","category":"technical|marketing|community|liquidity"}
  ],
  "blockers": ["<critical issue if any>"],
  "action_items": ["<specific next step>","<specific next step>","<specific next step>"],
  "recommended_timing": "<immediate|1-2 weeks|1 month|wait for catalyst>",
  "confidence": <0-100>
}`,
    messages: [{ role: "user", content: `Token: ${name} ${ticker ? `($${ticker})` : ""}\nDescription: ${description}\n\nAeon market conditions:\n${moversRaw ?? "Base market active"}\n\nAeon narrative fit:\n${narrativeRaw ?? "Base ecosystem"}\n\nMiroShark retail:\n${JSON.stringify(retailAppetite)}` }],
    temperature: 0.3,
    maxTokens: 1400,
  });

  const readiness = extractJsonObject(readinessRaw);
  if (!readiness) throw new Error("Failed to parse readiness result");

  return NextResponse.json({
    tool: "token-launch-readiness",
    timestamp: new Date().toISOString(),
    token: { name, ticker: ticker || null, description },
    retail_appetite: retailAppetite,
    ...readiness,
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
