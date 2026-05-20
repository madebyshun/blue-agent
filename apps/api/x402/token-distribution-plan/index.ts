// x402/token-distribution-plan/index.ts
// Token Distribution Plan — Aeon token-movers + MiroShark retail + Blue raise
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
      `Follow skill template. Be concrete.\n\nSkill:\n${p}${focus ? `\nFocus: ${focus}` : ""}\n\nReturn only skill output.`, 0.2, 1000);
  } catch { return null; }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { token?: string; ticker?: string; total_supply?: number; description?: string } = {};
    try { const t = await req.text(); if (t.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const { token = "", ticker = "", total_supply = 1000000000, description = "" } = body;
    if (!token) return Response.json({ error: "token is required" }, { status: 400 });

    const moversRaw = await aeon("token-movers", "Base token distributions, successful tokenomics patterns, community allocations");

    const msRaw = await llm(`You are MiroShark retail persona.
What distribution do retail holders expect and respond well to?
CRITICAL: Return ONLY raw JSON.
Schema: {"preferred_allocation":{"community_pct":<0-100>,"team_pct":<0-100>,"treasury_pct":<0-100>,"lp_pct":<0-100>},"airdrop_preference":"yes|no|maybe","vesting_tolerance":"strict|moderate|loose","retail_verdict":"<1 sentence>"}`,
      `Token: ${token} ${ticker ? `($${ticker})` : ""}\nDescription: ${description}\nMarket context: ${moversRaw ?? "Base ecosystem"}`, 0.4, 500);
    const retailPref = parseJson(msRaw) ?? {};

    const resultRaw = await llm(`You are Blue Agent — tokenomics and distribution planning engine for Base.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "distribution_score": <0-100>,
  "allocation": {
    "community": {"pct":<0-100>,"vesting":"<e.g. no vesting>","purpose":"<1 sentence>"},
    "team": {"pct":<0-100>,"vesting":"<e.g. 2yr cliff + 2yr linear>","purpose":"<1 sentence>"},
    "treasury": {"pct":<0-100>,"vesting":"<>","purpose":"<1 sentence>"},
    "liquidity": {"pct":<0-100>,"vesting":"<>","purpose":"<1 sentence>"},
    "airdrop": {"pct":<0-100>,"vesting":"<>","purpose":"<1 sentence>"}
  },
  "launch_strategy": "fair_launch|presale|lp_bootstrap|airdrop_first",
  "initial_liquidity_rec": "<USDC amount recommendation>",
  "airdrop_criteria": ["<eligibility criteria>"],
  "red_flags_avoided": ["<bad tokenomics pattern avoided>"],
  "distribution_note": "<2 sentences>"
}`,
      `Token: ${token} ${ticker ? `($${ticker})` : ""}\nTotal supply: ${total_supply.toLocaleString()}\nDescription: ${description}\nMarket: ${moversRaw ?? "Base"}\nRetail preference: ${JSON.stringify(retailPref)}`, 0.3, 1000);

    const result = parseJson(resultRaw);
    if (!result) throw new Error("Failed to parse result");

    return Response.json({ tool: "token-distribution-plan", timestamp: new Date().toISOString(), token, ticker: ticker || null, total_supply, retail_preference: retailPref, ...result });
  } catch (e) {
    return Response.json({ error: "Token distribution plan failed", message: (e as Error).message }, { status: 500 });
  }
}
