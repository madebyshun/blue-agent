// x402/tax-report — On-chain tax summary: taxable-event counts + estimated P&L
// Price: $2.00 — event counts are from real on-chain data; dollar figures are
// clearly-labelled rough estimates (no cost-basis feed). Never fabricates a
// report from an empty data response.

import { getWalletSnapshot } from "@/lib/onchain";
import { getMoralisNativeTx, getMoralisERC20Transfers } from "@/lib/moralis";
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

async function getTransactions(address: string) {
  const [nativeTxs, tokenTxs] = await Promise.all([
    getMoralisNativeTx(address, 200),
    getMoralisERC20Transfers(address, 200),
  ]);
  const tokens = tokenTxs.filter((t) => !t.possible_spam);
  return {
    txCount: nativeTxs.length,
    tokenTxCount: tokens.length,
    recentTxs: nativeTxs.slice(0, 20),
    recentTokenTxs: tokens.slice(0, 20),
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
    const [maybeTx, snap] = await Promise.all([
      getTransactions(address).catch(() => null),
      getWalletSnapshot(address),
    ]);
    if (maybeTx) txData = maybeTx;

    // Guard: no readable activity → do not fabricate a dollar tax liability on a
    // $2 report. nonce disambiguates "genuinely inactive" from "fetch failed".
    const nonce = snap?.txCount ?? null;
    if (txData.txCount === 0 && txData.tokenTxCount === 0) {
      const neverActive = nonce === 0;
      return Response.json({
        address,
        taxYear: year,
        summary: { totalTaxableEvents: 0, estimatedRealizedGains: "n/a", estimatedRealizedLosses: "n/a", netGainLoss: "n/a", taxableIncome: "n/a" },
        eventBreakdown: { swaps: 0, lpEvents: 0, nftSales: 0, stakingRewards: 0, airdrops: 0 },
        taxCategories: [],
        recommendations: [neverActive
          ? "No on-chain activity found for this wallet — nothing to report."
          : "Transaction history could not be read (data source unavailable). Retry before relying on this."],
        estimatedTaxLiability: { shortTerm: "n/a", longTerm: "n/a", total: "n/a" },
        dataSource: "Basescan tx history + live Base RPC nonce",
        disclaimer: "Not tax advice and not a filing. Dollar figures require cost-basis tracking this tool does not have — export transactions to a dedicated crypto-tax product for accurate numbers.",
      });
    }

    const llmResponse = await callBankrLLM({
      system: SYSTEM,
      messages: [{ role: "user", content: `Generate tax report for wallet: ${address}
Tax year: ${year}
Country: ${country}

On-chain activity summary (event COUNTS are real; you have NO cost-basis or historical price data):
- Total normal transactions: ${txData.txCount}
- Total token transfers: ${txData.tokenTxCount}
- Recent transactions (sample): ${JSON.stringify(txData.recentTxs.slice(0, 5))}
- Recent token transfers (sample): ${JSON.stringify(txData.recentTokenTxs.slice(0, 5))}

Report taxable-EVENT counts from the real data. For every DOLLAR figure (gains, losses, liability) you MUST label it a rough estimate and keep it conservative — you cannot compute exact gains without cost basis. State this clearly in the disclaimer.` }],
      temperature: 0.2,
      maxTokens: 1000,
    });

    let result = extractJsonObject(llmResponse);
    if (!result) result = { degraded: true, note: "Synthesis briefly unavailable - please retry." };
    return Response.json({
      ...result,
      address,
      dataSource: "Basescan tx history + live Base RPC nonce",
      disclaimer: "Not tax advice and not a filing. Dollar figures are rough estimates — this tool has no cost-basis or historical price feed. Use a dedicated crypto-tax product for accurate numbers.",
    });
  } catch (error) {
    return Response.json({ error: "Tax report failed", message: (error as Error).message }, { status: 500 });
  }
}
