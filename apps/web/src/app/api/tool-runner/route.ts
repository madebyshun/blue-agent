import { NextRequest, NextResponse } from "next/server";
import {
  runBlueSkill,
  callLLM,
} from "@/app/api/_lib/llm";
import { AGENT_TOOLS, type AgentTool } from "@/lib/agent-tools";

// ─── Runners ──────────────────────────────────────────────────────────────────


export const runtime = "nodejs";
// Vercel kills serverless functions at 60s by default — explicit budget
// so it fails loudly instead of silently 504-ing.
export const maxDuration = 120;

// The "aeon" and "miroshark" branches were deleted here 2026-09-27 with the
// personas themselves. Both were already unreachable in practice: the aeon one
// needed `tool.skillId`, and `runAeonSkill` resolves through the aeon:* KV keys
// whose writer cron (api/cron/research-loop) has been unscheduled since
// 2026-09-05, so it returned null and this route answered "No result from Aeon".
async function runSingleTool(tool: AgentTool, userInput: string): Promise<string> {
  if (tool.agentType === "blue" && tool.skillFiles) {
    return (await runBlueSkill({
      task: `Run the ${tool.name} tool. Input: ${userInput}`,
      skillFiles: tool.skillFiles,
      input: userInput,
      maxTokens: 900,
    })) ?? "No result from Blue Agent";
  }
  // Bankr was banned 2026-07-18 — route through the shared Virtuals →
  // Venice → Bankr chain instead of calling Bankr directly. Return the
  // text field to preserve this function's `Promise<string>` contract.
  const r = await callLLM({
    system: `You are an AI agent assistant. Run the "${tool.name}" skill. ${tool.description}`,
    messages: [{ role: "user", content: userInput }],
    maxTokens: 800,
  });
  return r.text;
}

/* The per-step fan-out here was removed 2026-09-27, and what it was actually
   doing is worth recording, because the code read as if it did much more.

   It mapped each compositeSkill to a persona call, but only ever had branches
   for "aeon" and "miroshark" — there was NO "blue" branch, so every Blue step
   fell through to `result: ""` and was then dropped by `.filter(r => r.result)`.
   Across the catalog that was 6 contributing steps out of every composite
   tool's list; every other step contributed an empty string. The synthesis
   prompt still announced it was combining "these N intelligence reports".

   With the two personas retired, all steps would return "" and the count in
   that prompt would describe nothing at all. So the steps now go in as the
   OUTLINE they always really were — `label` names an analysis to perform, not
   a report already written — and one Blue pass does the work. Same number of
   LLM calls in the common case, minus a claim the output could not support. */
async function runCompositeTool(tool: AgentTool, userInput: string): Promise<string> {
  if (!tool.compositeSkills?.length) throw new Error("No composite skills defined");

  const outline = tool.compositeSkills.map(cs => `- ${cs.label}`).join("\n");

  const synthesis = await runBlueSkill({
    task: `Produce one unified "${tool.name}" brief. Cover each of these angles as its own section:
${outline}
Focus on: actionable insights, key patterns, what this means for the user.
Be specific and concrete. If you lack the data for an angle, say "insufficient data" for it rather than estimating.`,
    skillFiles: ["base-ecosystem.md"],
    input: `User focus: ${userInput || "general"}`,
    maxTokens: 1200,
  });

  return synthesis ?? "No result from Blue Agent";
}

// ─── POST /api/tool-runner ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body      = await req.json() as Record<string, unknown>;
    const toolId    = (body.toolId as string) ?? "";
    const userInput = (body.input  as string) ?? "";

    const tool = AGENT_TOOLS.find(t => t.id === toolId);
    if (!tool) {
      return NextResponse.json({ error: `Tool "${toolId}" not found` }, { status: 404 });
    }

    const result = tool.isComposite
      ? await runCompositeTool(tool, userInput)
      : await runSingleTool(tool, userInput);

    return NextResponse.json({
      toolId,
      toolName: tool.name,
      agentName: tool.agentName,
      isComposite: tool.isComposite,
      compositeCount: tool.compositeSkills?.length,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[tool-runner]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Tool run failed" },
      { status: 500 }
    );
  }
}

// ─── GET /api/tool-runner ─────────────────────────────────────────────────────

export async function GET() {
  return NextResponse.json({
    tools: AGENT_TOOLS,
    total: AGENT_TOOLS.length,
    composite: AGENT_TOOLS.filter(t => t.isComposite).length,
    agents: [...new Set(AGENT_TOOLS.map(t => t.agentName))],
  });
}
