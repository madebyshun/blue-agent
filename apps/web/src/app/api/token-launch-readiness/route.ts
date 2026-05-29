import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { extractJsonObject, runAeonSkill, runMiroSharkSkill, runBlueSkill } from "@/app/api/_lib/llm";

export const runtime = "nodejs";
export const maxDuration = 120;

const ENDPOINT = "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/token-launch-readiness";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const name        = (body.name as string)        ?? (body.project as string)  ?? "";
  const ticker      = (body.ticker as string)      ?? "";
  const description = (body.description as string) ?? (body.traction as string) ?? "";

  if (!name) {
    return NextResponse.json({ error: "project name is required" }, { status: 400 });
  }

  // Step 1+2: Aeon token-movers + narrative-tracker in parallel
  const [moversRaw, narrativeRaw] = await Promise.all([
    runAeonSkill("token-movers", "Base chain tokens, recent launches, market conditions for new token launches"),
    runAeonSkill("narrative-tracker", `narrative fit for ${name}${ticker ? ` ($${ticker})` : ""}: ${description}. Which narratives support this launch?`),
  ]);

  // Step 3: MiroShark — retail crowd simulation on launch appetite
  const msRaw = await runMiroSharkSkill({
    scenario: `Token launch evaluation: ${name}${ticker ? ` ($${ticker})` : ""} — ${description}`,
    context: {
      token: name,
      ticker: ticker || null,
      description,
      market_conditions: moversRaw ?? "Base market active",
      narrative_context: narrativeRaw ?? "Base ecosystem",
    },
    persona: "retail — FOMO-driven, price action focused, easy onboarding",
    outputSchema: `{
  "stance": "bull|bear|neutral",
  "bull": <0-100>,
  "bear": <0-100>,
  "neutral": <0-100>,
  "fomo_level": "high|medium|low",
  "entry_interest": "<1 sentence>",
  "concern": "<1 sentence>",
  "viral_hook": "<what would make retail share this>"
}`,
    maxTokens: 600,
  });

  const retailAppetite = extractJsonObject(msRaw ?? "") ?? { stance: "neutral", bull: 40, bear: 30, neutral: 30, fomo_level: "medium", entry_interest: "Moderate interest", concern: "Unclear differentiation", viral_hook: "Strong narrative needed" };

  // Step 4: Blue Agent — token launch readiness using real skills
  const readinessRaw = await runBlueSkill({
    task: `Run 'blue ship' for a token launch on Base. Evaluate readiness and produce a deployment checklist.
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
    skillFiles: ["token-launch-guide.md", "base-ecosystem.md", "base-addresses.md"],
    input: `Token: ${name}${ticker ? ` ($${ticker})` : ""}\nDescription: ${description}\n\nAeon market conditions:\n${moversRaw ?? "Base market active"}\n\nAeon narrative fit:\n${narrativeRaw ?? "Base ecosystem"}\n\nMiroShark retail simulation:\n${JSON.stringify(retailAppetite)}`,
    maxTokens: 1400,
  });

  const readiness = extractJsonObject(readinessRaw ?? "");
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
  return proxyTool(req, ENDPOINT, handleLocally);
}
