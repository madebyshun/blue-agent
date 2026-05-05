// x402/wallet-pnl/index.ts
// Wallet PnL Report - $1.00 USDC per analysis
// Powered by Blue Agent

import { callBankrLLM, extractJsonObject } from "@blue-agent/bankr";

async function callLLM(system: string, userContent: string): Promise<string> {
  return callBankrLLM({
    model: "claude-haiku-4-5",
    system,
    messages: [{ role: "user", content: userContent }],
    temperature: 0.5,
    maxTokens: 1200,
  });
}

async function getBasescanTxs(address: string): Promise<any[]> {
  const apiKey = process.env.BASESCAN_API_KEY || "";
  const url = `https://api.basescan.org/api?module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.result?.slice(0, 50) || [];
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { address?: string } = {};
    try {
      const text = await req.text();
      if (text && text.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}
    const url = new URL(req.url);
    if (!body.address) body.address = url.searchParams.get("address") || undefined;

    const { address } = body;
    if (!address || !address.startsWith("0x")) {
      return Response.json({ error: "Please provide a valid wallet address (0x...)" }, { status: 400 });
    }

    console.log(`[WalletPnL] Analyzing: ${address}`);

    const txs = await getBasescanTxs(address);
    const txSummary = txs.length > 0
      ? txs.slice(0, 20).map((tx: any) => ({
          token: tx.tokenSymbol,
          value: tx.value,
          decimals: tx.tokenDecimal,
          direction: tx.to?.toLowerCase() === address.toLowerCase() ? "IN" : "OUT",
          timestamp: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
        }))
      : [];

    const systemPrompt = `You are a crypto portfolio analyst specializing in onchain wallet analysis on Base chain.

Analyze the provided wallet data and return ONLY a valid JSON object:

{
  "address": "string",
  "period": "Last 30 days",
  "totalTrades": number,
  "uniqueTokens": number,
  "estimatedPnL": "string (e.g. +$1,240 or -$320, estimate based on activity)",
  "winRate": "string (e.g. 65%)",
  "tradingStyle": "string (e.g. Memecoin Aper | DeFi Farmer | Long-term Holder | Active Trader)",
  "topTokens": ["token1", "token2", "token3"],
  "biggestWin": "string (estimated)",
  "biggestLoss": "string (estimated)",
  "riskProfile": "Conservative | Moderate | Aggressive | Degen",
  "summary": "2-3 sentence human-readable summary of this wallet's trading behavior",
  "smartMoneyScore": number (0-100, higher = smarter money),
  "recommendation": "string (what this wallet should do next based on their pattern)"
}`;

    const userPrompt = `Analyze this Base wallet: ${address}

Recent token transactions (last 50):
${JSON.stringify(txSummary, null, 2)}

Total transactions found: ${txs.length}`;

    const llmResponse = await callLLM(systemPrompt, userPrompt);
    const result = extractJsonObject(llmResponse);

    return Response.json(result, { status: 200 });
  } catch (error) {
    console.error("[WalletPnL] Error:", error);
    return Response.json({ error: "Failed to analyze wallet", message: (error as Error).message }, { status: 500 });
  }
}
