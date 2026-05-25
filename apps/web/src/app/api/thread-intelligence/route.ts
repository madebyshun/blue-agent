import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/thread-intelligence";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const topic = (body.topic as string) ?? "";
  const audience = (body.audience as string) ?? "Base builders and crypto traders";
  const goal = (body.goal as string) ?? "engagement";

  const narrativeRaw = await runAeonSkill("narrative-tracker", `what's resonating on CT right now: ${topic || "Base ecosystem, AI agents, DeFi"}. What angles get engagement? What's being discussed?`);

  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark — influencer persona (2.8x weight).
You know what goes viral on CT. Evaluate thread potential.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "viral_potential": <0-10>,
  "best_angle": "<the hook that will work>",
  "posting_time": "<when to post: e.g. 9am EST, market open>",
  "format": "thread|single|poll|reply",
  "influencer_take": "<1-2 sentences on what makes this land>"
}`,
    messages: [{ role: "user", content: `Topic: ${topic || "Base ecosystem"}\nAudience: ${audience}\nGoal: ${goal}\nNarratives: ${narrativeRaw ?? "CT discourse"}` }],
    temperature: 0.5,
    maxTokens: 500,
  });
  const influencer = extractJsonObject(msRaw) ?? {};

  const resultRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — content intelligence engine for Base builders.
Generate actionable thread strategy.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "content_score": <0-100>,
  "recommended_angle": "<the winning take>",
  "thread_outline": ["<tweet 1>", "<tweet 2>", "<tweet 3>", "<CTA>"],
  "hook_options": ["<hook 1>", "<hook 2>", "<hook 3>"],
  "best_posting_window": "<time and day>",
  "hashtags": ["<tag>"],
  "avoid": ["<what not to say>"],
  "engagement_prediction": "viral|high|medium|low",
  "summary": "<1-2 sentences>"
}`,
    messages: [{ role: "user", content: `Topic: ${topic || "Base"}\nAudience: ${audience}\nGoal: ${goal}\nNarratives: ${narrativeRaw ?? "CT"}\nInfluencer: ${JSON.stringify(influencer)}` }],
    temperature: 0.4,
    maxTokens: 1000,
  });

  const result = extractJsonObject(resultRaw);
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({
    tool: "thread-intelligence",
    timestamp: new Date().toISOString(),
    topic,
    audience,
    goal,
    influencer,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  const cloned = req.clone();
  const bankrRes = await proxyTool(req, ENDPOINT);

  if (bankrRes.status < 500) return bankrRes; // 2xx success, 402 payment, 4xx errors pass through

  console.log("[thread-intelligence] Bankr 502 → falling back to local handler");
  try {
    let body: Record<string, unknown> = {};
    try { body = await cloned.json(); } catch {}
    return await handleLocally(body);
  } catch (error) {
    console.error("[thread-intelligence] Local handler failed:", error);
    return NextResponse.json(
      { error: "Thread intelligence failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
