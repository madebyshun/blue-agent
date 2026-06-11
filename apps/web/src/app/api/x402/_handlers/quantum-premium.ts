// x402/quantum-premium — Quantum vulnerability score for any wallet
// Price: $1.50 — Fully self-contained, no external workspace imports

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

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { address?: string; chain?: string } = {};
    try {
      const text = await req.text();
      if (text && text.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}
    const url = new URL(req.url);
    if (!body.address) {
      body.address = url.searchParams.get("address") || undefined;
      body.chain = url.searchParams.get("chain") || "base";
    }

    const { address, chain = "base" } = body;
    if (!address) {
      return Response.json({ error: "Please provide a wallet address" }, { status: 400 });
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return Response.json({ error: "Invalid wallet address format. Must be a valid 0x Ethereum address." }, { status: 400 });
    }

    console.log(`[QuantumPremium] Analyzing: ${address} on ${chain}`);

    const systemPrompt = `You are a quantum cryptography security expert analyzing blockchain wallet vulnerabilities in the context of near-future quantum computing threats (2025-2030 horizon).

Context: In March 2026, Google and Caltech announced significant quantum computing breakthroughs, accelerating timelines for quantum threats to ECDSA (secp256k1) and other elliptic curve cryptography used in Ethereum/Base wallets.

Key facts you must know:
- Ethereum addresses use ECDSA (secp256k1) — currently quantum-resistant IF the public key is not exposed
- Public keys are exposed on-chain when a wallet has sent a transaction (the signature reveals the public key)
- Wallets that have NEVER sent a transaction have unexposed public keys — safer against quantum attacks
- Hardware wallets do NOT protect against quantum attacks — they only protect the private key from classical attacks
- Migration path: move funds to a fresh wallet that has never sent a transaction, or wait for Ethereum's post-quantum signature upgrade (EIP-7212 and future proposals)
- Quantum threat timeline: Current estimates suggest harvest-now-decrypt-later attacks are possible, but real-time key cracking requires a cryptographically relevant quantum computer (CRQC) — estimated 5-15 years away

CRITICAL: Return ONLY raw JSON. No markdown. No backticks. Start with { and end with }.

{
  "address": "string",
  "risk": "CRITICAL | HIGH | MEDIUM | LOW | MINIMAL",
  "score": <0-100>,
  "exposed": <true if public key exposed via sent txs>,
  "timeline": "e.g. 5-10 years for practical attack",
  "verdict": "MIGRATE_NOW | MIGRATE_SOON | MONITOR | SAFE",
  "vulnerabilities": ["vuln1", "vuln2"],
  "steps": ["migration step1", "step2"],
  "summary": "2-3 sentence plain-English summary"
}`;

    const userMessage = `Analyze quantum computing risk for this ${chain} wallet: ${address}. Return compact JSON only — keep all string values under 100 chars. Max 3 vulnerabilities, max 3 migration steps.`;

    const llmResponse = await callBankrLLM({
      model: "claude-haiku-4-5",
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      temperature: 0.5,
      maxTokens: 900,
    });

    let result = extractJsonObject(llmResponse);
    if (!result) result = { degraded: true, note: "Synthesis briefly unavailable - please retry." };
    return Response.json(result, { status: 200 });
  } catch (error) {
    console.error("[QuantumPremium] Error:", error);
    return Response.json(
      { error: "Failed to generate quantum risk report", message: (error as Error).message },
      { status: 500 }
    );
  }
}
