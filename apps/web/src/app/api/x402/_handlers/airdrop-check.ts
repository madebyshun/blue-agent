// x402/airdrop-check — Base airdrop eligibility check
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

async function getBasescanData(address: string) {
  const key = process.env.BASESCAN_API_KEY ?? "";
  const [txRes, tokenRes] = await Promise.all([
    fetch(`https://api.etherscan.io/v2/api?chainid=8453&module=account&action=txlist&address=${address}&sort=desc&offset=100&apikey=${key}`, { signal: AbortSignal.timeout(8000) }).catch(() => null),
    fetch(`https://api.etherscan.io/v2/api?chainid=8453&module=account&action=tokentx&address=${address}&sort=desc&offset=50&apikey=${key}`, { signal: AbortSignal.timeout(8000) }).catch(() => null),
  ]);
  type ApiResp = { status: string; result?: unknown[] };
  const txData = (txRes ? await txRes.json().catch(() => ({ status: "0" })) : { status: "0" }) as ApiResp;
  const tokenData = (tokenRes ? await tokenRes.json().catch(() => ({ status: "0" })) : { status: "0" }) as ApiResp;
  return {
    txs: txData.status === "1" ? (txData.result ?? []) : [],
    tokenTxs: tokenData.status === "1" ? (tokenData.result ?? []) : [],
  };
}

const SYSTEM = `You are a Base ecosystem airdrop analyst helping users identify their eligibility for upcoming and ongoing airdrops.

Analyze wallet activity to assess airdrop eligibility likelihood. Common airdrop criteria on Base:
- Protocol interaction history (Uniswap, Aerodrome, Morpho, Coinbase CDP, etc.)
- Transaction frequency and consistency
- Wallet age and activity patterns
- NFT holdings
- Liquidity provision history
- Bridge activity (Ethereum ↔ Base)
- Use of Coinbase products (Smart Wallet, OnchainKit)

Return ONLY valid JSON:

{
  "eligibilityScore": number (0-100, higher = more likely eligible for airdrops),
  "activityLevel": "INACTIVE" | "LOW" | "MODERATE" | "HIGH" | "POWER_USER",
  "likelyEligible": ["Protocol1 (reason)", "Protocol2 (reason)"],
  "activitySignals": ["signal1", "signal2", "signal3"],
  "weaknesses": ["missing activity1", "missing activity2"],
  "recommendations": ["action1 to improve eligibility", "action2"],
  "estimatedValue": "string (rough range, e.g. '$50-500 if eligible')",
  "topOpportunities": ["opportunity1", "opportunity2"],
  "summary": "2-3 sentence summary"
}`;

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { address?: string } = {};
    try {
      const text = await req.text();
      if (text?.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}
    const url = new URL(req.url);
    if (!body.address) body.address = url.searchParams.get("address") || undefined;

    const { address } = body;
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return Response.json({ error: "Provide a valid wallet address (0x...)" }, { status: 400 });
    }

    console.log(`[AirdropCheck] Checking: ${address}`);

    const { txs, tokenTxs } = await getBasescanData(address).catch(() => ({ txs: [], tokenTxs: [] }));

    type Tx = { to?: string };
    type TokenTx = { tokenSymbol?: string };

    const uniqueContracts = [...new Set((txs as Tx[]).map(tx => tx.to).filter(Boolean))].slice(0, 20);
    const uniqueTokens = [...new Set((tokenTxs as TokenTx[]).map(tx => tx.tokenSymbol))].slice(0, 15);

    const llmResponse = await callBankrLLM({
      system: SYSTEM,
      messages: [{ role: "user", content: `Analyze airdrop eligibility for Base wallet: ${address}\n\nOnchain activity:\n- Total transactions: ${txs.length}\n- Unique contracts interacted: ${uniqueContracts.length}\n- Tokens traded: ${uniqueTokens.join(", ")}\n- Contract addresses: ${uniqueContracts.slice(0, 10).join(", ")}\n\nAssess eligibility for Base ecosystem airdrops.` }],
      temperature: 0.5,
      maxTokens: 800,
    });
    const result = extractJsonObject(llmResponse);
    if (!result) throw new Error("Failed to parse airdrop check");
    return Response.json(result);
  } catch (error) {
    console.error("[AirdropCheck] Error:", error);
    return Response.json({ error: "Airdrop check failed", message: (error as Error).message }, { status: 500 });
  }
}
