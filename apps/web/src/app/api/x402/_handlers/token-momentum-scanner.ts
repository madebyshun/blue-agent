// x402/token-momentum-scanner/index.ts
// Token Momentum Scanner — Aeon token-movers + MiroShark retail + Blue verdict
// Price: $0.25

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
    let body: { chain?: string; min_mcap?: number } = {};
    try { const t = await req.text(); if (t.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const chain = body.chain ?? url.searchParams.get("chain") ?? "base";
    const min_mcap = body.min_mcap ?? Number(url.searchParams.get("min_mcap") ?? 500000);

    const moversRaw = await aeon("token-movers", `${chain} chain momentum plays: pre-pump setups, breakout candidates, volume spikes, min mcap $${min_mcap.toLocaleString()}. Look for early momentum before CT picks up.`);

    const msRaw = await llm(`You are MiroShark — retail momentum sentiment engine.
Score these momentum setups from a retail trader perspective.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "retail_fomo_level": "high|medium|low",
  "top_momentum_pick": "<token name>",
  "momentum_stage": "early|mid|late|extended",
  "risk_reward": "<e.g. 3:1>",
  "retail_take": "<1 sentence>"
}`,
      `Chain: ${chain}\nMomentum signals: ${moversRaw ?? "Base chain tokens"}`, 0.4, 500);
    const retail = parseJson(msRaw) ?? {};

    const resultRaw = await llm(`You are Blue Agent — momentum scanner for Base chain tokens.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "scan_score": <0-100>,
  "market_phase": "accumulation|markup|distribution|markdown",
  "momentum_plays": [
    {
      "token": "<name>",
      "momentum_score": <0-100>,
      "stage": "early|mid|late",
      "catalyst": "<what's driving it>",
      "entry_zone": "<price level or condition>",
      "target": "<price target or %>",
      "invalidation": "<when thesis is wrong>"
    }
  ],
  "avoid": ["<token to avoid>"],
  "best_setup": "<token with best risk/reward>",
  "summary": "<2 sentences>"
}`,
      `Chain: ${chain}\nMin mcap: $${min_mcap}\nMovers: ${moversRaw ?? "Base chain"}\nRetail: ${JSON.stringify(retail)}`, 0.3, 1000);

    const result = parseJson(resultRaw);
    if (!result) throw new Error("Failed to parse result");

    return Response.json({ tool: "token-momentum-scanner", timestamp: new Date().toISOString(), chain, min_mcap, retail, ...result });
  } catch (e) {
    return Response.json({ error: "Token momentum scanner failed", message: (e as Error).message }, { status: 500 });
  }
}
