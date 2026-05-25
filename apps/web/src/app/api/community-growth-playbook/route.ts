import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/community-growth-playbook";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const project = (body.project as string) ?? "";
  const description = (body.description as string) ?? "";
  const current_size = (body.current_size as string) ?? "0";
  const goal = (body.goal as string) ?? "1000 members";

  if (!project) {
    return NextResponse.json({ error: "project is required" }, { status: 400 });
  }

  const narrativeRaw = await runAeonSkill("narrative-tracker", `community building strategies for ${project}: ${description}. What narratives attract communities in Base ecosystem? What makes people join and stay?`);

  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark — 4-persona community growth engine.
Personas: Analyst(1.8x), Influencer(2.8x), Retail(1.0x), Observer(0.5x).
Simulate what each persona needs to join and stay in this community.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "personas": {
    "analyst":    {"join_reason":"<why>","retention":"<what keeps them>","weight":1.8},
    "influencer": {"join_reason":"<why>","retention":"<what keeps them>","weight":2.8},
    "retail":     {"join_reason":"<why>","retention":"<what keeps them>","weight":1.0},
    "observer":   {"join_reason":"<why>","retention":"<what keeps them>","weight":0.5}
  },
  "growth_lever": "<highest impact lever>",
  "consensus_strategy": "<1-2 sentences>"
}`,
    messages: [{ role: "user", content: `Project: ${project}\nDescription: ${description}\nCurrent size: ${current_size}\nGoal: ${goal}\nNarratives: ${narrativeRaw ?? "Base ecosystem"}` }],
    temperature: 0.5,
    maxTokens: 700,
  });
  const consensus = extractJsonObject(msRaw) ?? {};

  const resultRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — community growth strategist for Base builders.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "growth_score": <0-100>,
  "phase": "cold_start|early_growth|scaling|mature",
  "channels": [{"channel":"<Telegram|Twitter|Discord|etc>","priority":"high|medium|low","tactic":"<specific tactic>"}],
  "content_pillars": ["<content theme>"],
  "engagement_loops": ["<mechanic to retain members>"],
  "milestones": [{"target":"<e.g. 100 members>","tactic":"<how to get there>","timeline":"<e.g. week 1-2>"}],
  "quick_wins": ["<action to do this week>"],
  "avoid": ["<common mistake>"],
  "summary": "<2 sentences>"
}`,
    messages: [{ role: "user", content: `Project: ${project}\nCurrent: ${current_size}\nGoal: ${goal}\nNarratives: ${narrativeRaw ?? "Base"}\nConsensus: ${JSON.stringify(consensus)}` }],
    temperature: 0.3,
    maxTokens: 1200,
  });

  const result = extractJsonObject(resultRaw);
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({
    tool: "community-growth-playbook",
    timestamp: new Date().toISOString(),
    project,
    current_size,
    goal,
    miroshark: consensus,
    ...result,
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
