// x402/whale-tracker — Smart money and whale flow analysis
// Price: $0.10 — Fully self-contained, no external workspace imports

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

async function getTokenTx(address: string, limit = 50): Promise<unknown[]> {
  const key = process.env.BASESCAN_API_KEY ?? "";
  try {
    const res = await fetch(
      `https://api.etherscan.io/v2/api?chainid=8453&module=account&action=tokentx&address=${address}&sort=desc&offset=${limit}&apikey=${key}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const data = await res.json() as { status: string; result?: unknown[] };
    return data.status === "1" ? (data.result ?? []) : [];
  } catch {
    return [];
  }
}

const SYSTEM = `You are a smart money and whale flow analyst for Base chain tokens and wallets.

Analyze large wallet movements to identify accumulation, distribution, or manipulation patterns. Smart money signals are valuable for agents making trading decisions.

Return ONLY valid JSON:

{
  "whaleActivity": "ACCUMULATING" | "DISTRIBUTING" | "NEUTRAL" | "MIXED",
  "signal": "BULLISH" | "BEARISH" | "NEUTRAL",
  "signalStrength": number (0-100),
  "topMovements": [
    {
      "address": "string (shortened)",
      "action": "string",
      "amount": "string",
      "significance": "HIGH | MEDIUM | LOW"
    }
  ],
  "patterns": ["pattern1", "pattern2"],
  "trend": "string (summary of what whales are doing)",
  "recommendation": "string (actionable signal for agents/traders)"
}`;

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { address?: string } = {};
    try {
      const text = await req.text();
      if (text?.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}
    const url = new URL(req.url);
    if (!body.address) body.address = url.searchParams.get("address") || url.searchParams.get("token") || undefined;

    const { address } = body;
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return Response.json({ error: "Provide a valid wallet or token address (0x...)" }, { status: 400 });
    }

    console.log(`[WhaleTracker] Tracking: ${address}`);

    const txs = await getTokenTx(address, 50);

    type TokenTx = { value: string; tokenDecimal?: string; from?: string; to?: string; tokenSymbol: string; timeStamp: string };

    const largeTxs = (txs as TokenTx[])
      .filter(tx => {
        const value = parseFloat(tx.value) / Math.pow(10, parseInt(tx.tokenDecimal || "18"));
        return value > 1000;
      })
      .slice(0, 15)
      .map(tx => ({
        from: tx.from?.slice(0, 10) + "...",
        to: tx.to?.slice(0, 10) + "...",
        token: tx.tokenSymbol,
        value: tx.value,
        decimals: tx.tokenDecimal,
        direction: tx.to?.toLowerCase() === address.toLowerCase() ? "IN" : "OUT",
        timestamp: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
      }));

    const llmResponse = await callBankrLLM({
      system: SYSTEM,
      messages: [{ role: "user", content: `Analyze whale/smart money activity for: ${address}\n\nLarge transactions (>1000 tokens):\n${JSON.stringify(largeTxs, null, 2)}\nTotal transactions analyzed: ${txs.length}` }],
      temperature: 0.4,
      maxTokens: 700,
    });
    const result = extractJsonObject(llmResponse);
    if (!result) throw new Error("Failed to parse whale tracker");
    return Response.json(result);
  } catch (error) {
    console.error("[WhaleTracker] Error:", error);
    return Response.json({ error: "Whale tracking failed", message: (error as Error).message }, { status: 500 });
  }
}
