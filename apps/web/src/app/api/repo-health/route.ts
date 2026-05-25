import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/repo-health";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const repo = (body.repo as string) ?? "";
  const description = (body.description as string) ?? "";

  if (!repo) {
    return NextResponse.json({ error: "repo is required (e.g. 'user/repo' or full GitHub URL)" }, { status: 400 });
  }

  const [repoMonitor, auditRaw] = await Promise.all([
    runAeonSkill("github-monitor", `${repo}: commit velocity, issues, docs quality, test coverage signals, last activity`),
    callBankrLLM({
      model: "claude-haiku-4-5",
      system: `You are Blue Agent running 'blue audit'. Assess code quality and security signals for a Base project repo.
CRITICAL: Return ONLY raw JSON.
Schema: {"code_quality_score":<0-10>,"security_concerns":["<concern or 'none identified'>"],"missing_basics":["<e.g. no tests, no .env.example>"],"positive_signals":["<good practice found>"],"audit_note":"<1 sentence>"}`,
      messages: [{ role: "user", content: `Repo: ${repo}\nDescription: ${description || "Base project"}` }],
      temperature: 0.3,
      maxTokens: 600,
    }),
  ]);

  const audit = extractJsonObject(auditRaw) ?? {};

  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark analyst persona.
Review repo health signals from a technical investor perspective.
CRITICAL: Return ONLY raw JSON.
Schema: {"health_rating":"excellent|good|fair|poor","shipping_velocity":"high|medium|low|stalled","trust_score":<0-10>,"red_flags":["<flag>"],"green_flags":["<flag>"],"analyst_note":"<1 sentence>"}`,
    messages: [{ role: "user", content: `Repo: ${repo}\nMonitor: ${repoMonitor ?? "Base project repo"}\nAudit: ${JSON.stringify(audit)}` }],
    temperature: 0.3,
    maxTokens: 500,
  });
  const analyst = extractJsonObject(msRaw) ?? {};

  const resultRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — repo health report engine.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "health_score": <0-100>,
  "grade": "A|B|C|D|F",
  "status": "healthy|needs_attention|at_risk|stalled",
  "dimensions": {
    "activity": <0-10>,
    "code_quality": <0-10>,
    "documentation": <0-10>,
    "security": <0-10>,
    "community": <0-10>
  },
  "critical_issues": ["<issue>"],
  "quick_wins": ["<easy fix>"],
  "summary": "<2 sentences>"
}`,
    messages: [{ role: "user", content: `Repo: ${repo}\nMonitor: ${repoMonitor ?? "Base project"}\nAudit: ${JSON.stringify(audit)}\nAnalyst: ${JSON.stringify(analyst)}` }],
    temperature: 0.3,
    maxTokens: 900,
  });

  const result = extractJsonObject(resultRaw);
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({
    tool: "repo-health",
    timestamp: new Date().toISOString(),
    repo,
    audit,
    analyst,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  const cloned = req.clone();
  const bankrRes = await proxyTool(req, ENDPOINT);

  if (bankrRes.status !== 502) return bankrRes;

  console.log("[repo-health] Bankr 502 → falling back to local handler");
  try {
    let body: Record<string, unknown> = {};
    try { body = await cloned.json(); } catch {}
    return await handleLocally(body);
  } catch (error) {
    console.error("[repo-health] Local handler failed:", error);
    return NextResponse.json(
      { error: "Repo health check failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
