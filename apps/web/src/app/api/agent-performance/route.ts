import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/agent-performance";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const handle = (body.handle as string) ?? "";
  const repo = (body.repo as string) ?? "";

  if (!handle) {
    return NextResponse.json({ error: "handle is required" }, { status: 400 });
  }

  const [agentScoreRaw, repoHealthRaw] = await Promise.all([
    callBankrLLM({
      model: "claude-haiku-4-5",
      system: `You are Blue Agent Agent Score system. Score an AI agent.
Dimensions(total 100): skillDepth(0-25), onchainActivity(0-25), reliability(0-20), interoperability(0-20), reputation(0-10).
Tiers: 0-24=Bot, 25-49=Specialist, 50-74=Operator, 75-100=Sovereign.
CRITICAL: Return ONLY raw JSON.
Schema: {"xp":<0-100>,"tier":"Bot|Specialist|Operator|Sovereign","status":"online|offline|unknown","dimensions":{"skillDepth":<0-25>,"onchainActivity":<0-25>,"reliability":<0-20>,"interoperability":<0-20>,"reputation":<0-10>},"strengths":["<strength>"],"gaps":["<gap>"]}`,
      messages: [{ role: "user", content: `Score agent: ${handle}` }],
      temperature: 0.3,
      maxTokens: 600,
    }),
    repo ? runAeonSkill("github-monitor", `${repo} — activity health, commit velocity, open issues, docs quality`) : Promise.resolve(null),
  ]);

  const agentScore = extractJsonObject(agentScoreRaw) ?? { xp: 30, tier: "Specialist" };

  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark observer persona — neutral, records what's there.
Observe this agent's public presence and performance signals.
CRITICAL: Return ONLY raw JSON.
Schema: {"activity_level":"high|medium|low","community_presence":"strong|moderate|weak","trust_signals":["<signal>"],"concern_signals":["<concern>"],"observer_note":"<1 sentence>"}`,
    messages: [{ role: "user", content: `Agent: ${handle}\nScore: ${JSON.stringify(agentScore)}\nRepo: ${repoHealthRaw ?? "no repo data"}` }],
    temperature: 0.3,
    maxTokens: 400,
  });
  const observerTake = extractJsonObject(msRaw) ?? {};

  const resultRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — agent performance report engine.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "performance_score": <0-100>,
  "tier": "<copy from agent score>",
  "trend": "improving|stable|declining|unknown",
  "dimensions": <copy from agent score>,
  "top_strengths": ["<strength>"],
  "improvement_areas": ["<area>"],
  "recommended_next_skills": ["<skill to add>"],
  "ecosystem_standing": "leading|active|emerging|dormant",
  "report_summary": "<2-3 sentences>"
}`,
    messages: [{ role: "user", content: `Agent: ${handle}\nScore: ${JSON.stringify(agentScore)}\nRepo health: ${repoHealthRaw ?? "no data"}\nObserver: ${JSON.stringify(observerTake)}` }],
    temperature: 0.3,
    maxTokens: 900,
  });

  const result = extractJsonObject(resultRaw);
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({
    tool: "agent-performance",
    timestamp: new Date().toISOString(),
    handle,
    repo: repo || null,
    agent_score: agentScore,
    observer: observerTake,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  const cloned = req.clone();
  const bankrRes = await proxyTool(req, ENDPOINT);

  if (bankrRes.status !== 502) return bankrRes;

  console.log("[agent-performance] Bankr 502 → falling back to local handler");
  try {
    let body: Record<string, unknown> = {};
    try { body = await cloned.json(); } catch {}
    return await handleLocally(body);
  } catch (error) {
    console.error("[agent-performance] Local handler failed:", error);
    return NextResponse.json(
      { error: "Agent performance report failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
