// x402/robinhood-key-exposure — Check if a wallet's public key is exposed
// on-chain on Robinhood Chain (chainId 4663). Price: $0.50.
//
// Ported from key-exposure.ts (Base). Substitutions:
//   1. Base RPC `getWalletSnapshot` → direct viem `getTransactionCount` on RH.
//   2. Basescan v2 txlist → Blockscout `/addresses/{addr}/transactions` for
//      the first-exposure timestamp (non-authoritative — just adds prose).
//
// Verdict (EXPOSED / SAFE) is computed from the real on-chain nonce — the LLM
// only writes prose, never the exposed/txCount facts.

import { createPublicClient, http, getAddress } from "viem";
import { robinhoodMainnet } from "@/lib/robinhood/chains";
import { getBlockscoutAddressTransactions } from "@/lib/blockscout";

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

const rhClient = createPublicClient({ chain: robinhoodMainnet, transport: http() });

const SYSTEM = `You are a cryptography expert explaining whether an Ethereum/Robinhood-Chain wallet's public key is exposed on-chain.

Facts (already determined from the chain — do NOT contradict them):
- When a wallet SENDS a transaction, the ECDSA signature reveals its public key. The account nonce is the exact count of sent transactions.
- nonce > 0 ⇒ public key is exposed on-chain (permanently). nonce = 0 ⇒ never sent ⇒ public key NOT exposed.
- An exposed public key is only a THEORETICAL future risk: no quantum computer can derive a private key from it today (CRQC estimated 5-15 years away).

You will be given the authoritative verdict and counts. Write ONLY the prose fields, in plain language for a non-technical user. Return ONLY valid JSON:
{ "explanation": "2-3 sentences explaining what the verdict means", "recommendation": "1-2 sentences of practical advice" }`;

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { address?: string; token?: string; wallet?: string } = {};
    try {
      const text = await req.text();
      if (text?.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}
    const url = new URL(req.url);
    // Accept address | token | wallet (LLM may pick any of these) —
    // matches the alias pattern in the other RH safety handlers.
    const address = (body.address ?? body.token ?? body.wallet ?? url.searchParams.get("address") ?? url.searchParams.get("token") ?? url.searchParams.get("wallet") ?? "").trim();
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return Response.json({ error: "Provide a valid wallet address (0x...)" }, { status: 400 });
    }
    const checksum = getAddress(address);

    console.log(`[RobinhoodKeyExposure] Checking: ${checksum}`);

    // AUTHORITATIVE: direct RH RPC `eth_getTransactionCount`. nonce > 0 is
    // irrefutable proof the public key is exposed. If the RPC read fails we
    // say so instead of guessing — mirrors the Base handler's discipline.
    let nonce: number | null = null;
    try {
      nonce = await rhClient.getTransactionCount({ address: checksum });
    } catch (e) {
      console.warn("[RobinhoodKeyExposure] RPC read failed:", (e as Error).message);
    }

    if (nonce === null) {
      return Response.json({
        address: checksum,
        chain: "robinhood",
        chainId: 4663,
        degraded: true,
        riskLevel: "UNKNOWN",
        note: "Could not read the wallet nonce from Robinhood Chain RPC — exposure status is unavailable. Please retry.",
        disclaimer: "Quantum key-exposure risk is forward-looking and theoretical — no quantum computer can break ECDSA today.",
        data_sources: ["RH RPC (getTransactionCount) — FAILED"],
      }, { status: 200 });
    }

    const exposed = nonce > 0;

    // Optional: first-exposure date from Blockscout. Non-authoritative (may
    // 404 for very old txs or if the address has no indexed activity). The
    // exposed verdict above does not depend on this.
    let firstExposureDate: string | null = null;
    if (exposed) {
      try {
        const txs = await getBlockscoutAddressTransactions(checksum, { limit: 200 });
        const outgoing = txs.filter(tx => tx.from.toLowerCase() === checksum.toLowerCase());
        // Blockscout returns newest-first; oldest outgoing is the last one.
        const firstOutgoing = outgoing.length > 0 ? outgoing[outgoing.length - 1] : null;
        if (firstOutgoing?.timestamp) firstExposureDate = firstOutgoing.timestamp;
      } catch { /* prose only — ignore */ }
    }

    const riskLevel = exposed ? "EXPOSED" : "SAFE";
    const riskScore = exposed ? 55 : 5;            // theoretical/forward-looking, never "today" risk
    const migrationUrgency = exposed ? "OPTIONAL" : "NOT_NEEDED";

    // LLM writes prose only; all facts below are computed, so it cannot fabricate.
    let prose: Record<string, unknown> = {};
    try {
      const llmResponse = await callBankrLLM({
        system: SYSTEM,
        messages: [{ role: "user", content: `Wallet: ${checksum} (Robinhood Chain, chainId 4663)\nAuthoritative verdict: ${riskLevel}\nTransactions sent (nonce): ${nonce}\nPublic key exposed: ${exposed}\nFirst send date: ${firstExposureDate ?? "unknown"}\n\nWrite the explanation and recommendation.` }],
        temperature: 0.3,
        maxTokens: 400,
      });
      prose = extractJsonObject(llmResponse) ?? {};
    } catch { /* prose is optional — facts already computed */ }

    return Response.json({
      address: checksum,
      chain: "robinhood",
      chainId: 4663,
      exposed,
      txCount: nonce,
      outgoingTxCount: nonce,
      firstExposureDate,
      riskLevel,
      riskScore,
      migrationUrgency,
      explanation: (prose.explanation as string) ?? (exposed
        ? `This wallet has sent ${nonce} transaction(s) on Robinhood Chain, so its public key is permanently visible on-chain. This is only a theoretical future risk — no quantum computer can derive your private key from it today.`
        : `This wallet has never sent a transaction on Robinhood Chain (nonce 0), so its public key is not exposed on-chain — the strongest possible position against a future quantum attacker.`),
      recommendation: (prose.recommendation as string) ?? (exposed
        ? "No action needed today. If holding long-term, consider moving funds to a fresh never-sent wallet once Ethereum ships post-quantum signatures."
        : "Keep using fresh receive-only addresses for cold storage to preserve this unexposed state."),
      data_sources: [
        "RH RPC (eth_getTransactionCount) — authoritative",
        ...(firstExposureDate ? ["Blockscout (first-exposure date)"] : []),
      ],
      disclaimer: "Quantum key-exposure risk is forward-looking and theoretical — no quantum computer can break ECDSA (secp256k1) today. 'EXPOSED' means the public key is visible, not that funds are at immediate risk.",
    });
  } catch (error) {
    console.error("[RobinhoodKeyExposure] Error:", error);
    return Response.json({ error: "Robinhood key exposure check failed", message: (error as Error).message }, { status: 500 });
  }
}
