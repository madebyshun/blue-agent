// x402/key-exposure — Check if wallet's public key is exposed on-chain
// Price: $0.50 — Fully self-contained, no external workspace imports

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

async function getBasescanTxList(address: string, limit = 100): Promise<unknown[]> {
  const key = process.env.BASESCAN_API_KEY ?? "";
  try {
    const res = await fetch(
      `https://api.etherscan.io/v2/api?chainid=8453&module=account&action=txlist&address=${address}&sort=desc&offset=${limit}&apikey=${key}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const data = await res.json() as { status: string; result?: unknown[] };
    return data.status === "1" ? (data.result ?? []) : [];
  } catch {
    return [];
  }
}

const SYSTEM = `You are a quantum cryptography expert assessing whether an Ethereum wallet's public key has been exposed on-chain.

Critical facts:
- When a wallet SENDS a transaction, the ECDSA signature reveals the public key
- If public key is exposed, a sufficiently powerful quantum computer could derive the private key
- Wallets that have ONLY received funds (never sent) have unexposed public keys = safer
- Even 1 outgoing transaction = public key exposed forever on-chain

Return ONLY valid JSON:

{
  "address": "string",
  "exposed": boolean,
  "txCount": number,
  "outgoingTxCount": number,
  "firstExposureDate": "string or null",
  "riskLevel": "SAFE" | "EXPOSED" | "CRITICAL",
  "riskScore": number (0-100),
  "explanation": "string (clear explanation for non-technical users)",
  "migrationUrgency": "URGENT" | "RECOMMENDED" | "OPTIONAL" | "NOT_NEEDED",
  "recommendation": "string"
}`;

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { address?: string; chain?: string } = {};
    try {
      const text = await req.text();
      if (text?.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}
    const url = new URL(req.url);
    if (!body.address) body.address = url.searchParams.get("address") || undefined;
    if (!body.chain) body.chain = url.searchParams.get("chain") || "base";

    const { address } = body;
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return Response.json({ error: "Provide a valid wallet address (0x...)" }, { status: 400 });
    }

    console.log(`[KeyExposure] Checking: ${address}`);

    const txs = await getBasescanTxList(address, 100);
    const outgoing = (txs as { from?: string; timeStamp?: string }[]).filter(
      tx => tx.from?.toLowerCase() === address.toLowerCase()
    );
    const firstOutgoing = outgoing.length > 0 ? outgoing[outgoing.length - 1] : null;

    const llmResponse = await callBankrLLM({
      system: SYSTEM,
      messages: [{ role: "user", content: `Check public key exposure for wallet: ${address}\n\nOnchain data:\n- Total transactions: ${txs.length}\n- Outgoing transactions (sent by wallet): ${outgoing.length}\n- First outgoing tx date: ${firstOutgoing ? new Date(parseInt((firstOutgoing as { timeStamp: string }).timeStamp) * 1000).toISOString() : "None found"}\n\nBased on this data, assess quantum exposure risk.` }],
      temperature: 0.2,
      maxTokens: 600,
    });
    const result = extractJsonObject(llmResponse);
    if (!result) throw new Error("Failed to parse exposure check");
    return Response.json(result);
  } catch (error) {
    console.error("[KeyExposure] Error:", error);
    return Response.json({ error: "Key exposure check failed", message: (error as Error).message }, { status: 500 });
  }
}
