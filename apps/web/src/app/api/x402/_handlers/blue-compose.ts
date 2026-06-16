// x402/blue-compose
// Blue Compose — turns a goal into a runnable chain of Blue Hub tools. Picks
// from the REAL tool catalog (AGENT_TOOLS) and orders them into a workflow with
// suggested inputs + rationale. Resilient: retry + graceful fallback.
// Price: $0.10

import { AGENT_TOOLS } from "@/lib/agent-tools";
import { NO_FABRICATION_RULE } from "@/app/api/_lib/llm";

type Msg = { role: string; content: string };
async function llm(system: string, user: string, temp = 0.3, tokens = 1100): Promise<string> {
  const r = await fetch("https://llm.bankr.bot/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.LLM_API_KEY ?? process.env.BANKR_API_KEY ?? "", "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-4-5", system: `${NO_FABRICATION_RULE}\n\n${system}`, messages: [{ role: "user", content: user }] as Msg[], temperature: temp, max_tokens: tokens }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`LLM ${r.status}`);
  const d = (await r.json()) as { content?: { text: string }[] };
  return d.content?.[0]?.text ?? "";
}
function parseJson(t: string): Record<string, unknown> | null {
  let s = t.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const i = s.indexOf("{"), j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  try { return JSON.parse(s); } catch { try { return JSON.parse(s.replace(/[\x00-\x1F]/g, " ")); } catch { return null; } }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { goal?: string } = {};
    try { const t = await req.text(); if (t.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const goal = (body.goal ?? url.searchParams.get("goal") ?? "").trim();
    if (!goal) {
      return Response.json({ error: "goal is required (what you want to accomplish on Base)." }, { status: 400 });
    }

    // Real catalog the planner may pick from.
    const catalog = AGENT_TOOLS
      .filter((t) => !!t.price)
      .map((t) => ({ id: t.id, name: t.name, category: t.category, price: t.price, desc: t.description }));
    const priceOf = new Map(catalog.map((t) => [t.id, t.price] as const));

    const system = `You are Blue Compose — plan a runnable workflow of Blue Hub tools to achieve the user's goal on Base.
You MUST only use tool ids from the provided catalog. Order them logically (research → build → audit → ship → raise, or the analog for the goal). Keep it 2-6 steps.
Return ONLY raw JSON. No markdown.
Schema: {
  "workflow": [{"step": <n>, "tool_id": "<id from catalog>", "why": "<1 sentence>", "suggested_input": "<what to pass>"}],
  "summary": "<2 sentences on the plan>"
}`;
    const user = `Goal: ${goal}\n\nTool catalog (pick tool_id ONLY from these):\n${catalog.map((t) => `- ${t.id} [${t.category}, ${t.price}] — ${t.desc}`).join("\n")}`;

    let plan: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 2 && !plan; attempt++) {
      try { plan = parseJson(await llm(system, user)); } catch { /* retry then fallback */ }
    }
    if (!plan) {
      plan = {
        workflow: [
          { step: 1, tool_id: "blue-idea", why: "Frame the concept into a fundable brief.", suggested_input: goal },
          { step: 2, tool_id: "blue-build", why: "Turn the brief into architecture + stack.", suggested_input: goal },
          { step: 3, tool_id: "blue-audit", why: "Security + product risk review before shipping.", suggested_input: "the system from step 2" },
        ],
        summary: "Live planning was briefly unavailable — this is the default idea→build→audit path. Re-run for a goal-specific chain.",
        degraded: true,
      };
    }

    // Validate tool_ids against the real catalog + attach prices / estimate cost.
    const steps = Array.isArray(plan.workflow) ? (plan.workflow as Record<string, unknown>[]) : [];
    let totalUsd = 0;
    const validated = steps.map((s) => {
      const id = String(s.tool_id ?? "");
      const known = priceOf.has(id);
      const price = priceOf.get(id) ?? null;
      if (price) totalUsd += parseFloat(price.replace("$", "")) || 0;
      return { ...s, tool_id: id, valid: known, price, endpoint: known ? `https://blueagent.dev/api/x402/${id}` : null };
    });

    return Response.json({
      tool: "blue-compose",
      timestamp: new Date().toISOString(),
      data_source: "Blue Hub catalog (real tool ids) + planner",
      goal,
      workflow: validated,
      estimated_cost: `$${totalUsd.toFixed(2)}`,
      summary: plan.summary ?? "",
      note: "Run each step via /api/x402/<tool_id> or the MCP tool of the same name. Outputs of one step feed the next.",
    });
  } catch (e) {
    return Response.json({ error: "Blue compose failed", message: (e as Error).message }, { status: 500 });
  }
}
