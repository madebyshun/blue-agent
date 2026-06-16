// x402/yield-optimizer — Best APY opportunities on Base DeFi
// Price: $0.15 — Fully self-contained, no external workspace imports

import { callVeniceLLM } from "@/app/api/_lib/llm";

type BankrMessage = { role: string; content: string };

async function callBankrLLM(opts: {
  model?: string; system: string; messages: BankrMessage[];
  temperature?: number; maxTokens?: number;
}): Promise<string> {
  return callVeniceLLM({ system: opts.system, messages: opts.messages, temperature: opts.temperature, maxTokens: opts.maxTokens });
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  let raw = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s >= 0 && e > s) raw = raw.slice(s, e + 1);
  try { return JSON.parse(raw); } catch {}
  try { return JSON.parse(raw.replace(/[\x00-\x1F\x7F]/g, " ")); } catch {}
  return null;
}

const DEFILLAMA_URL = "https://yields.llama.fi/pools";

async function getBasePools(token: string): Promise<unknown[]> {
  const res = await fetch(DEFILLAMA_URL, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`DeFiLlama error: ${res.status}`);
  const { data } = await res.json() as { data: unknown[] };
  const ticker = token.replace(/^\$/, "").toUpperCase();
  type Pool = { chain?: string; symbol?: string; project?: string; apy?: number; tvlUsd?: number };
  return (data as Pool[])
    .filter(p =>
      p.chain === "Base" &&
      (p.symbol?.toUpperCase().includes(ticker) || p.project?.toLowerCase().includes(token.toLowerCase()))
    )
    .sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0))
    .slice(0, 10);
}

const SYSTEM = `You are a DeFi yield optimization expert for Base chain. Analyze yield opportunities and recommend the best risk-adjusted options.

Consider: APY sustainability, protocol risk, TVL stability, impermanent loss risk, smart contract risk.

CRITICAL DATA RULE: Recommend ONLY pools present in the live DeFiLlama data provided in the user message. NEVER invent a protocol, APY, or TVL that is not in that list. Copy APY/TVL figures from the data; do not estimate your own.

Return ONLY valid JSON:

{
  "token": "string",
  "chain": "base",
  "bestOpportunities": [
    {
      "protocol": "string",
      "pool": "string",
      "apy": "string",
      "tvl": "string",
      "risk": "LOW" | "MEDIUM" | "HIGH",
      "type": "Lending" | "LP" | "Staking" | "Vault",
      "pros": ["pro1"],
      "cons": ["con1"]
    }
  ],
  "recommendedStrategy": "string",
  "riskWarnings": ["warning1"],
  "marketContext": "string (current yield environment on Base)",
  "recommendation": "string"
}`;

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { token?: string } = {};
    try {
      const text = await req.text();
      if (text?.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}
    const url = new URL(req.url);
    if (!body.token) body.token = url.searchParams.get("token") || undefined;

    const { token } = body;
    if (!token) return Response.json({ error: "Provide token to optimize yield for (e.g. USDC, ETH)" }, { status: 400 });

    console.log(`[YieldOptimizer] Finding yield for: ${token}`);

    let pools: unknown[] = [];
    let fetchOk = true;
    try {
      pools = await getBasePools(token);
    } catch {
      fetchOk = false;
      console.warn("[YieldOptimizer] DeFiLlama fetch failed");
    }

    type Pool = { project?: string; symbol?: string; apy?: number; tvlUsd?: number };

    // Don't fabricate APY/TVL when there's no live data. Distinguish a fetch
    // failure (retry) from a genuine no-match (suggest a major asset).
    if (!fetchOk) {
      return Response.json({
        token, chain: "base", bestOpportunities: [],
        recommendedStrategy: "n/a", riskWarnings: [],
        marketContext: "The live yield data source (DeFiLlama) was unavailable.",
        recommendation: "Could not fetch live Base pool APYs — please retry shortly. No estimated APY/TVL is shown to avoid fabricated numbers.",
        dataSource: "DeFiLlama yields (unavailable)",
        disclaimer: "Yields are variable and not guaranteed. DeFi carries smart-contract and impermanent-loss risk — DYOR.",
      });
    }
    if (pools.length === 0) {
      return Response.json({
        token, chain: "base", bestOpportunities: [],
        recommendedStrategy: "n/a", riskWarnings: [],
        marketContext: `No Base-chain pools matching "${token}" were found on DeFiLlama.`,
        recommendation: `No live Base yield pools matched "${token}". Try a major Base asset like USDC, ETH, cbBTC, or AERO.`,
        dataSource: "DeFiLlama yields (live)",
        disclaimer: "Yields are variable and not guaranteed. DeFi carries smart-contract and impermanent-loss risk — DYOR.",
      });
    }

    const poolContext = `Live DeFiLlama data (Base chain pools) — recommend ONLY from these:\n${(pools as Pool[]).map(p =>
      `- ${p.project} | ${p.symbol} | APY: ${p.apy?.toFixed(2)}% | TVL: $${((p.tvlUsd ?? 0) / 1e6).toFixed(2)}M`
    ).join("\n")}`;

    const llmResponse = await callBankrLLM({
      system: SYSTEM,
      messages: [{ role: "user", content: `Find best yield opportunities for ${token} on Base chain.\n\n${poolContext}\n\nRecommend top 3-4 options FROM THE LIST ABOVE with risk assessment. Use the exact APY/TVL shown.` }],
      temperature: 0.4,
      maxTokens: 1500,
    });
    let result = extractJsonObject(llmResponse);
    if (!result) result = { degraded: true, note: "Synthesis briefly unavailable - please retry." };
    return Response.json({
      ...result,
      dataSource: "DeFiLlama yields (live)",
      disclaimer: "Yields are variable and not guaranteed. APY/TVL are live snapshots that change continuously. DeFi carries smart-contract and impermanent-loss risk — DYOR.",
    });
  } catch (error) {
    console.error("[YieldOptimizer] Error:", error);
    return Response.json({ error: "Yield optimization failed", message: (error as Error).message }, { status: 500 });
  }
}
