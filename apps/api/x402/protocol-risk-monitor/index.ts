// x402/protocol-risk-monitor/index.ts
// Protocol Risk Monitor — Aeon defi-monitor + MiroShark analyst + Blue verdict
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
    let body: { protocol?: string; position?: string } = {};
    try { const t = await req.text(); if (t.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const protocol = body.protocol ?? url.searchParams.get("protocol") ?? "";
    const position = body.position ?? url.searchParams.get("position") ?? "";
    if (!protocol) return Response.json({ error: "protocol is required (e.g. 'Aerodrome', 'Aave Base', 'Uniswap v4')" }, { status: 400 });

    const defiRaw = await aeon("defi-monitor", `${protocol} on Base: current TVL health, liquidity depth, recent unusual activity, smart contract risk signals, exploit history, centralization risks, oracle dependencies.`);

    const msRaw = await llm(`You are MiroShark analyst persona — DeFi risk specialist.
Assess protocol risk from a position holder perspective.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "risk_level": "critical|high|medium|low|minimal",
  "exit_urgency": "exit_now|reduce|hold|add",
  "biggest_risk": "<single biggest risk right now>",
  "time_horizon": "<safe window: hours|days|weeks|months>",
  "analyst_verdict": "<1-2 sentences>"
}`,
      `Protocol: ${protocol}\nPosition: ${position || "general exposure"}\nDeFi signals: ${defiRaw ?? "Base DeFi"}`, 0.3, 500);
    const analyst = parseJson(msRaw) ?? {};

    const resultRaw = await llm(`You are Blue Agent — protocol risk monitor for Base DeFi positions.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "risk_score": <0-100>,
  "overall_risk": "critical|high|medium|low|minimal",
  "action": "EXIT_NOW|REDUCE|HOLD|ADD",
  "risk_dimensions": {
    "smart_contract": <0-10>,
    "liquidity": <0-10>,
    "oracle": <0-10>,
    "governance": <0-10>,
    "market": <0-10>
  },
  "active_risks": [{"risk":"<name>","severity":"critical|high|medium|low","description":"<brief>"}],
  "watch_for": ["<signal that changes risk level>"],
  "safe_exit_path": "<how to exit safely if needed>",
  "position_sizing": "<recommended max exposure %>",
  "summary": "<2 sentences>"
}`,
      `Protocol: ${protocol}\nPosition: ${position}\nDeFi: ${defiRaw ?? "Base DeFi"}\nAnalyst: ${JSON.stringify(analyst)}`, 0.3, 1100);

    const result = parseJson(resultRaw);
    if (!result) throw new Error("Failed to parse result");

    return Response.json({ tool: "protocol-risk-monitor", timestamp: new Date().toISOString(), protocol, position, analyst, ...result });
  } catch (e) {
    return Response.json({ error: "Protocol risk monitor failed", message: (e as Error).message }, { status: 500 });
  }
}
