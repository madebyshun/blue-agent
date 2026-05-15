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
  const apiKey = process.env.BASESCAN_API_KEY;
  if (!apiKey) return [];
  try {
    // Etherscan V2 API with Base chainid
    const url = `https://api.etherscan.io/v2/api?chainid=8453&module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${apiKey}`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const data = await res.json() as { status: string; result?: unknown };
    if (data.status === "1" && Array.isArray(data.result)) {
      return data.result.slice(0, 50);
    }
    return [];
  } catch {
    return [];
  }
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

CRITICAL: Return ONLY raw JSON. No markdown. No backticks. Start with { and end with }.

{
  "address": "string",
  "trades": <number>,
  "tokens": <number of unique tokens>,
  "pnl": "estimated e.g. +$1,240 or -$320",
  "winRate": "e.g. 65%",
  "style": "Memecoin Aper | DeFi Farmer | Long-term Holder | Active Trader | Degen",
  "topTokens": ["token1", "token2", "token3"],
  "risk": "Conservative | Moderate | Aggressive | Degen",
  "score": <0-100 smart money score>,
  "summary": "2-3 sentence summary of trading behavior",
  "tip": "one actionable recommendation"
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
