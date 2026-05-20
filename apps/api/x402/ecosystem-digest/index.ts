// x402/ecosystem-digest/index.ts
// Weekly Ecosystem Digest — Aeon token-movers + narrative-tracker + MiroShark observer + Blue synthesis
// Price: $0.20 — weekly Base ecosystem recap
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
    // Step 1+2: Aeon token-movers (Base) + narrative-tracker in parallel
    const [moversRaw, narrativeRaw] = await Promise.all([
      runAeonSkill("token-movers", "Base chain ecosystem tokens, chain=base, min_mcap=$1M"),
      runAeonSkill("narrative-tracker", "Base ecosystem, AI agents, DeFi, builder economy"),
    ]);

    // Step 3: MiroShark observer — neutral temperature check
    const msRaw = await callBankrLLM({
      model: "claude-haiku-4-5",
      system: `You are MiroShark observer persona — neutral recorder, no strong bias, synthesizes what others say.
Record the community temperature for the Base ecosystem this week.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "temperature": "hot|warm|neutral|cool|cold",
  "bull": <0-100>,
  "bear": <0-100>,
  "neutral": <0-100>,
  "community_mood": "<1 sentence>",
  "notable_events": ["<event>"],
  "builder_activity": "high|medium|low",
  "what_observers_say": "<1-2 sentences>"
}`,
      messages: [{ role: "user", content: `Base ecosystem this week:\n\nToken movers:\n${moversRaw ?? "Base tokens active"}\n\nNarratives:\n${narrativeRaw ?? "AI agents, DeFi narratives active"}` }],
      temperature: 0.4,
      maxTokens: 500,
    });

    const observerTake = extractJsonObject(msRaw) ?? { temperature: "neutral", bull: 40, bear: 30, neutral: 30, community_mood: "Steady builder activity", notable_events: [], builder_activity: "medium", what_observers_say: "Base ecosystem continuing to grow" };

    // Step 4: Blue Agent final digest synthesis
    const synthesis = await callBankrLLM({
      model: "claude-haiku-4-5",
      system: `You are Blue Agent — AI-native intelligence for Base builders.
Produce a concise weekly digest of the Base ecosystem.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "headline": "<1 sentence digest headline>",
  "movers": [{"token":"<symbol>","change":"<+/-%>","note":"<1 sentence>"}],
  "narratives": [{"name":"<narrative>","phase":"Emerging|Rising|Peak|Fading","key_point":"<1 sentence>"}],
  "community": {"temperature":"<hot/warm/neutral/cool/cold>","bull":<0-100>,"bear":<0-100>,"neutral":<0-100>},
  "what_moved": ["<key event or trend>"],
  "what_matters": ["<actionable insight>"],
  "what_to_watch": ["<upcoming catalyst or risk>"],
  "builder_signal": "<1 sentence for builders>",
  "week_rating": <1-10>
}`,
      messages: [{ role: "user", content: `Aeon token-movers:\n${moversRaw ?? "Base tokens"}\n\nAeon narratives:\n${narrativeRaw ?? "Base narratives"}\n\nMiroShark observer:\n${JSON.stringify(observerTake)}` }],
      temperature: 0.3,
      maxTokens: 1200,
    });

    const result = extractJsonObject(synthesis);
    if (!result) throw new Error("Failed to parse digest");

    return Response.json({
      tool: "ecosystem-digest",
      timestamp: new Date().toISOString(),
      period: "weekly",
      observer: observerTake,
      ...result,
    });
  } catch (error) {
    console.error("[EcosystemDigest]", error);
    return Response.json({ error: "Ecosystem digest failed", message: (error as Error).message }, { status: 500 });
  }
}
