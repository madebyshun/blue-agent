// x402/tax-report — On-chain tax summary: realized gains, taxable events, P&L
// Price: $2.00 — Fully self-contained, no external workspace imports

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

async function getTransactions(address: string) {
  const key = process.env.BASESCAN_API_KEY ?? "";
  const [txRes, tokenRes] = await Promise.all([
    fetch(`https://api.etherscan.io/v2/api?chainid=8453&module=account&action=txlist&address=${address}&sort=asc&offset=200&apikey=${key}`, { signal: AbortSignal.timeout(8000) }),
    fetch(`https://api.etherscan.io/v2/api?chainid=8453&module=account&action=tokentx&address=${address}&sort=asc&offset=200&apikey=${key}`, { signal: AbortSignal.timeout(8000) }),
  ]);
  const [txData, tokenData] = await Promise.all([
    txRes.json() as Promise<{ status: string; result?: unknown[] }>,
    tokenRes.json() as Promise<{ status: string; result?: unknown[] }>,
  ]);
  return {
    txCount: txData.status === "1" ? (txData.result ?? []).length : 0,
    tokenTxCount: tokenData.status === "1" ? (tokenData.result ?? []).length : 0,
    recentTxs: txData.status === "1" ? (txData.result ?? []).slice(0, 20) : [],
    recentTokenTxs: tokenData.status === "1" ? (tokenData.result ?? []).slice(0, 20) : [],
  };
}

const SYSTEM = `You are a crypto tax advisor specializing in Base chain transactions.

Analyze the provided on-chain transaction data and return ONLY valid JSON:
{
  "taxYear": "string (e.g. '2024')",
  "summary": {
    "totalTaxableEvents": number,
    "estimatedRealizedGains": "string (e.g. '+$1,240.50')",
    "estimatedRealizedLosses": "string (e.g. '-$340.00')",
    "netGainLoss": "string",
    "taxableIncome": "string"
  },
  "eventBreakdown": {
    "swaps": number,
    "lpEvents": number,
    "nftSales": number,
    "stakingRewards": number,
    "airdrops": number
  },
  "taxCategories": [
    {
      "category": "string",
      "count": number,
      "estimatedGainLoss": "string",
      "holdingPeriod": "SHORT_TERM | LONG_TERM | MIXED"
    }
  ],
  "recommendations": ["rec1", "rec2"],
  "disclaimer": "string (tax advice disclaimer)",
  "estimatedTaxLiability": {
    "shortTerm": "string",
    "longTerm": "string",
    "total": "string"
  }
}`;

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "GET") {
    return Response.json({
      service: "tax-report",
      description: "On-chain tax summary — realized gains, taxable events, P&L",
      price: "$2.00",
      params: {
        address: "Wallet address (0x...)",
        year: "Tax year (default: current year)",
        country: "Country for tax rules (default: US)",
      },
    });
  }

  try {
    let body: { address?: string; year?: string; country?: string } = {};
    try {
      const text = await req.text();
      if (text?.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}
    const url = new URL(req.url);
    if (!body.address) body.address = url.searchParams.get("address") || undefined;

    const { address, year = new Date().getFullYear().toString(), country = "US" } = body;
    if (!address) return Response.json({ error: "Provide wallet address" }, { status: 400 });
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return Response.json({ error: "Invalid wallet address format" }, { status: 400 });
    }

    let txData = { txCount: 0, tokenTxCount: 0, recentTxs: [] as unknown[], recentTokenTxs: [] as unknown[] };
    try { txData = await getTransactions(address); } catch {}

    const llmResponse = await callBankrLLM({
      system: SYSTEM,
      messages: [{ role: "user", content: `Generate tax report for wallet: ${address}
Tax year: ${year}
Country: ${country}

On-chain activity summary:
- Total normal transactions: ${txData.txCount}
- Total token transfers: ${txData.tokenTxCount}
- Recent transactions (sample): ${JSON.stringify(txData.recentTxs.slice(0, 5))}
- Recent token transfers (sample): ${JSON.stringify(txData.recentTokenTxs.slice(0, 5))}

Estimate taxable events, gains/losses, and provide tax recommendations. Include disclaimer that this is an estimate.` }],
      temperature: 0.2,
      maxTokens: 1000,
    });

    let result = extractJsonObject(llmResponse);
    if (!result) result = { degraded: true, note: "Synthesis briefly unavailable - please retry." };
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: "Tax report failed", message: (error as Error).message }, { status: 500 });
  }
}
