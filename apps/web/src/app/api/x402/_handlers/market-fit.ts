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

async function runAeonSkill(skill: string, varInput = ""): Promise<string | null> {
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/aaronjmars/aeon/main/skills/${skill}/SKILL.md`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return null;
    const skillPrompt = await res.text();
    const today = new Date().toISOString().split("T")[0];
    const varLine = varInput ? `\nFocus on: ${varInput}` : "";
    return await callBankrLLM({
      model: "claude-haiku-4-5",
      system: `You are Aeon — autonomous intelligence agent. Synthesize from training knowledge. Be specific. Today is ${today}.`,
      messages: [{ role: "user", content: `Follow skill template. Generate from training knowledge.\n\nSkill:\n${skillPrompt}${varLine}\n\nReturn only the skill output.` }],
      temperature: 0.2,
      maxTokens: 1200,
    });
  } catch { return null; }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { description?: string; product?: string; project?: string; name?: string; stage?: string } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const rawDesc = body.description ?? body.product ?? body.project ?? url.searchParams.get("description") ?? url.searchParams.get("product") ?? url.searchParams.get("project") ?? "";
    const stage   = body.stage ?? url.searchParams.get("stage") ?? "";
    const description = stage ? `${rawDesc}\n\nStage: ${stage}` : rawDesc;
    const name = body.name ?? url.searchParams.get("name") ?? "this project";

    if (!rawDesc) return Response.json({ error: "product description is required" }, { status: 400 });

    const briefRaw = await callBankrLLM({
      model: "claude-haiku-4-5",
      system: `You are Blue Agent running the 'blue idea' command for Base builders.
Expand a rough concept into a structured brief.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "problem": "<what problem does this solve>",
  "why_now": "<why is this the right time>",
  "why_base": "<why build on Base specifically>",
  "target_user": "<who needs this>",
  "mvp_scope": "<minimum viable version>",
  "biggest_risk": "<top risk>"
}`,
      messages: [{ role: "user", content: `Project: ${name}\n\n${description}` }],
      temperature: 0.4,
      maxTokens: 700,
    });

    const brief = extractJsonObject(briefRaw) ?? { problem: description, why_now: "Market timing unclear", why_base: "Base ecosystem alignment", target_user: "Base builders", mvp_scope: "TBD", biggest_risk: "Unclear demand" };

    const narrativeRaw = await runAeonSkill(
      "narrative-tracker",
      `relevance to: ${description}. Focus on Base ecosystem narratives that align or conflict.`
    );

    const msRaw = await callBankrLLM({
      model: "claude-haiku-4-5",
      system: `You are MiroShark — 4-persona crypto consensus engine.
Personas: Analyst(1.8x), Influencer(2.8x), Retail(1.0x), Observer(0.5x).
Each evaluates market fit for this project on Base.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "personas": {
    "analyst":    {"stance":"bull|bear|neutral","weight":1.8,"rationale":"<1 sentence>"},
    "influencer": {"stance":"bull|bear|neutral","weight":2.8,"rationale":"<1 sentence>"},
    "retail":     {"stance":"bull|bear|neutral","weight":1.0,"rationale":"<1 sentence>"},
    "observer":   {"stance":"bull|bear|neutral","weight":0.5,"rationale":"<1 sentence>"}
  },
  "bull":<0-100>,"bear":<0-100>,"neutral":<0-100>,
  "recommendation":"go|wait|skip",
  "sentiment_summary":"<1 sentence>"
}`,
      messages: [{ role: "user", content: `Evaluate market fit for:\nProject: ${name}\n${description}\n\nBrief:\n${JSON.stringify(brief)}\n\nEcosystem context:\n${narrativeRaw ?? "Base ecosystem active"}` }],
      temperature: 0.5,
      maxTokens: 800,
    });

    const consensus = extractJsonObject(msRaw) ?? { bull: 45, bear: 25, neutral: 30, recommendation: "review_needed", sentiment_summary: "Mixed signals — needs validation" };

    const verdictRaw = await callBankrLLM({
      model: "claude-haiku-4-5",
      system: `You are Blue Agent — final verdict engine for Base builders.
Synthesize idea brief + ecosystem signals + 4-persona consensus into a market fit verdict.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "verdict": "GO|WAIT|PIVOT",
  "score": <0-100>,
  "narrative_fit": {"aligned": <boolean>, "score": <0-10>, "note": "<1 sentence>"},
  "consensus": {"bull":<0-100>,"bear":<0-100>,"neutral":<0-100>},
  "strengths": ["<strength>","<strength>"],
  "risks": ["<risk>","<risk>","<risk>"],
  "suggested_change": "<1 specific actionable change>",
  "timing": "now|3months|6months",
  "builder_note": "<1 sentence direct advice>"
}`,
      messages: [{ role: "user", content: `Project: ${name}\n\nBrief:\n${JSON.stringify(brief)}\n\nAeon narratives:\n${narrativeRaw ?? "Base ecosystem"}\n\nMiroShark consensus:\n${JSON.stringify(consensus)}` }],
      temperature: 0.3,
      maxTokens: 900,
    });

    const verdict = extractJsonObject(verdictRaw);
    if (!verdict) throw new Error("Failed to parse verdict");

    if (verdict.consensus && typeof verdict.consensus === "object") {
      const c = verdict.consensus as Record<string, unknown>;
      c.bull = (consensus as Record<string, unknown>).bull ?? c.bull;
      c.bear = (consensus as Record<string, unknown>).bear ?? c.bear;
      c.neutral = (consensus as Record<string, unknown>).neutral ?? c.neutral;
    }

    return Response.json({
      tool: "market-fit",
      timestamp: new Date().toISOString(),
      project: name,
      brief,
      miroshark: consensus,
      ...verdict,
    });
  } catch (error) {
    console.error("[MarketFit]", error);
    return Response.json({ error: "Market fit validation failed", message: (error as Error).message }, { status: 500 });
  }
}
