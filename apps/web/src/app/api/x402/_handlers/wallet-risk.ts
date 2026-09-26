// x402/wallet-risk — on-chain risk profile for any Base wallet
// Price: $0.15 — counts computed in code, risk_score/flags from the LLM over real
// Moralis tx data. Verdict is hard-mapped from the score, never LLM-chosen.
//
// 🔴 CLEAN IS A FINDING, NOT A DEFAULT. Two lines in this file used to hand out
// a clean bill of health for the absence of data:
//   `if (tx_count === 0) → verdict "CLEAN"`, whose own note admitted the cause
//   might be "fresh wallet OR DATA UNAVAILABLE", and
//   `if (risk_score == null) → verdict = "CLEAN"`.
// MEASURED 2026-09-26: Moralis returns 401 "Your Moralis Free usage is paused"
// on every endpoint, the two fetchers turned that into `[]`, and all three test
// wallets — including one with 59 transactions — came back
// `tx_count: 0, verdict: "CLEAN"` with HTTP 200. A compliance tool that says
// CLEAN when it cannot see is worse than one that is merely down, because the
// caller acts on it.
//
// So: an unread count is `null`, an unmade assessment is `UNKNOWN`, and both
// return 502 — `route.ts` settles USDC only on 2xx, so a 200 carrying
// `status:"error"` would bill the caller for the outage.
//
// The Base RPC nonce is read alongside as ground truth. It cannot replace the
// transfer history (it counts only OUTBOUND transactions), but it can catch the
// indexer lying: nonce > 0 while the indexer reports no activity is not an
// empty wallet, it is a bad read.

import {
  getMoralisNativeTxResult,
  getMoralisERC20TransfersResult,
  type UpstreamError,
} from "@/lib/moralis";
import { getRpcWalletState } from "@/lib/onchain";
import { callLLM } from "@/app/api/_lib/llm";

type BankrMessage = { role: string; content: string };

async function callBankrLLM(opts: {
  model?: string; system: string; messages: BankrMessage[];
  temperature?: number; maxTokens?: number;
}): Promise<string> {
  return (await callLLM({ system: opts.system, messages: opts.messages, temperature: opts.temperature, maxTokens: opts.maxTokens })).text;
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  let raw = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s >= 0 && e > s) raw = raw.slice(s, e + 1);
  try { return JSON.parse(raw); } catch {}
  try { return JSON.parse(raw.replace(/[\x00-\x1F\x7F]/g, " ")); } catch {}
  return null;
}

const SYSTEM = `You are a Base chain analyst assessing wallet risk from on-chain activity. Use ONLY the data provided. NEVER invent numbers, addresses, or token names not in the data. Return ONLY raw JSON starting with {. No markdown. If data unavailable, return field as null — never estimate.

You are given a wallet's transaction profile (counts already computed). Assess risk patterns: mixer/tumbler interaction, structuring (many small round-number transfers), rapid layering, spam-token dusting, ties to known-risky behaviour, abnormal velocity.

Return ONLY raw JSON:
{
  "risk_score": number (0-100, higher = riskier; null if you cannot assess),
  "flags": ["short risk flag", "..."],
  "aml_signals": ["specific AML pattern observed", "..."]
}`;

const TX_LIMIT = 100;

/** No verdict, no counts, no charge. Every numeric field is null rather than 0
 *  so a consumer cannot mistake an outage for a quiet wallet. */
function failLoud(address: string, error: UpstreamError, partial: Record<string, unknown> = {}): Response {
  return Response.json({
    tool: "wallet-risk",
    address,
    status: "error",
    risk_score: null,
    verdict: "UNKNOWN",
    flags: null,
    aml_signals: null,
    tx_count: null,
    unique_counterparties: null,
    ...partial,
    error,
    note: "Transaction history could not be read, so no risk assessment was made. This is NOT a clean result — you were not charged.",
    timestamp: new Date().toISOString(),
  }, { status: 502 });
}

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

    console.log(`[WalletRisk] Profiling: ${address}`);

    const [nativeRes, tokenRes, rpc] = await Promise.all([
      getMoralisNativeTxResult(address, TX_LIMIT),
      getMoralisERC20TransfersResult(address, TX_LIMIT),
      getRpcWalletState(address),
    ]);

    const outbound_tx_count = rpc ? rpc.nonce : null;

    // Either half missing means the count would be an UNDERCOUNT presented as a
    // count — the same failure as reporting zero, just less obvious. Fail both.
    if (!nativeRes.ok || !tokenRes.ok) {
      const error = !nativeRes.ok ? nativeRes.error : (tokenRes as { ok: false; error: UpstreamError }).error;
      return failLoud(address, error, { outbound_tx_count });
    }

    type Tx = { from_address?: string; to_address?: string; value?: string; block_timestamp?: string; receipt_status?: string };
    type TokenTx = { from_address?: string; to_address?: string; token_symbol?: string; possible_spam?: boolean };

    const nativeTxs = nativeRes.data as Tx[];
    const tokenTxs = tokenRes.data as TokenTx[];
    const cleanTokenTxs = tokenTxs.filter((t) => !t.possible_spam);

    // Counts computed in CODE — never trusted to the LLM.
    const tx_count = nativeTxs.length + cleanTokenTxs.length;
    const tx_sample_capped = nativeTxs.length >= TX_LIMIT || tokenTxs.length >= TX_LIMIT;

    // The indexer says nothing happened; the chain says this address has sent
    // `nonce` transactions. Both cannot be true. Refuse rather than pick.
    if (tx_count === 0 && outbound_tx_count != null && outbound_tx_count > 0) {
      return failLoud(address, {
        source: "moralis+base-rpc",
        code: "UPSTREAM_INCONSISTENT",
        message: `Base RPC reports nonce ${outbound_tx_count} (this address has sent ${outbound_tx_count} transactions) but the indexer returned no history at all. The history read is wrong, not the wallet.`,
      }, { outbound_tx_count });
    }

    const counterparties = new Set<string>();
    const self = address.toLowerCase();
    for (const t of nativeTxs) {
      if (t.from_address && t.from_address.toLowerCase() !== self) counterparties.add(t.from_address.toLowerCase());
      if (t.to_address && t.to_address.toLowerCase() !== self) counterparties.add(t.to_address.toLowerCase());
    }
    for (const t of cleanTokenTxs) {
      if (t.from_address && t.from_address.toLowerCase() !== self) counterparties.add(t.from_address.toLowerCase());
      if (t.to_address && t.to_address.toLowerCase() !== self) counterparties.add(t.to_address.toLowerCase());
    }
    const unique_counterparties = counterparties.size;

    // Genuinely empty — and now we can say so, because the read succeeded and
    // the nonce agrees. Still not "CLEAN": nothing was assessed.
    if (tx_count === 0) {
      return Response.json({
        tool: "wallet-risk",
        address,
        status: "empty",
        risk_score: null,
        verdict: "UNKNOWN",
        flags: [],
        aml_signals: [],
        tx_count: 0,
        unique_counterparties: 0,
        outbound_tx_count,
        note: "No on-chain transaction history found on Base. The read succeeded — this wallet really is unused — so there is nothing to assess, which is not the same as a clean record.",
        data_source: "Moralis + Base RPC",
        timestamp: new Date().toISOString(),
      });
    }

    const profile = {
      tx_count,
      unique_counterparties,
      spam_token_transfers: tokenTxs.length - cleanTokenTxs.length,
      token_symbols: [...new Set(cleanTokenTxs.map((t) => t.token_symbol).filter(Boolean))].slice(0, 12),
      recent_native: nativeTxs.slice(0, 8).map((t) => ({
        direction: t.from_address?.toLowerCase() === self ? "OUT" : "IN",
        value_wei: t.value ?? null,
        status: t.receipt_status ?? null,
        timestamp: t.block_timestamp ? new Date(t.block_timestamp).toISOString() : null,
      })),
    };

    let llmResponse = "";
    let llmFailed = false;
    try {
      llmResponse = await callBankrLLM({
        system: SYSTEM,
        messages: [{ role: "user", content: `Assess risk for Base wallet ${address}.\n\nComputed profile (counts are authoritative — do not recompute):\n${JSON.stringify(profile, null, 2)}` }],
        temperature: 0.2,
        maxTokens: 600,
      });
    } catch {
      llmFailed = true;
    }

    const parsed = llmFailed ? null : extractJsonObject(llmResponse);

    // risk_score: clamp to 0-100, else null. flags/aml_signals: arrays or [].
    let risk_score: number | null = null;
    if (parsed && typeof parsed.risk_score === "number" && Number.isFinite(parsed.risk_score)) {
      risk_score = Math.max(0, Math.min(100, Math.round(parsed.risk_score)));
    }
    const flags = parsed && Array.isArray(parsed.flags) ? (parsed.flags as unknown[]).map(String) : [];
    const aml_signals = parsed && Array.isArray(parsed.aml_signals) ? (parsed.aml_signals as unknown[]).map(String) : [];

    // Verdict hard-mapped from score in CODE — deterministic, never LLM-chosen.
    // No score means no verdict. UNKNOWN is the only honest answer when the
    // assessment step did not produce one; CLEAN here would be a fabrication.
    let verdict: "CLEAN" | "SUSPICIOUS" | "HIGH_RISK" | "UNKNOWN";
    if (risk_score == null) verdict = "UNKNOWN";
    else if (risk_score >= 70) verdict = "HIGH_RISK";
    else if (risk_score >= 40) verdict = "SUSPICIOUS";
    else verdict = "CLEAN";

    const out: Record<string, unknown> = {
      tool: "wallet-risk",
      address,
      status: "ok",
      risk_score,
      verdict,
      flags,
      tx_count,
      unique_counterparties,
      outbound_tx_count,
      tx_sample_capped,
      aml_signals,
      data_source: "Moralis + Base RPC",
      timestamp: new Date().toISOString(),
    };
    if (tx_sample_capped) {
      out.tx_count_note = `History is a capped sample of the ${TX_LIMIT} most recent entries per source, so tx_count is a floor, not a total.`;
    }
    if (!parsed) {
      out.note = "Counts are real and were read successfully, but the risk synthesis step returned nothing usable, so no score and no verdict were assigned. Retry for an assessment.";
    }
    return Response.json(out);
  } catch (error) {
    console.error("[WalletRisk] Error:", error);
    return Response.json(
      { error: "Wallet risk analysis failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
