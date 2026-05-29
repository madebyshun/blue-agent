// x402/token-launch-readiness/index.ts
// Token Launch Readiness — Aeon token-movers + narrative-tracker + MiroShark retail + Blue ship
// Price: $0.50 — readiness score + GO/WAIT + action checklist before token launch
// Fully self-contained — no external workspace imports

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
    let body: { name?: string; project?: string; ticker?: string; description?: string; traction?: string } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    // Accept "project" (Hub UI) as alias for "name", "traction" as alias for "description"
    const name        = body.name ?? body.project ?? url.searchParams.get("name") ?? url.searchParams.get("project") ?? "";
    const ticker      = body.ticker ?? url.searchParams.get("ticker") ?? "";
    const description = body.description ?? body.traction ?? url.searchParams.get("description") ?? url.searchParams.get("traction") ?? "";

    if (!name) return Response.json({ error: "project name is required" }, { status: 400 });

    // Step 1+2: Aeon token-movers + narrative-tracker in parallel
    const [moversRaw, narrativeRaw] = await Promise.all([
      runAeonSkill("token-movers", "Base chain tokens, recent launches, market conditions for new token launches"),
      runAeonSkill("narrative-tracker", `narrative fit for ${name} ${ticker ? `($${ticker})` : ""}: ${description}. Which narratives support this launch?`),
    ]);

    // Step 3: MiroShark retail appetite
    const msRaw = await callBankrLLM({
      model: "claude-haiku-4-5",
      system: `You are MiroShark retail persona — FOMO-driven, focuses on price action, entry points, easy onboarding.
Evaluate retail appetite for this token launch on Base.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "stance": "bull|bear|neutral",
  "bull": <0-100>,
  "bear": <0-100>,
  "neutral": <0-100>,
  "fomo_level": "high|medium|low",
  "entry_interest": "<1 sentence>",
  "concern": "<1 sentence>",
  "viral_hook": "<what would make retail share this>"
}`,
      messages: [{ role: "user", content: `Token: ${name} ${ticker ? `($${ticker})` : ""}\n${description}\n\nMarket conditions:\n${moversRaw ?? "Base market active"}\n\nNarrative context:\n${narrativeRaw ?? "Base ecosystem"}` }],
      temperature: 0.5,
      maxTokens: 500,
    });

    const retailAppetite = extractJsonObject(msRaw) ?? { stance: "neutral", bull: 40, bear: 30, neutral: 30, fomo_level: "medium", entry_interest: "Moderate interest", concern: "Unclear differentiation", viral_hook: "Strong narrative needed" };

    // Step 4: Blue Agent ship — deployment checklist + final readiness score
    const readinessRaw = await callBankrLLM({
      model: "claude-haiku-4-5",
      system: `You are Blue Agent running the 'blue ship' command for token launches on Base.
Evaluate token launch readiness and produce a deployment checklist.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "readiness_score": <0-100>,
  "verdict": "GO|WAIT",
  "market_timing": {"score":<0-10>,"notes":"<1 sentence>"},
  "narrative_fit": {"score":<0-10>,"aligned":<boolean>,"notes":"<1 sentence>"},
  "retail_appetite": {"score":<0-10>,"notes":"<1 sentence>"},
  "checklist": [
    {"item":"<task>","status":"done|pending|critical","category":"technical|marketing|community|liquidity"}
  ],
  "blockers": ["<critical issue if any>"],
  "action_items": ["<specific next step>","<specific next step>","<specific next step>"],
  "recommended_timing": "<immediate|1-2 weeks|1 month|wait for catalyst>",
  "confidence": <0-100>
}`,
      messages: [{ role: "user", content: `Token: ${name} ${ticker ? `($${ticker})` : ""}\nDescription: ${description}\n\nAeon market conditions:\n${moversRaw ?? "Base market active"}\n\nAeon narrative fit:\n${narrativeRaw ?? "Base ecosystem"}\n\nMiroShark retail:\n${JSON.stringify(retailAppetite)}` }],
      temperature: 0.3,
      maxTokens: 1400,
    });

    const readiness = extractJsonObject(readinessRaw);
    if (!readiness) throw new Error("Failed to parse readiness result");

    return Response.json({
      tool: "token-launch-readiness",
      timestamp: new Date().toISOString(),
      token: { name, ticker: ticker || null, description },
      retail_appetite: retailAppetite,
      ...readiness,
    });
  } catch (error) {
    console.error("[TokenLaunchReadiness]", error);
    return Response.json({ error: "Token launch readiness check failed", message: (error as Error).message }, { status: 500 });
  }
}
