// x402/yield-optimizer — Best APY opportunities on Base DeFi
// Price: $0.15 — Fully self-contained, no external workspace imports

type BankrMessage = { role: string; content: string };

async function callBankrLLM(opts: {
  model?: string; system: string; messages: BankrMessage[];
  temperature?: number; maxTokens?: number;
}): Promise<string> {
  const res = await fetch("https://llm.bankr.bot/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.LLM_API_KEY ?? process.env.BANKR_API_KEY ?? "",
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model ?? "claude-haiku-4-5",
      system: opts.system,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.5,
      max_tokens: opts.maxTokens ?? 1000,
    }),
  });
  if (!res.ok) throw new Error(`Bankr LLM ${res.status}: ${await res.text()}`);
  const d = await res.json() as { content?: { text: string }[]; text?: string };
  if (d.content?.length) return d.content[0].text;
  if (d.text) return d.text;
  throw new Error("Invalid Bankr LLM response");
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
    try {
      pools = await getBasePools(token);
    } catch (e) {
      console.warn("[YieldOptimizer] DeFiLlama fetch failed, using LLM only");
    }

    type Pool = { project?: string; symbol?: string; apy?: number; tvlUsd?: number };

    const poolContext = pools.length > 0
      ? `Live DeFiLlama data (Base chain pools):\n${(pools as Pool[]).map(p =>
          `- ${p.project} | ${p.symbol} | APY: ${p.apy?.toFixed(2)}% | TVL: $${((p.tvlUsd ?? 0) / 1e6).toFixed(2)}M`
        ).join("\n")}`
      : `No live pool data available — use general knowledge of Base DeFi protocols (Aerodrome, Morpho, Aave, Moonwell, Extra Finance).`;

    const llmResponse = await callBankrLLM({
      system: SYSTEM,
      messages: [{ role: "user", content: `Find best yield opportunities for ${token} on Base chain.\n\n${poolContext}\n\nRecommend top 3-4 options with risk assessment.` }],
      temperature: 0.4,
      maxTokens: 1500,
    });
    let result = extractJsonObject(llmResponse);
    if (!result) result = { degraded: true, note: "Synthesis briefly unavailable - please retry." };
    return Response.json(result);
  } catch (error) {
    console.error("[YieldOptimizer] Error:", error);
    return Response.json({ error: "Yield optimization failed", message: (error as Error).message }, { status: 500 });
  }
}
