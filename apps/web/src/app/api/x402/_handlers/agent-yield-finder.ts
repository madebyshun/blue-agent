// x402/agent-yield-finder
// Best USDC yield on Base for idle agent capital — REAL DefiLlama APY (never fabricated).
// Price: $0.25
// Architecture: rates from getYieldRates() (live, safety-curated). Projected yield computed
// in CODE (amount × apy). LLM ONLY writes qualitative rationale — picks from the real list,
// forbidden to invent APY/protocol/numbers.

import { getYieldRates, type YieldRate } from "@/lib/yield-rates";

type Msg = { role: string; content: string };
async function llm(system: string, user: string, temp = 0, tokens = 700): Promise<string> {
  const r = await fetch("https://llm.bankr.bot/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.LLM_API_KEY ?? process.env.BANKR_API_KEY ?? "", "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-4-5", system, messages: [{ role: "user", content: user }] as Msg[], temperature: temp, max_tokens: tokens }),
  });
  if (!r.ok) throw new Error(`LLM ${r.status}`);
  const d = await r.json() as { content?: { text: string }[] };
  return d.content?.[0]?.text ?? "";
}
function parseJson(t: string): Record<string, unknown> | null {
  let s = t.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const i = s.indexOf("{"), j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  try { return JSON.parse(s); } catch { return null; }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { amount?: number; risk?: string } = {};
    try { const t = await req.text(); if (t.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const amount = Number(body.amount ?? url.searchParams.get("amount") ?? 10000) || 10000;
    const risk = (body.risk ?? url.searchParams.get("risk") ?? "balanced").toLowerCase();

    // ── REAL data: live curated USDC lending rates on Base ─────────────────────
    let rates: YieldRate[] = [];
    let best: YieldRate | null = null;
    try { const d = await getYieldRates(); rates = d.rates; best = d.best; } catch {}

    if (!rates.length) {
      return Response.json({
        tool: "agent-yield-finder", timestamp: new Date().toISOString(), amount,
        error: "Live yield data temporarily unavailable from DefiLlama — retry shortly.",
        note: "This tool only returns real, live rates. It does not estimate or fabricate APY.",
      });
    }

    // ── Projected yield computed in CODE (never by LLM) ────────────────────────
    const projection = rates.map(r => ({
      protocol: r.label,
      apy_pct: r.apy,
      tvl_usd: r.tvlUsd,
      executable: r.executable,
      projected_annual_usd: Number((amount * r.apy / 100).toFixed(2)),
      projected_monthly_usd: Number((amount * r.apy / 100 / 12).toFixed(2)),
      source: r.llamaUrl,
    }));

    // ── LLM: qualitative rationale ONLY — picks within the real list ───────────
    const ratesForLLM = rates.map(r => `${r.label}: ${r.apy}% APY, $${(r.tvlUsd/1e6).toFixed(1)}M TVL${r.executable ? ", executable on Base today" : ""}`).join("\n");
    const system = `You are Blue Agent — yield strategist for autonomous agents parking idle USDC on Base.
You are given REAL live rates. HARD RULES:
- NEVER invent or alter any APY, TVL, or protocol name. Use ONLY the provided rates.
- Pick "recommended" strictly from the provided protocols.
- Higher TVL = safer (less manipulation/illiquidity risk). Note the APY vs TVL tradeoff.
- Risk preference "${risk}": conservative→favor highest TVL even if slightly lower APY; aggressive→favor highest APY among safe options; balanced→weigh both.
- Do NOT promise returns; APY is variable and changes per block.
Return ONLY raw JSON.
Schema: {"recommended":"<protocol label from list>","why":"<1-2 sentences, reference real APY & TVL tradeoff>","runner_up":"<protocol label>","caution":"<1 sentence risk note>"}`;
    let rationale: Record<string, unknown> = {};
    try { rationale = parseJson(await llm(system, `Idle USDC: $${amount}\nRisk: ${risk}\nReal live rates on Base:\n${ratesForLLM}`)) ?? {}; } catch {}

    // recommended pick: validate LLM choice is a real protocol; else default to best APY
    const validLabels = new Set(rates.map(r => r.label));
    const recommended = validLabels.has(String(rationale.recommended)) ? String(rationale.recommended) : (best?.label ?? rates[0].label);

    return Response.json({
      tool: "agent-yield-finder",
      timestamp: new Date().toISOString(),
      idle_usdc: amount,
      risk_preference: risk,
      best_rate: best ? { protocol: best.label, apy_pct: best.apy, tvl_usd: best.tvlUsd } : null,
      recommended,
      rationale: rationale.why ?? null,
      runner_up: rationale.runner_up ?? null,
      caution: rationale.caution ?? null,
      all_options: projection,
      data_source: "DefiLlama live yields (Base, USDC lending, TVL≥$1M, APY≤20% safety filter)",
      disclaimer: "APY is live and variable — it changes every block. Projected yield assumes the current rate holds for a full period, which it will not. Verify the current rate on the protocol before depositing. Not financial advice.",
    });
  } catch (e) {
    return Response.json({ error: "agent-yield-finder failed", message: (e as Error).message }, { status: 500 });
  }
}
