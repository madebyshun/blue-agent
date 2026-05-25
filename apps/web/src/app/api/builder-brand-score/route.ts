import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/builder-brand-score";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const builder = (body.builder as string) ?? "";
  const project = (body.project as string) ?? "";
  const handle = (body.handle as string) ?? "";

  if (!builder && !handle) {
    return NextResponse.json({ error: "builder or handle is required" }, { status: 400 });
  }

  const target = builder || handle;

  const [researchRaw, narrativeRaw] = await Promise.all([
    runAeonSkill("deep-research", `${target}${project ? ` — ${project}` : ""}: reputation in Base/crypto ecosystem, CT presence, community standing, past projects, credibility signals.`),
    runAeonSkill("narrative-tracker", `${target} brand positioning: how are they perceived on CT? What narratives are they associated with? Brand strength in Base ecosystem.`),
  ]);

  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark — influencer persona (2.8x weight). You know who has real brand in crypto vs who is faking it.
Score this builder's brand.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "brand_tier": "S|A|B|C|D",
  "ct_presence": "dominant|strong|moderate|weak|unknown",
  "authenticity": <0-10>,
  "narrative_alignment": "<what narrative they own>",
  "influencer_verdict": "<1-2 sentences>"
}`,
    messages: [{ role: "user", content: `Builder: ${target}\nProject: ${project || "unknown"}\nResearch: ${researchRaw ?? target}\nNarratives: ${narrativeRaw ?? target}` }],
    temperature: 0.4,
    maxTokens: 500,
  });
  const influencer = extractJsonObject(msRaw) ?? {};

  const resultRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — builder brand scoring engine for Base ecosystem.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "brand_score": <0-100>,
  "tier": "S|A|B|C|D",
  "dimensions": {
    "visibility": <0-10>,
    "credibility": <0-10>,
    "community": <0-10>,
    "consistency": <0-10>,
    "narrative_ownership": <0-10>
  },
  "strengths": ["<brand strength>"],
  "gaps": ["<brand gap>"],
  "quick_wins": ["<easy action to improve brand>"],
  "brand_keywords": ["<what they're known for>"],
  "recommended_positioning": "<1-2 sentences on how to strengthen brand>",
  "summary": "<2 sentences>"
}`,
    messages: [{ role: "user", content: `Builder: ${target}\nProject: ${project || "unknown"}\nResearch: ${researchRaw ?? target}\nNarratives: ${narrativeRaw ?? target}\nInfluencer: ${JSON.stringify(influencer)}` }],
    temperature: 0.3,
    maxTokens: 1000,
  });

  const result = extractJsonObject(resultRaw);
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({
    tool: "builder-brand-score",
    timestamp: new Date().toISOString(),
    builder: target,
    project,
    influencer,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  const cloned = req.clone();
  const bankrRes = await proxyTool(req, ENDPOINT);

  if (bankrRes.status !== 502) return bankrRes;

  console.log("[builder-brand-score] Bankr 502 → falling back to local handler");
  try {
    let body: Record<string, unknown> = {};
    try { body = await cloned.json(); } catch {}
    return await handleLocally(body);
  } catch (error) {
    console.error("[builder-brand-score] Local handler failed:", error);
    return NextResponse.json(
      { error: "Builder brand score failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
