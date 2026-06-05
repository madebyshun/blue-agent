// x402/wallet-pnl — Wallet PnL report on Base
// Price: $1.00 — Fully self-contained, no external workspace imports

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

async function getBasescanTxs(address: string): Promise<unknown[]> {
  const apiKey = process.env.BASESCAN_API_KEY;
  if (!apiKey) return [];
  try {
    const url = `https://api.etherscan.io/v2/api?chainid=8453&module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const data = await res.json() as { status: string; result?: unknown[] };
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
      ? (txs as { tokenSymbol: string; value: string; tokenDecimal: string; to?: string; timeStamp: string }[])
        .slice(0, 20).map(tx => ({
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

    const userPrompt = `Analyze this Base wallet: ${address}\n\nRecent token transactions (last 50):\n${JSON.stringify(txSummary, null, 2)}\n\nTotal transactions found: ${txs.length}`;

    const llmResponse = await callBankrLLM({
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0.5,
      maxTokens: 1200,
    });

    const result = extractJsonObject(llmResponse);
    if (!result) throw new Error("Failed to parse wallet PnL");
    return Response.json(result, { status: 200 });
  } catch (error) {
    console.error("[WalletPnL] Error:", error);
    return Response.json({ error: "Failed to analyze wallet", message: (error as Error).message }, { status: 500 });
  }
}
