import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/builder-deep-dd";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const target = (body.target as string) ?? "";
  const type = (body.type as string) ?? "project";
  const context = (body.context as string) ?? "";

  if (!target) {
    return NextResponse.json({ error: "target is required (builder handle, project name, or GitHub repo)" }, { status: 400 });
  }

  // Step 1+2: Aeon deep-research x2 — project + team/background in parallel
  const [projectResearch, backgroundResearch] = await Promise.all([
    runAeonSkill("deep-research", `${target}: ${context}. Comprehensive analysis — product, traction, market position, on-chain activity on Base, funding history, partnerships.`),
    runAeonSkill("deep-research", `${target} team/builder background: track record, previous projects, credibility signals, red flags, community standing in Base/crypto ecosystem.`),
  ]);

  // Step 3: Blue audit — code/product quality signals
  const auditRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent running 'blue audit'. Assess product and technical quality signals.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "product_score": <0-10>,
  "technical_credibility": <0-10>,
  "shipping_evidence": ["<evidence of shipping>"],
  "security_concerns": ["<concern or 'none identified'>"],
  "open_source": <boolean>,
  "audit_verdict": "<1-2 sentences>"
}`,
    messages: [{ role: "user", content: `Target: ${target}\nType: ${type}\nContext: ${context}\nResearch: ${projectResearch ?? target}` }],
    temperature: 0.3,
    maxTokens: 700,
  });
  const audit = extractJsonObject(auditRaw) ?? {};

  // Step 4: MiroShark analyst — investment/collaboration grade
  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark analyst persona — data-driven, skeptical, fundamentals-focused.
Perform analyst-grade due diligence assessment.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "grade": "A|B|C|D|F",
  "conviction": "high|medium|low",
  "bull_case": "<2 sentences>",
  "bear_case": "<2 sentences>",
  "key_risks": ["<risk>"],
  "key_strengths": ["<strength>"],
  "comparable": "<similar project or builder>",
  "analyst_verdict": "<2-3 sentences>"
}`,
    messages: [{ role: "user", content: `Target: ${target}\nProject research: ${projectResearch ?? target}\nBackground: ${backgroundResearch ?? target}\nAudit: ${JSON.stringify(audit)}` }],
    temperature: 0.3,
    maxTokens: 800,
  });
  const analyst = extractJsonObject(msRaw) ?? {};

  // Step 5: Blue Agent final DD synthesis
  const resultRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — deep due diligence engine for Base builders and investors.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "dd_score": <0-100>,
  "verdict": "STRONG_BUY|BUY|WATCH|PASS|RED_FLAG",
  "confidence": <0-100>,
  "summary": "<3-4 sentences comprehensive summary>",
  "thesis": "<investment/collaboration thesis in 2 sentences>",
  "strengths": ["<strength>"],
  "risks": ["<risk>"],
  "red_flags": ["<red flag or 'none'>"],
  "due_diligence_checklist": [{"item":"<check>","status":"pass|fail|unknown","note":"<brief note>"}],
  "recommended_action": "<specific next step>",
  "open_questions": ["<question to answer before deciding>"]
}`,
    messages: [{ role: "user", content: `Target: ${target}\nType: ${type}\nProject: ${projectResearch ?? target}\nBackground: ${backgroundResearch ?? target}\nAudit: ${JSON.stringify(audit)}\nAnalyst: ${JSON.stringify(analyst)}` }],
    temperature: 0.3,
    maxTokens: 1500,
  });

  const result = extractJsonObject(resultRaw);
  if (!result) throw new Error("Failed to parse DD result");

  return NextResponse.json({
    tool: "builder-deep-dd",
    timestamp: new Date().toISOString(),
    target,
    type,
    audit,
    analyst,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  const cloned = req.clone();
  const bankrRes = await proxyTool(req, ENDPOINT);

  if (bankrRes.status !== 502) return bankrRes;

  console.log("[builder-deep-dd] Bankr 502 → falling back to local handler");
  try {
    let body: Record<string, unknown> = {};
    try { body = await cloned.json(); } catch {}
    return await handleLocally(body);
  } catch (error) {
    console.error("[builder-deep-dd] Local handler failed:", error);
    return NextResponse.json(
      { error: "Builder deep DD failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
