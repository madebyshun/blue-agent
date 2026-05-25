import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/market-fit";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const rawDesc = (body.description as string) ?? (body.product as string) ?? "";
  const stage = (body.stage as string) ?? "";
  const description = stage ? `${rawDesc}\n\nStage: ${stage}` : rawDesc;
  const name = (body.name as string) ?? "this project";

  if (!rawDesc) {
    return NextResponse.json({ error: "product description is required" }, { status: 400 });
  }

  // Step 1: Blue Agent — expand the idea brief
  const briefRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent running the 'blue idea' command for Base builders.
Expand a rough concept into a structured brief.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "problem": "<what problem does this solve>",
  "why_now": "<why is this the right time>",
  "why_base": "<why build on Base specifically>",
  "target_user": "<who needs this>",
  "mvp_scope": "<minimum viable version>",
  "biggest_risk": "<top risk>"
}`,
    messages: [{ role: "user", content: `Project: ${name}\n\n${description}` }],
    temperature: 0.4,
    maxTokens: 700,
  });

  const brief = extractJsonObject(briefRaw) ?? { problem: description, why_now: "Market timing unclear", why_base: "Base ecosystem alignment", target_user: "Base builders", mvp_scope: "TBD", biggest_risk: "Unclear demand" };

  // Step 2: Aeon narrative-tracker — ecosystem alignment
  const narrativeRaw = await runAeonSkill(
    "narrative-tracker",
    `relevance to: ${description}. Focus on Base ecosystem narratives that align or conflict.`
  );

  // Step 3: MiroShark 4-persona consensus
  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark — 4-persona crypto consensus engine.
Personas: Analyst(1.8x), Influencer(2.8x), Retail(1.0x), Observer(0.5x).
Each evaluates market fit for this project on Base.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "personas": {
    "analyst":    {"stance":"bull|bear|neutral","weight":1.8,"rationale":"<1 sentence>"},
    "influencer": {"stance":"bull|bear|neutral","weight":2.8,"rationale":"<1 sentence>"},
    "retail":     {"stance":"bull|bear|neutral","weight":1.0,"rationale":"<1 sentence>"},
    "observer":   {"stance":"bull|bear|neutral","weight":0.5,"rationale":"<1 sentence>"}
  },
  "bull":<0-100>,"bear":<0-100>,"neutral":<0-100>,
  "recommendation":"go|wait|skip",
  "sentiment_summary":"<1 sentence>"
}`,
    messages: [{ role: "user", content: `Evaluate market fit for:\nProject: ${name}\n${description}\n\nBrief:\n${JSON.stringify(brief)}\n\nEcosystem context:\n${narrativeRaw ?? "Base ecosystem active"}` }],
    temperature: 0.5,
    maxTokens: 800,
  });

  const consensus = extractJsonObject(msRaw) ?? { bull: 45, bear: 25, neutral: 30, recommendation: "review_needed", sentiment_summary: "Mixed signals — needs validation" };

  // Step 4: Blue Agent final verdict
  const verdictRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — final verdict engine for Base builders.
Synthesize idea brief + ecosystem signals + 4-persona consensus into a market fit verdict.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "verdict": "GO|WAIT|PIVOT",
  "score": <0-100>,
  "narrative_fit": {"aligned": <boolean>, "score": <0-10>, "note": "<1 sentence>"},
  "consensus": {"bull":<0-100>,"bear":<0-100>,"neutral":<0-100>},
  "strengths": ["<strength>","<strength>"],
  "risks": ["<risk>","<risk>","<risk>"],
  "suggested_change": "<1 specific actionable change>",
  "timing": "now|3months|6months",
  "builder_note": "<1 sentence direct advice>"
}`,
    messages: [{ role: "user", content: `Project: ${name}\n\nBrief:\n${JSON.stringify(brief)}\n\nAeon narratives:\n${narrativeRaw ?? "Base ecosystem"}\n\nMiroShark consensus:\n${JSON.stringify(consensus)}` }],
    temperature: 0.3,
    maxTokens: 900,
  });

  const verdict = extractJsonObject(verdictRaw);
  if (!verdict) throw new Error("Failed to parse verdict");

  if (verdict.consensus && typeof verdict.consensus === "object") {
    const c = verdict.consensus as Record<string, unknown>;
    c.bull = (consensus as Record<string, unknown>).bull ?? c.bull;
    c.bear = (consensus as Record<string, unknown>).bear ?? c.bear;
    c.neutral = (consensus as Record<string, unknown>).neutral ?? c.neutral;
  }

  return NextResponse.json({
    tool: "market-fit",
    timestamp: new Date().toISOString(),
    project: name,
    brief,
    miroshark: consensus,
    ...verdict,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT);
}
