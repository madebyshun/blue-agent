// x402/grant-evaluator — Base ecosystem grant scoring
// Price: $5.00 — Fully self-contained, no external workspace imports

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
      teamBackground?: string;
      requestedAmount?: string;
      milestones?: string;
      githubUrl?: string;
      websiteUrl?: string;
    } = {};
    try {
      const text = await req.text();
      if (text && text.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}

    const { projectName, description } = body;
    if (!projectName || !description) {
      return Response.json({ error: "Please provide projectName and description" }, { status: 400 });
    }

    console.log(`[GrantEvaluator] Evaluating: ${projectName}`);

    const systemPrompt = `You are a senior grants evaluator for Base ecosystem grants, using the same criteria as Base Grants and Coinbase Ventures.

CRITICAL: Return ONLY raw JSON. No markdown. No backticks. Start with { and end with }.

{
  "project": "string",
  "score": <0-100>,
  "verdict": "Fund | Fund with Conditions | Decline | Request More Info",
  "grant": "suggested size e.g. $10k-25k or Decline",
  "risk": "Low | Medium | High",
  "strengths": ["strength1", "strength2"],
  "concerns": ["concern1", "concern2"],
  "conditions": ["condition if applicable"],
  "questions": ["key question for team"],
  "summary": "2-3 sentence evaluation"
}`;

    const userPrompt = `Evaluate this Base ecosystem grant application:

Project Name: ${projectName}
Description: ${description}
Team Background: ${body.teamBackground || "Not provided"}
Requested Amount: ${body.requestedAmount || "Not specified"}
Milestones: ${body.milestones || "Not provided"}
GitHub: ${body.githubUrl || "Not provided"}
Website: ${body.websiteUrl || "Not provided"}`;

    const llmResponse = await callBankrLLM({
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0.4,
      maxTokens: 2000,
    });

    let result = extractJsonObject(llmResponse);
    if (!result) result = { degraded: true, note: "Synthesis briefly unavailable - please retry." };
    return Response.json({ ...result, disclaimer: "Grant fit/scoring is an AI assessment from model knowledge, not an official evaluation — verify current program criteria and apply through official channels." }, { status: 200 });
  } catch (error) {
    console.error("[GrantEvaluator] Error:", error);
    return Response.json({ error: "Failed to evaluate grant application", message: (error as Error).message }, { status: 500 });
  }
}
