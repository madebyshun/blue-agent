// x402/portfolio-rebalancer
// Portfolio Rebalancer — grounds in REAL current holdings when a Base `address` is
// supplied (live balanceOf via multicall + DexScreener USD prices → true allocation
// %). Without an address it falls back to the user-described `holdings` text and is
// clearly labelled advisory. The LLM recommends target allocation on top of the real
// numbers — never invents balances or prices.
// Resilient: retry + graceful fallback, never 500.
// Price: $0.50

import { getWalletSnapshot, getHoldings, holdingsToPrompt, normalizeAddress, type Holding } from "@/lib/onchain";

type Msg = { role: string; content: string };
async function llm(system: string, user: string, temp = 0.3, tokens = 1100): Promise<string> {
  const r = await fetch("https://llm.bankr.bot/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.LLM_API_KEY ?? process.env.BANKR_API_KEY ?? "", "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-4-5", system, messages: [{ role: "user", content: user }] as Msg[], temperature: temp, max_tokens: tokens }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`LLM ${r.status}`);
  const d = await r.json() as { content?: { text: string }[] };
  return d.content?.[0]?.text ?? "";
}
function parseJson(t: string): Record<string, unknown> | null {
  let s = t.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const i = s.indexOf("{"), j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  try { return JSON.parse(s); } catch { try { return JSON.parse(s.replace(/[\x00-\x1F]/g, " ")); } catch { return null; } }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { holdings?: string; address?: string; risk_profile?: string; goal?: string } = {};
    try { const t = await req.text(); if (t.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const holdings = body.holdings ?? url.searchParams.get("holdings") ?? "";
    const address = body.address ?? url.searchParams.get("address") ?? "";
    const risk_profile = body.risk_profile ?? url.searchParams.get("risk_profile") ?? "medium";
    const goal = body.goal ?? url.searchParams.get("goal") ?? "growth";
    if (!holdings && !address) return Response.json({ error: "holdings (text) or address (0x..., for live holdings) is required" }, { status: 400 });

    // ── Ground in real current holdings when an address is supplied ───────────
    let live: Holding[] = [];
    if (address && normalizeAddress(address)) {
      const snap = await getWalletSnapshot(address);
      if (snap?.topTokens.length) live = await getHoldings(address, snap.topTokens.map((t) => t.contractAddress));
    }
    const grounded = live.length > 0;

    const ctx = grounded
      ? `${holdingsToPrompt(live)}\nRisk profile: ${risk_profile}\nGoal: ${goal}`
      : `User-described holdings (NOT verified on-chain): ${holdings || "unspecified"}\nRisk profile: ${risk_profile}\nGoal: ${goal}`;

    const system = `You are Blue Agent — portfolio rebalancer for Base assets (chain 8453).
${grounded
      ? "You are given the wallet's REAL current holdings with live USD values and allocation %. Use those exact balances/percentages; NEVER invent positions or prices. Recommend target allocation relative to the real current_pct shown."
      : "Holdings are user-described and NOT verified on-chain — clearly frame the output as advisory, and base current_pct on what the user stated (or mark unknown)."}
Return ONLY raw JSON. No markdown.
Schema: {
  "rebalance_score": <0-100>,
  "action": "REBALANCE_NOW|TRIM|ACCUMULATE|HOLD",
  "suggested_allocation": [{"asset":"<name>","current_pct":<number>,"target_pct":<number>,"action":"add|reduce|hold"}],
  "rotate_from": ["<overweight position>"],
  "rotate_into": ["<underweight opportunity>"],
  "reasoning": "<2-3 sentences>",
  "risk_warnings": ["<warning>"],
  "summary": "<2 sentences>"
}`;

    let result: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 2 && !result; attempt++) {
      try { result = parseJson(await llm(system, ctx)); } catch { /* retry then fallback */ }
    }
    if (!result) {
      result = {
        rebalance_score: null,
        action: "HOLD",
        suggested_allocation: grounded
          ? live.map((h) => ({ asset: h.symbol, current_pct: h.allocationPct ?? 0, target_pct: h.allocationPct ?? 0, action: "hold" }))
          : [],
        rotate_from: [],
        rotate_into: [],
        reasoning: grounded
          ? "Rebalance synthesis briefly unavailable — the current allocation below is real (live balances + prices). Re-run for target allocation."
          : "Rebalance synthesis briefly unavailable — re-run, or supply an address for live holdings.",
        risk_warnings: ["Synthesis degraded this run"],
        summary: "Built from real holdings; full synthesis on retry.",
        degraded: true,
      };
    }

    return Response.json({
      tool: "portfolio-rebalancer",
      timestamp: new Date().toISOString(),
      data_source: grounded ? "Base RPC + multicall + DexScreener (live holdings)" : "advisory (holdings user-described, not verified on-chain)",
      address: address || null,
      holdings: holdings || null,
      risk_profile,
      goal,
      onchain: grounded
        ? { holdings: live.map((h) => ({ symbol: h.symbol, balance: h.balance, price_usd: h.priceUsd, value_usd: h.valueUsd, allocation_pct: h.allocationPct, contract: h.contractAddress })) }
        : null,
      ...result,
    });
  } catch (e) {
    return Response.json({ error: "Portfolio rebalancer failed", message: (e as Error).message }, { status: 500 });
  }
}
