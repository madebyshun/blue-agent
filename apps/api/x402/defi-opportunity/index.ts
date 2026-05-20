// x402/defi-opportunity/index.ts
// DeFi Opportunity Scan — Aeon defi-monitor + MiroShark analyst + Blue verdict
// Price: $0.35
// Fully self-contained

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
    let body: { strategy?: string; risk_tolerance?: string } = {};
    try { const t = await req.text(); if (t.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const { strategy = "yield", risk_tolerance = "medium" } = body;

    const defiRaw = await aeon("defi-monitor", `Base chain DeFi: ${strategy} opportunities, risk_tolerance=${risk_tolerance}. Focus on Aerodrome, Uniswap v4, Aave, active yield farms.`);

    const msRaw = await llm(`You are MiroShark analyst persona — data-driven, risk-aware.
Evaluate these DeFi opportunities on Base.
CRITICAL: Return ONLY raw JSON.
Schema: {"top_opportunity":"<protocol/pool>","risk_level":"high|medium|low","confidence":<0-10>,"smart_money_signal":"accumulating|neutral|exiting","analyst_take":"<1-2 sentences>"}`,
      `DeFi signals: ${defiRaw ?? "Base DeFi ecosystem"}\nStrategy: ${strategy}\nRisk tolerance: ${risk_tolerance}`, 0.3, 500);
    const analyst = parseJson(msRaw) ?? {};

    const resultRaw = await llm(`You are Blue Agent — DeFi opportunity scanner for Base.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "scan_score": <0-100>,
  "market_condition": "favorable|neutral|unfavorable",
  "opportunities": [
    {
      "protocol": "<name>",
      "type": "yield|lp|lending|farming|staking",
      "apy_range": "<e.g. 8-12%>",
      "risk": "high|medium|low",
      "entry": "<how to enter>",
      "watch_for": "<risk signal>"
    }
  ],
  "avoid_now": ["<protocol or strategy to avoid>"],
  "best_entry_timing": "<immediate|wait for X>",
  "summary": "<2 sentences>"
}`,
      `Strategy: ${strategy}\nRisk: ${risk_tolerance}\nDeFi monitor: ${defiRaw ?? "Base DeFi"}\nAnalyst: ${JSON.stringify(analyst)}`, 0.3, 1000);

    const result = parseJson(resultRaw);
    if (!result) throw new Error("Failed to parse result");

    return Response.json({ tool: "defi-opportunity", timestamp: new Date().toISOString(), strategy, risk_tolerance, analyst, ...result });
  } catch (e) {
    return Response.json({ error: "DeFi opportunity scan failed", message: (e as Error).message }, { status: 500 });
  }
}
