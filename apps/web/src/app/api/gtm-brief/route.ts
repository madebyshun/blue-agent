import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

const ENDPOINT = "https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/gtm-brief";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const project = (body.project as string) ?? (body.product as string) ?? "";
  const description = (body.description as string) ?? (body.product as string) ?? "";
  const target = (body.target as string) ?? "";

  if (!project || !description) {
    return NextResponse.json({ error: "product description is required" }, { status: 400 });
  }

  const [narrativeRaw, ideaRaw] = await Promise.all([
    runAeonSkill("narrative-tracker", `GTM narrative for ${project}: ${description}`),
    callBankrLLM({
      model: "claude-haiku-4-5",
      system: `You are Blue Agent running 'blue idea'. Expand into GTM-focused brief.
CRITICAL: Return ONLY raw JSON.
Schema: {"target_user":"<who>","pain_point":"<specific pain>","entry_wedge":"<smallest beachhead>","distribution_channel":"<primary channel>","hook":"<1 sentence why they switch>"}`,
      messages: [{ role: "user", content: `Project: ${project}\nDescription: ${description}\nTarget: ${target || "Base builders and crypto users"}` }],
      temperature: 0.4,
      maxTokens: 600,
    }),
  ]);

  const brief = extractJsonObject(ideaRaw) ?? {};

  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark — influencer(2.8x) + retail(1.0x) personas combined.
Evaluate GTM strategy from distribution perspective.
CRITICAL: Return ONLY raw JSON.
Schema: {"viral_potential":<0-10>,"distribution_fit":"strong|moderate|weak","best_channel":"<channel>","community_hooks":["<hook>"],"retail_pull":"<1 sentence>","influencer_appeal":"<1 sentence>","gtm_verdict":"<1 sentence>"}`,
    messages: [{ role: "user", content: `Project: ${project}\nDescription: ${description}\nBrief: ${JSON.stringify(brief)}\nNarratives: ${narrativeRaw ?? "Base ecosystem"}` }],
    temperature: 0.5,
    maxTokens: 600,
  });
  const distribution = extractJsonObject(msRaw) ?? {};

  const resultRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — GTM brief engine for Base builders.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "gtm_score": <0-100>,
  "positioning": "<10 words max tagline>",
  "target_segment": "<specific user>",
  "launch_channel": "<primary>",
  "distribution_playbook": ["<step 1>","<step 2>","<step 3>"],
  "narrative_angle": "<which narrative to ride>",
  "week_1_actions": ["<action>"],
  "success_metric": "<what does good look like at 30 days>",
  "community_strategy": "<1-2 sentences>",
  "avoid": ["<common GTM mistake>"]
}`,
    messages: [{ role: "user", content: `Project: ${project}\nBrief: ${JSON.stringify(brief)}\nNarratives: ${narrativeRaw ?? "Base"}\nDistribution: ${JSON.stringify(distribution)}` }],
    temperature: 0.3,
    maxTokens: 1000,
  });

  const result = extractJsonObject(resultRaw);
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({
    tool: "gtm-brief",
    timestamp: new Date().toISOString(),
    project,
    brief,
    distribution,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  const cloned = req.clone();
  const bankrRes = await proxyTool(req, ENDPOINT);

  if (bankrRes.status !== 502) return bankrRes;

  console.log("[gtm-brief] Bankr 502 → falling back to local handler");
  try {
    let body: Record<string, unknown> = {};
    try { body = await cloned.json(); } catch {}
    return await handleLocally(body);
  } catch (error) {
    console.error("[gtm-brief] Local handler failed:", error);
    return NextResponse.json(
      { error: "GTM brief failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
