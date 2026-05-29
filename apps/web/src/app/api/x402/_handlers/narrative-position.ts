// x402/narrative-position/index.ts
// Narrative Position — Aeon narrative-tracker + MiroShark influencer + Blue verdict
// Price: $0.25 — narrative map with position calls (FRONT-RUN / RIDE / FADE / IGNORE)
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
      maxTokens: 1400,
    });
  } catch { return null; }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { topic?: string; focus?: string } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    // Accept "focus" (Hub UI) as alias for "topic"
    const topic = body.topic ?? body.focus ?? url.searchParams.get("topic") ?? url.searchParams.get("focus") ?? "";

    const varInput = topic
      ? `Focus on "${topic}" and related Base ecosystem narratives`
      : "Base ecosystem crypto narratives, AI x crypto, DeFi, agent economy";

    // Step 1: Aeon narrative-tracker
    const narrativeRaw = await runAeonSkill("narrative-tracker", varInput);

    // Step 2: MiroShark influencer persona
    const msRaw = await callBankrLLM({
      model: "claude-haiku-4-5",
      system: `You are MiroShark influencer persona — narrative-driven, focuses on virality, social momentum, meme potential, community size.
Evaluate these narratives from an influencer/KOL perspective. Which ones would you post about?
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "top_narrative": "<name>",
  "would_post": ["<narrative name>"],
  "would_ignore": ["<narrative name>"],
  "viral_potential": {"<narrative>": <0-10>},
  "content_angles": ["<1-line angle for top narrative>"],
  "influencer_verdict": "<1-2 sentences>"
}`,
      messages: [{ role: "user", content: `Evaluate these narratives from influencer perspective:\n\n${narrativeRaw ?? "Base ecosystem narratives: AI agents, DeFi, x402 payments"}` }],
      temperature: 0.6,
      maxTokens: 600,
    });

    const influencerTake = extractJsonObject(msRaw) ?? { top_narrative: "AI x crypto", would_post: [], would_ignore: [], viral_potential: {}, content_angles: [], influencer_verdict: "Monitor for breakout signals" };

    // Step 3: Blue Agent synthesis — structured position map
    const synthesis = await callBankrLLM({
      model: "claude-haiku-4-5",
      system: `You are Blue Agent — intelligence layer for Base builders.
Parse narrative signals and produce a structured position map.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "narratives": [
    {
      "name": "<narrative>",
      "phase": "Emerging|Rising|Peak|Fading|Dead",
      "velocity": "↑↑|↑|→|↓|↓↓",
      "mindshare": <1-5>,
      "position_call": "FRONT-RUN|RIDE|FADE|WATCH|IGNORE",
      "influencer_interest": <0-10>,
      "driver": "<named catalyst>",
      "bear_case": "<1 sentence>"
    }
  ],
  "transitions": ["<narrative>: <old phase> → <new phase>"],
  "top_opportunity": "<narrative name>",
  "reflexivity_alert": "<narrative showing cope/reflexivity or null>",
  "quiet_day": <boolean>
}`,
      messages: [{ role: "user", content: `Aeon narrative signals:\n${narrativeRaw ?? "Base ecosystem narratives"}\n\nMiroShark influencer take:\n${JSON.stringify(influencerTake)}${topic ? `\n\nUser focus: ${topic}` : ""}` }],
      temperature: 0.3,
      maxTokens: 1200,
    });

    const result = extractJsonObject(synthesis);
    if (!result) throw new Error("Failed to parse narrative synthesis");

    return Response.json({
      tool: "narrative-position",
      timestamp: new Date().toISOString(),
      topic: topic || null,
      influencer_take: influencerTake,
      ...result,
    });
  } catch (error) {
    console.error("[NarrativePosition]", error);
    return Response.json({ error: "Narrative position failed", message: (error as Error).message }, { status: 500 });
  }
}
