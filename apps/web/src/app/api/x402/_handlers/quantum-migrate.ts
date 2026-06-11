// x402/quantum-migrate — Step-by-step quantum-safe wallet migration plan
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

const SYSTEM = `You are a quantum cryptography migration specialist helping Ethereum/Base wallet holders migrate to quantum-safe configurations.

Context (April 2026):
- Google/Caltech quantum computing breakthroughs have accelerated threat timelines
- ECDSA (secp256k1) wallets that have sent transactions have exposed public keys
- Migration urgency depends on wallet activity, balance, and key exposure
- Recommended tools: MetaMask, hardware wallets for cold storage, EIP-7212 aware wallets

Provide a step-by-step, actionable migration plan. Be specific about tools and timeframes.

Return ONLY valid JSON:

{
  "urgency": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  "urgencyReason": "string",
  "estimatedRisk": "string (e.g. 'High if CRQC appears in 5 years')",
  "steps": [
    {
      "step": number,
      "action": "string",
      "tool": "string (specific tool/app to use)",
      "timeEstimate": "string",
      "priority": "URGENT" | "RECOMMENDED" | "OPTIONAL",
      "details": "string"
    }
  ],
  "totalTimeEstimate": "string",
  "keyPrinciples": ["principle1", "principle2"],
  "doNotDo": ["mistake1", "mistake2"],
  "recommendation": "string (executive summary)"
}`;

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { address?: string; chain?: string; urgencyLevel?: string } = {};
    try {
      const text = await req.text();
      if (text?.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}
    const url = new URL(req.url);
    if (!body.address) body.address = url.searchParams.get("address") || undefined;
    if (!body.chain) body.chain = url.searchParams.get("chain") || "base";
    if (!body.urgencyLevel) body.urgencyLevel = url.searchParams.get("urgencyLevel") || undefined;

    const { address, chain = "base", urgencyLevel } = body;
    if (!address) return Response.json({ error: "Provide a wallet address" }, { status: 400 });
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return Response.json({ error: "Invalid address format" }, { status: 400 });
    }

    console.log(`[QuantumMigrate] Planning migration for: ${address}`);

    const llmResponse = await callBankrLLM({
      system: SYSTEM,
      messages: [{ role: "user", content: `Create quantum-safe migration plan for:\nWallet: ${address}\nChain: ${chain}\nUrgency level indicated: ${urgencyLevel ?? "Not specified — assess from wallet"}\n\nProvide max 5 steps. Be specific and actionable. Keep each step under 80 chars.` }],
      temperature: 0.3,
      maxTokens: 1800,
    });
    let result = extractJsonObject(llmResponse);
    if (!result) result = { degraded: true, note: "Synthesis briefly unavailable - please retry." };
    return Response.json(result);
  } catch (error) {
    console.error("[QuantumMigrate] Error:", error);
    return Response.json({ error: "Migration plan failed", message: (error as Error).message }, { status: 500 });
  }
}
