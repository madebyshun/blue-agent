// x402/token-pick-signal/index.ts
// Token Pick Signal — Aeon token-movers + token-pick + MiroShark retail
// Price: $0.20 — one actionable token pick with retail consensus
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
      system: `You are Aeon — autonomous intelligence agent. Synthesize from training knowledge. Be specific, data-driven. Today is ${today}.`,
      messages: [{ role: "user", content: `Follow this skill template. Generate from training knowledge — no API excuses. Be concrete.\n\nSkill:\n${skillPrompt}${varLine}\n\nReturn only the skill output.` }],
      temperature: 0.2,
      maxTokens: 1200,
    });
  } catch { return null; }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { chain?: string; min_mcap?: number } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const chain = body.chain ?? url.searchParams.get("chain") ?? "base";
    const minMcap = body.min_mcap ?? Number(url.searchParams.get("min_mcap") ?? "1000000");

    const varInput = `chain=${chain}, min_mcap=$${minMcap.toLocaleString()}, focus on Base ecosystem tokens`;

    // Step 1 + 2: Run Aeon token-movers and token-pick in parallel
    const [moversRaw, pickRaw] = await Promise.all([
      runAeonSkill("token-movers", varInput),
      runAeonSkill("token-pick", `${varInput}. Today's date: ${new Date().toISOString().split("T")[0]}`),
    ]);

    // Step 3: MiroShark retail persona on the pick
    const pickContext = pickRaw ?? "No specific pick available today — market conditions unclear";
    const msRaw = await callBankrLLM({
      model: "claude-haiku-4-5",
      system: `You are MiroShark retail persona — FOMO-driven, focuses on price action, entry points, ease of use.
Evaluate this token pick from a retail trader perspective.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {"stance":"bull|bear|neutral","bull":<0-100>,"bear":<0-100>,"neutral":<0-100>,"rationale":"<1-2 sentences>","entry_advice":"<1 sentence>","risk_warning":"<1 sentence>"}`,
      messages: [{ role: "user", content: `Retail sentiment on this token pick:\n\n${pickContext}\n\nMarket movers context:\n${moversRaw ?? "No movers data"}` }],
      temperature: 0.5,
      maxTokens: 400,
    });

    const retailConsensus = extractJsonObject(msRaw) ?? { stance: "neutral", bull: 40, bear: 30, neutral: 30, rationale: "Mixed signals", entry_advice: "Wait for confirmation", risk_warning: "High volatility" };

    // Step 4: Blue Agent final synthesis
    const isNoPick = !pickRaw || pickRaw.includes("NO_PICK");
    const synthesis = await callBankrLLM({
      model: "claude-haiku-4-5",
      system: `You are Blue Agent — AI-native intelligence for Base builders and agents.
Synthesize Aeon token signal + MiroShark retail consensus into a final actionable verdict.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "no_pick": <boolean>,
  "pick": {
    "token": "<symbol or null>",
    "thesis": "<1 sentence or null>",
    "entry": "<price + venue or null>",
    "kill_criterion": "<1 sentence or null>",
    "sizing": "small|medium|large|null",
    "horizon": "<hours/days/weeks or null>"
  },
  "near_misses": ["<token: reason>" or empty array],
  "retail_consensus": {"bull":<0-100>,"bear":<0-100>,"neutral":<0-100>,"stance":"bull|bear|neutral"},
  "risk_flags": ["<flag>" or empty array],
  "blue_verdict": "BUY|WATCH|SKIP|NO_PICK",
  "confidence": <0-100>,
  "note": "<1 sentence context>"
}`,
      messages: [{ role: "user", content: `Aeon token-movers:\n${moversRaw ?? "unavailable"}\n\nAeon token-pick:\n${pickRaw ?? "NO_PICK"}\n\nMiroShark retail:\n${JSON.stringify(retailConsensus)}` }],
      temperature: 0.3,
      maxTokens: 800,
    });

    const result = extractJsonObject(synthesis);
    if (!result) throw new Error("Failed to parse synthesis");

    if (result.retail_consensus && typeof result.retail_consensus === "object") {
      const rc = result.retail_consensus as Record<string, unknown>;
      rc.bull = (retailConsensus as Record<string, unknown>).bull ?? rc.bull;
      rc.bear = (retailConsensus as Record<string, unknown>).bear ?? rc.bear;
      rc.neutral = (retailConsensus as Record<string, unknown>).neutral ?? rc.neutral;
    }

    return Response.json({
      tool: "token-pick-signal",
      timestamp: new Date().toISOString(),
      chain,
      no_pick: isNoPick,
      ...result,
    });
  } catch (error) {
    console.error("[TokenPickSignal]", error);
    return Response.json({ error: "Token pick signal failed", message: (error as Error).message }, { status: 500 });
  }
}
