// x402/launch-advisor — Full token launch playbook: tokenomics, 8-week timeline, marketing strategy, KPIs
// Price: $3.00 — Fully self-contained, no external workspace imports

type BankrMessage = { role: string; content: string };

async function callBankrLLM(opts: {
  model?: string; system: string; messages: BankrMessage[];
  temperature?: number; maxTokens?: number;
}): Promise<string> {
  const res = await fetch("https://llm.bankr.bot/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.LLM_API_KEY ?? process.env.BANKR_API_KEY ?? "",
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model ?? "claude-haiku-4-5",
      system: opts.system,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.5,
      max_tokens: opts.maxTokens ?? 1000,
    }),
  });
  if (!res.ok) throw new Error(`Bankr LLM ${res.status}: ${await res.text()}`);
  const d = await res.json() as { content?: { text: string }[]; text?: string };
  if (d.content?.length) return d.content[0].text;
  if (d.text) return d.text;
  throw new Error("Invalid Bankr LLM response");
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  let raw = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s >= 0 && e > s) raw = raw.slice(s, e + 1);
  try { return JSON.parse(raw); } catch {}
  try { return JSON.parse(raw.replace(/[\x00-\x1F\x7F]/g, " ")); } catch {}
  return null;
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: {
      projectName?: string;
      description?: string;
      targetAudience?: string;
      tokenSupply?: string;
      teamSize?: string;
      budget?: string;
    } = {};
    try {
      const text = await req.text();
      if (text && text.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}

    const { projectName, description, targetAudience } = body;
    if (!projectName || !description) {
      return Response.json({ error: "Please provide projectName and description" }, { status: 400 });
    }

    console.log(`[LaunchAdvisor] Planning launch for: ${projectName}`);

    const systemPrompt = `You are a seasoned Web3 launch strategist for Base ecosystem projects.

CRITICAL: Return ONLY raw JSON. No markdown. No backticks. Start with { and end with }.

{
  "project": "string",
  "score": <0-100 viability>,
  "verdict": "Go | Go with Conditions | No Go",
  "supply": "suggested token supply",
  "distribution": { "community": "40%", "team": "20%", "liquidity": "30%", "treasury": "10%" },
  "timeline": [
    { "phase": "Week 1-2", "focus": "string", "tasks": ["task1", "task2"] },
    { "phase": "Week 3-4", "focus": "string", "tasks": ["task1", "task2"] }
  ],
  "channels": ["marketing channel1", "channel2"],
  "kpis": { "month1": "e.g. 500 holders, $50k volume", "month3": "e.g. 2k holders, $500k volume" },
  "risks": ["risk1", "risk2"],
  "edges": ["competitive advantage1", "advantage2"],
  "summary": "2-3 sentence overview"
}`;

    const userPrompt = `Create a full launch playbook for this Base project:

Project Name: ${projectName}
Description: ${description}
Target Audience: ${targetAudience || "Base builders and traders"}
Team Size: ${body.teamSize || "Not specified"}
Budget: ${body.budget || "Not specified"}
Token Supply: ${body.tokenSupply || "Not specified"}`;

    const llmResponse = await callBankrLLM({
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0.7,
      maxTokens: 2000,
    });

    const result = extractJsonObject(llmResponse);
    if (!result) throw new Error("Failed to parse launch plan");
    return Response.json(result, { status: 200 });
  } catch (error) {
    console.error("[LaunchAdvisor] Error:", error);
    return Response.json({ error: "Failed to generate launch plan", message: (error as Error).message }, { status: 500 });
  }
}
