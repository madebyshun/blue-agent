// x402/alert-check — Check active alert triggers for any address
// Price: $0.10 — never reports "all clear" when the data simply failed to load.

import { getWalletSnapshot } from "@/lib/onchain";
import { getMoralisNativeTx, getMoralisERC20Transfers } from "@/lib/moralis";

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
  const [nativeTxs, tokenTxs] = await Promise.all([
    getMoralisNativeTx(address, 20).catch(() => []),
    getMoralisERC20Transfers(address, 20).catch(() => []),
  ]);
  return {
    txs: nativeTxs,
    tokenTxs: tokenTxs.filter((t) => !t.possible_spam),
  };
}

const SYSTEM = `You are a blockchain alert engine analyzing on-chain data for alert triggers.

Check the provided data and determine which alerts should fire.

Return ONLY valid JSON:
{
  "alerts": [
    {
      "topic": "whale_movement" | "circuit_breaker" | "quantum_exposure" | "honeypot_detected" | "rug_risk",
      "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      "message": "string (human-readable alert message)",
      "actionRequired": "string (what to do)",
      "data": {}
    }
  ],
  "summary": "string",
  "nextCheckIn": "string (e.g. '5 minutes')"
}`;

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { address?: string; agentId?: string; topics?: string[] } = {};
    try {
      const text = await req.text();
      if (text?.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}
    const url = new URL(req.url);
    if (!body.address) body.address = url.searchParams.get("address") || undefined;

    const { address, agentId, topics = ["whale_movement", "rug_risk"] } = body;
    if (!address) return Response.json({ error: "address is required" }, { status: 400 });

    console.log(`[AlertCheck] Checking alerts for: ${address}`);

    const [{ txs, tokenTxs }, snap] = await Promise.all([
      getBasescanData(address).catch(() => ({ txs: [], tokenTxs: [] })),
      getWalletSnapshot(address),
    ]);

    // Guard: if no transactions were readable, do NOT report a silent "all clear"
    // — that would hide a whale/rug alert behind a failed data fetch. nonce
    // disambiguates a genuinely idle wallet from a data outage.
    const nonce = snap?.txCount ?? null;
    if (txs.length === 0 && tokenTxs.length === 0) {
      const idle = nonce === 0;
      return Response.json({
        address,
        status: idle ? "NO_ACTIVITY" : "DATA_UNAVAILABLE",
        alerts: [],
        summary: idle
          ? "No on-chain activity for this wallet — no alert conditions to evaluate."
          : "Could not read recent on-chain activity (data source unavailable). This is NOT an all-clear — re-check shortly.",
        nextCheckIn: "5 minutes",
        dataSource: "Basescan recent activity + live Base RPC nonce",
      });
    }

    const llmResponse = await callBankrLLM({
      system: SYSTEM,
      messages: [{ role: "user", content: `Check alerts for address: ${address}
Agent ID: ${agentId ?? "unknown"}
Topics to check: ${topics.join(", ")}

Recent transactions (last 20):
${JSON.stringify((txs as unknown[]).slice(0, 10), null, 2)}

Recent token transfers:
${JSON.stringify((tokenTxs as unknown[]).slice(0, 10), null, 2)}

Analyze for alert conditions and fire any that are triggered.` }],
      temperature: 0.2,
      maxTokens: 800,
    });
    let result = extractJsonObject(llmResponse);
    if (!result) result = { degraded: true, note: "Synthesis briefly unavailable - please retry." };
    return Response.json(result);
  } catch (error) {
    console.error("[AlertCheck] Error:", error);
    return Response.json({ error: "Alert check failed", message: (error as Error).message }, { status: 500 });
  }
}
