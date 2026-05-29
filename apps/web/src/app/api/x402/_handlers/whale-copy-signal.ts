// x402/whale-copy-signal/index.ts
// Whale Copy Signal — Aeon token-movers + MiroShark analyst + Blue verdict
// Price: $0.35

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
    let body: { token?: string; wallet?: string } = {};
    try { const t = await req.text(); if (t.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const token = body.token ?? url.searchParams.get("token") ?? "";
    const wallet = body.wallet ?? url.searchParams.get("wallet") ?? "";

    const moversRaw = await aeon("token-movers", `smart money and whale activity${token ? ` for ${token}` : " on Base"}. Focus on wallet clustering, accumulation patterns, copy-trade setups.`);

    const msRaw = await llm(`You are MiroShark analyst persona — data-driven, smart money focused.
Identify copy-trade opportunities from whale/smart money signals.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "smart_money_signal": "accumulating|distributing|neutral",
  "copy_confidence": <0-10>,
  "entry_window": "<now|wait 24h|wait 48h+>",
  "risk_level": "high|medium|low",
  "analyst_take": "<1-2 sentences>"
}`,
      `Token: ${token || "Base ecosystem"}\nWallet: ${wallet || "general"}\nMover signals: ${moversRaw ?? "Base chain"}`, 0.3, 500);
    const analyst = parseJson(msRaw) ?? {};

    const resultRaw = await llm(`You are Blue Agent — smart money copy signal engine for Base.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "signal": "STRONG_BUY|BUY|WATCH|PASS",
  "confidence": <0-100>,
  "whale_activity": "accumulating|distributing|neutral|mixed",
  "copy_targets": [{"token":"<name>","action":"buy|watch|avoid","size_hint":"<small|medium|large>","rationale":"<1 sentence>"}],
  "entry_timing": "<immediate|wait for dip|wait for confirmation>",
  "stop_loss_hint": "<price action trigger>",
  "smart_money_wallets_active": <number>,
  "summary": "<2 sentences>"
}`,
      `Token: ${token || "Base"}\nMover data: ${moversRaw ?? "Base chain"}\nAnalyst: ${JSON.stringify(analyst)}`, 0.3, 900);

    const result = parseJson(resultRaw);
    if (!result) throw new Error("Failed to parse result");

    return Response.json({ tool: "whale-copy-signal", timestamp: new Date().toISOString(), token, analyst, ...result });
  } catch (e) {
    return Response.json({ error: "Whale copy signal failed", message: (e as Error).message }, { status: 500 });
  }
}
