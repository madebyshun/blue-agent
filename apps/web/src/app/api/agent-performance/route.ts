import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { extractJsonObject, runAeonSkill, runMiroSharkSkill, runBlueSkill } from "@/app/api/_lib/llm";

export const runtime = "nodejs";
export const maxDuration = 120;

const ENDPOINT = "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/agent-performance";

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const handle = (body.handle as string) ?? "";
  const repo = (body.repo as string) ?? "";

  if (!handle) {
    return NextResponse.json({ error: "handle is required" }, { status: 400 });
  }

  // Step 1+2: Aeon parallel — agent research + repo health (or ecosystem context)
  const [agentResearchRaw, repoHealthRaw] = await Promise.all([
    runAeonSkill("deep-research", `AI agent ${handle}: capabilities, onchain activity on Base, skill depth, community presence, reliability signals, reputation in Base/crypto ecosystem.`),
    repo
      ? runAeonSkill("deep-research", `${repo} GitHub repo: activity health, commit velocity, open issues, docs quality, contributor activity.`)
      : runAeonSkill("narrative-tracker", `AI agent economy on Base: agent performance benchmarks, what makes a top-tier agent, metrics for evaluating ${handle}.`),
  ]);

  // Step 3: MiroShark — analyst persona on agent performance
  const msRaw = await runMiroSharkSkill({
    scenario: `Evaluate AI agent ${handle} — performance, trust signals, ecosystem standing`,
    context: {
      handle,
      repo: repo || null,
      agent_research: agentResearchRaw ?? handle,
      repo_health: repoHealthRaw ?? "no repo data",
    },
    persona: "analyst — evaluates agent economics, token utility, market positioning",
    outputSchema: `{"activity_level":"high|medium|low","community_presence":"strong|moderate|weak","trust_signals":["<signal>"],"concern_signals":["<concern>"],"observer_note":"<1 sentence>"}`,
    maxTokens: 400,
  });
  const observerTake = extractJsonObject(msRaw ?? "") ?? {};

  // Step 4: Blue Agent synthesis — agent performance report
  const resultRaw = await runBlueSkill({
    task: "Generate a comprehensive agent performance report with XP scoring. CRITICAL: Return ONLY raw JSON. No markdown.",
    skillFiles: ["base-ecosystem.md"],
    input: `Agent: ${handle}\nRepo: ${repo || "none"}\nAgent research: ${agentResearchRaw ?? handle}\nRepo health: ${repoHealthRaw ?? "no data"}\nObserver: ${JSON.stringify(observerTake)}`,
    outputSchema: `{"performance_score":<0-100>,"xp":<0-100>,"tier":"Bot|Specialist|Operator|Sovereign","trend":"improving|stable|declining|unknown","dimensions":{"skillDepth":<0-25>,"onchainActivity":<0-25>,"reliability":<0-20>,"interoperability":<0-20>,"reputation":<0-10>},"top_strengths":["<strength>"],"improvement_areas":["<area>"],"recommended_next_skills":["<skill to add>"],"ecosystem_standing":"leading|active|emerging|dormant","report_summary":"<2-3 sentences>"}`,
    maxTokens: 900,
  });

  const result = extractJsonObject(resultRaw ?? "");
  if (!result) throw new Error("Failed to parse result");

  return NextResponse.json({
    tool: "agent-performance",
    timestamp: new Date().toISOString(),
    handle,
    repo: repo || null,
    observer: observerTake,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT, handleLocally);
}
