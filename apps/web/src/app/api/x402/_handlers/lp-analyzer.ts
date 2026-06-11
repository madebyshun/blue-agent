// x402/lp-analyzer — LP position analysis: impermanent loss, fee income, rebalance recommendation
// Price: $0.25 — Fully self-contained, no external workspace imports

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

const SYSTEM = `You are a DeFi LP position analyst. Analyze liquidity provider positions on Base chain.

Return ONLY valid JSON:
{
  "impermanentLoss": {
    "current": "string (e.g. '-2.3%')",
    "estimated30d": "string",
    "severity": "LOW | MEDIUM | HIGH | CRITICAL"
  },
  "feeIncome": {
    "daily": "string (e.g. '$12.50')",
    "weekly": "string",
    "monthly": "string",
    "apr": "string (e.g. '18.4%')"
  },
  "netPnl": "string (fee income minus IL, e.g. '+$45.20')",
  "rebalanceSignal": "HOLD | REBALANCE | EXIT",
  "rebalanceReason": "string",
  "priceRange": {
    "current": "string",
    "inRange": boolean,
    "distanceToEdge": "string"
  },
  "recommendation": "string",
  "riskFactors": ["factor1", "factor2"]
}`;

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "GET") {
    return Response.json({
      service: "lp-analyzer",
      description: "LP position analysis — impermanent loss, fee income, rebalance recommendation",
      price: "$0.25",
      params: {
        positionId: "LP NFT position ID or address",
        pool: "Pool address (optional)",
        token0: "Token 0 symbol or address",
        token1: "Token 1 symbol or address",
        entryPrice: "Price when position was opened (optional)",
      },
    });
  }

  try {
    let body: {
      positionId?: string;
      pool?: string;
      token0?: string;
      token1?: string;
      entryPrice?: string;
      investedAmount?: string;
    } = {};
    try {
      const text = await req.text();
      if (text?.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}
    const url = new URL(req.url);
    if (!body.positionId) body.positionId = url.searchParams.get("positionId") || undefined;
    if (!body.pool) body.pool = url.searchParams.get("pool") || undefined;
    if (!body.token0) body.token0 = url.searchParams.get("token0") || undefined;
    if (!body.token1) body.token1 = url.searchParams.get("token1") || undefined;

    const { positionId, pool, token0, token1, entryPrice, investedAmount } = body;

    if (!positionId && !pool && !token0) {
      return Response.json({ error: "Provide positionId, pool address, or token pair (token0/token1)" }, { status: 400 });
    }

    const llmResponse = await callBankrLLM({
      system: SYSTEM,
      messages: [{ role: "user", content: `Analyze this LP position on Base chain:
Position ID: ${positionId || "not provided"}
Pool: ${pool || "not provided"}
Token pair: ${token0 || "?"} / ${token1 || "?"}
Entry price: ${entryPrice || "unknown"}
Invested amount: ${investedAmount || "unknown"}

Estimate impermanent loss, fee income (assume typical Uniswap v3 range), and give rebalance signal. Be realistic with estimates based on Base DeFi conditions.` }],
      temperature: 0.3,
      maxTokens: 800,
    });

    let result = extractJsonObject(llmResponse);
    if (!result) result = { degraded: true, note: "Synthesis briefly unavailable - please retry." };
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: "LP analysis failed", message: (error as Error).message }, { status: 500 });
  }
}
