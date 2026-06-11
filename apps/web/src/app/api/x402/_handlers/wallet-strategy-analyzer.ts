// x402/wallet-strategy-analyzer/index.ts
// Wallet Strategy Analyzer — Aeon token-movers + MiroShark analyst + Blue verdict
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
    let body: { address?: string; focus?: string } = {};
    try { const t = await req.text(); if (t.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const address = body.address ?? url.searchParams.get("address") ?? "";
    const focus = body.focus ?? url.searchParams.get("focus") ?? "general";
    if (!address) return Response.json({ error: "address is required (wallet address 0x...)" }, { status: 400 });

    const moversRaw = await aeon("token-movers", `smart money wallet strategies on Base: what are top wallets holding, rotating into/out of, trading patterns that generate alpha. Context: analyzing ${address}`);

    const msRaw = await llm(`You are MiroShark analyst persona — on-chain strategy specialist.
Decode trading strategy from wallet signals.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "strategy_type": "momentum|value|narrative|degen|yield|mixed",
  "sophistication": "whale|smart_money|retail|bot",
  "edge": "<what gives this wallet an edge>",
  "copy_worthiness": <0-10>,
  "analyst_verdict": "<1-2 sentences>"
}`,
      `Address: ${address}\nFocus: ${focus}\nMover signals: ${moversRaw ?? "Base chain"}`, 0.3, 500);
    const analyst = parseJson(msRaw) ?? {};

    const resultRaw = await llm(`You are Blue Agent — wallet strategy analyzer for Base chain.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "strategy_score": <0-100>,
  "wallet_archetype": "whale|smart_money|degen|yield_farmer|builder|mixed",
  "strategy": {
    "primary": "<main strategy>",
    "timeframe": "scalp|swing|position|long_term",
    "risk_profile": "aggressive|moderate|conservative",
    "key_behaviors": ["<observed behavior>"]
  },
  "holdings_pattern": {
    "dominant_sectors": ["<DeFi|NFT|AI agents|etc>"],
    "typical_position_size": "<small|medium|large>",
    "entry_style": "<how they enter positions>"
  },
  "replicable_plays": ["<specific strategy to copy>"],
  "watch_signals": ["<on-chain signal that predicts next move>"],
  "risk_flags": ["<risk in copying this wallet>"],
  "summary": "<2 sentences>"
}`,
      `Address: ${address}\nFocus: ${focus}\nMovers: ${moversRaw ?? "Base chain"}\nAnalyst: ${JSON.stringify(analyst)}`, 0.3, 1100);

    let result = parseJson(resultRaw);
    if (!result) result = { degraded: true, note: "Synthesis briefly unavailable - please retry." };

    return Response.json({ tool: "wallet-strategy-analyzer", timestamp: new Date().toISOString(), address, focus, analyst, ...result });
  } catch (e) {
    return Response.json({ error: "Wallet strategy analyzer failed", message: (e as Error).message }, { status: 500 });
  }
}
