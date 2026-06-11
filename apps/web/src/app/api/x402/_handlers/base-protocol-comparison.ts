// x402/base-protocol-comparison/index.ts
// Base Protocol Comparison — Aeon deep-research x2 + MiroShark analyst + Blue verdict
// Price: $0.50

type Msg = { role: string; content: string };
async function llm(system: string, user: string, temp = 0.4, tokens = 1000): Promise<string> {
  const r = await fetch("https://llm.bankr.bot/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.LLM_API_KEY ?? process.env.BANKR_API_KEY ?? "", "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-4-5", system, messages: [{ role: "user", content: user }] as Msg[], temperature: temp, max_tokens: tokens }),
  });
  if (!r.ok) throw new Error(`LLM ${r.status}: ${await r.text()}`);
  const d = await r.json() as { content?: { text: string }[] };
  return d.content?.[0]?.text ?? "";
}
function parseJson(t: string): Record<string, unknown> | null {
  let s = t.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const i = s.indexOf("{"), j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  try { return JSON.parse(s); } catch { try { return JSON.parse(s.replace(/[\x00-\x1F]/g, " ")); } catch { return null; } }
}
async function aeon(skill: string, focus = ""): Promise<string | null> {
  try {
    const r = await fetch(`https://raw.githubusercontent.com/aaronjmars/aeon/main/skills/${skill}/SKILL.md`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const p = await r.text();
    return await llm(`You are Aeon. Synthesize from training knowledge. Today: ${new Date().toISOString().split("T")[0]}.`,
      `Follow skill template. Be concrete.\n\nSkill:\n${p}${focus ? `\nFocus: ${focus}` : ""}\n\nReturn only skill output.`, 0.2, 1200);
  } catch { return null; }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { protocol_a?: string; protocol_b?: string; category?: string; use_case?: string } = {};
    try { const t = await req.text(); if (t.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const protocol_a = body.protocol_a ?? url.searchParams.get("protocol_a") ?? "";
    const protocol_b = body.protocol_b ?? url.searchParams.get("protocol_b") ?? "";
    const category = body.category ?? url.searchParams.get("category") ?? "";
    const use_case = body.use_case ?? url.searchParams.get("use_case") ?? "";
    if (!protocol_a) return Response.json({ error: "protocol_a is required" }, { status: 400 });

    const [resA, resB] = await Promise.all([
      aeon("deep-research", `${protocol_a} on Base: TVL, fees, security, team, audits, integrations, user growth, competitive position in ${category || "DeFi"}.`),
      protocol_b
        ? aeon("deep-research", `${protocol_b} on Base: TVL, fees, security, team, audits, integrations, user growth, competitive position in ${category || "DeFi"}.`)
        : aeon("deep-research", `Top protocols in ${category || "Base DeFi"} similar to ${protocol_a}: alternatives, comparisons, market positioning.`),
    ]);

    const msRaw = await llm(`You are MiroShark analyst persona — protocol comparison specialist.
Give analyst verdict on these protocols.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "winner": "<protocol name>",
  "margin": "clear|slight|toss-up",
  "for_use_case": "<best for ${use_case || 'general use'}>",
  "risk_delta": "<which is riskier and why>",
  "analyst_verdict": "<2 sentences>"
}`,
      `Protocol A: ${protocol_a}\nProtocol B: ${protocol_b || "alternatives"}\nCategory: ${category}\nUse case: ${use_case}\nA research: ${resA ?? protocol_a}\nB research: ${resB ?? protocol_b}`, 0.3, 500);
    const analyst = parseJson(msRaw) ?? {};

    const resultRaw = await llm(`You are Blue Agent — protocol comparison engine for Base builders and users.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "comparison_score": <0-100>,
  "recommendation": "<which to use>",
  "protocols": [
    {
      "name": "<protocol>",
      "score": <0-100>,
      "tvl": "<estimate>",
      "security": <0-10>,
      "ux": <0-10>,
      "yield": <0-10>,
      "integration_ease": <0-10>,
      "pros": ["<pro>"],
      "cons": ["<con>"]
    }
  ],
  "use_case_winner": "<best for ${use_case || 'general'}>",
  "risk_comparison": "<which is safer and why>",
  "integration_notes": "<for builders integrating these>",
  "summary": "<2 sentences>"
}`,
      `A: ${protocol_a}\nB: ${protocol_b || "alternatives"}\nCategory: ${category}\nUse case: ${use_case}\nA: ${resA ?? protocol_a}\nB: ${resB ?? protocol_b}\nAnalyst: ${JSON.stringify(analyst)}`, 0.3, 1200);

    let result = parseJson(resultRaw);
    if (!result) result = { degraded: true, note: "Synthesis briefly unavailable - please retry." };

    return Response.json({ tool: "base-protocol-comparison", timestamp: new Date().toISOString(), protocol_a, protocol_b, category, use_case, analyst, ...result });
  } catch (e) {
    return Response.json({ error: "Base protocol comparison failed", message: (e as Error).message }, { status: 500 });
  }
}
