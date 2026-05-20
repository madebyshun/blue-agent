// x402/portfolio-rebalancer/index.ts
// Portfolio Rebalancer — Aeon token-movers + Aeon narrative-tracker + MiroShark analyst + Blue verdict
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
    let body: { holdings?: string; risk_profile?: string; goal?: string } = {};
    try { const t = await req.text(); if (t.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const holdings = body.holdings ?? url.searchParams.get("holdings") ?? "";
    const risk_profile = body.risk_profile ?? url.searchParams.get("risk_profile") ?? "medium";
    const goal = body.goal ?? url.searchParams.get("goal") ?? "growth";

    const [moversRaw, narrativeRaw] = await Promise.all([
      aeon("token-movers", `Base chain top performers and underperformers for portfolio rebalancing. Risk profile: ${risk_profile}.`),
      aeon("narrative-tracker", `Base chain narratives to position for: ${goal}. What sectors are gaining vs losing momentum?`),
    ]);

    const msRaw = await llm(`You are MiroShark analyst persona — portfolio allocation specialist.
Recommend rebalancing based on market signals.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "rebalance_urgency": "immediate|soon|optional|hold",
  "market_regime": "risk_on|neutral|risk_off",
  "add_exposure": ["<sector or token>"],
  "reduce_exposure": ["<sector or token>"],
  "analyst_rationale": "<2 sentences>"
}`,
      `Holdings: ${holdings || "unspecified"}\nRisk: ${risk_profile}\nGoal: ${goal}\nMovers: ${moversRaw ?? "Base chain"}\nNarratives: ${narrativeRaw ?? "Base"}`, 0.3, 600);
    const analyst = parseJson(msRaw) ?? {};

    const resultRaw = await llm(`You are Blue Agent — portfolio rebalancer for Base chain assets.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "rebalance_score": <0-100>,
  "action": "REBALANCE_NOW|TRIM|ACCUMULATE|HOLD",
  "suggested_allocation": [{"asset":"<name>","current_pct":<number>,"target_pct":<number>,"action":"add|reduce|hold"}],
  "rotate_from": ["<overweight positions>"],
  "rotate_into": ["<underweight opportunities>"],
  "reasoning": "<2-3 sentences>",
  "risk_warnings": ["<warning>"],
  "summary": "<2 sentences>"
}`,
      `Holdings: ${holdings || "unspecified"}\nRisk: ${risk_profile}\nGoal: ${goal}\nMovers: ${moversRaw ?? "Base"}\nNarratives: ${narrativeRaw ?? "Base"}\nAnalyst: ${JSON.stringify(analyst)}`, 0.3, 1000);

    const result = parseJson(resultRaw);
    if (!result) throw new Error("Failed to parse result");

    return Response.json({ tool: "portfolio-rebalancer", timestamp: new Date().toISOString(), holdings, risk_profile, goal, analyst, ...result });
  } catch (e) {
    return Response.json({ error: "Portfolio rebalancer failed", message: (e as Error).message }, { status: 500 });
  }
}
