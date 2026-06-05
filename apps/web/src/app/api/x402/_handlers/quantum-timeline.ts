// x402/quantum-timeline — Quantum threat timeline for blockchain wallets
// Price: $0.40 — Fully self-contained, no external workspace imports

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

const SYSTEM = `You are a quantum computing threat analyst specializing in cryptographic risks to blockchain networks.

Today is 2026. Key recent developments:
- Google Willow chip (2024): 105 qubits, error-correction breakthrough
- Google/Caltech announcement (March 2026): significant milestone in logical qubit scaling
- Current estimate for CRQC (Cryptographically Relevant Quantum Computer): 5-15 years away
- Harvest-now-decrypt-later: adversaries storing encrypted data to decrypt when CRQC arrives
- Ethereum post-quantum roadmap: EIP-7212, quantum-resistant signature schemes in development

Provide an honest, evidence-based timeline. Do not over-alarm or under-alarm.

Return ONLY valid JSON:

{
  "currentThreatLevel": "THEORETICAL" | "EMERGING" | "NEAR" | "CRITICAL",
  "currentYear": "2026",
  "yearsUntilPracticalRisk": "string (e.g. '5-15 years for CRQC')",
  "milestones": [
    {
      "year": "string",
      "event": "string",
      "impactOnWallets": "string",
      "probability": "LOW | MEDIUM | HIGH"
    }
  ],
  "harvestNowRisk": "string (current risk from data harvesting)",
  "ethereumResponse": "string (what Ethereum/Base is doing)",
  "forYourWallet": "string (personalized advice based on query)",
  "actionableNow": ["action1", "action2"],
  "recommendation": "string"
}`;

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { address?: string; concern?: string } = {};
    try {
      const text = await req.text();
      if (text?.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}
    const url = new URL(req.url);
    if (!body.address) body.address = url.searchParams.get("address") || undefined;
    if (!body.concern) body.concern = url.searchParams.get("concern") || undefined;

    console.log("[QuantumTimeline] Generating timeline");

    const llmResponse = await callBankrLLM({
      system: SYSTEM,
      messages: [{ role: "user", content: `Generate quantum threat timeline.\nWallet context: ${body.address ?? "General inquiry"}\nSpecific concern: ${body.concern ?? "General quantum timeline for crypto"}\n\nProvide 4-5 milestone events from 2026 to 2035. Be evidence-based.` }],
      temperature: 0.4,
      maxTokens: 1500,
    });
    const result = extractJsonObject(llmResponse);
    if (!result) throw new Error("Failed to parse timeline");
    return Response.json(result);
  } catch (error) {
    console.error("[QuantumTimeline] Error:", error);
    return Response.json({ error: "Timeline generation failed", message: (error as Error).message }, { status: 500 });
  }
}
