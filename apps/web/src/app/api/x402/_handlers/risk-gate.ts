// x402/risk-gate
// Transaction risk gate — pre-trade risk assessment before executing any tx on Base
// Price: $0.20 — verdict: PROCEED / CAUTION / ABORT / UNKNOWN (code-mapped, W0-19)
//
// 🔴 THE VERDICT IS ARITHMETIC ON WHAT WAS MEASURED (W0-19, 2026-09-30).
// Until then it came from `risk_score`, a number the model made up (and 50 —
// CAUTION — when it made up nothing), ORed with `known_drainer`/`known_phishing`
// from a second model pass that has no drainer list to consult. That is a
// verdict chosen by a model, and a negative inferred from absent data — both
// forbidden by CLAUDE.md. `measuredRiskVerdict` below decides from:
//   • what the transaction does   — value moved? calldata present? an
//     unlimited approve / setApprovalForAll decoded from the calldata?
//   • what the target is          — EOA / 7702 wallet / contract, verified?
//   • if the target is a token    — the measured honeypot verdict (tax read)
// The model still writes the assessment and its flags, labelled as its own.

import { getTokenIdentity } from "@/lib/onchain";
import { callLLM } from "@/app/api/_lib/llm";
import { readTokenTax } from "@/lib/token-tax";
import { measuredHoneypotVerdict, type HoneypotVerdict } from "./honeypot-check";

export type RiskGateVerdict = "PROCEED" | "CAUTION" | "ABORT" | "UNKNOWN";

const MAX_UINT_HALF = 2n ** 255n; // "unlimited" approvals are max-uint or close to it

/** Decode the approval shapes that hand a spender the wallet's tokens. */
export function decodeApproval(data: string): "unlimited" | "operator" | null {
  const d = (data ?? "").toLowerCase();
  if (!/^0x[0-9a-f]*$/.test(d) || d.length < 10) return null;
  const sel = d.slice(0, 10);
  const word = (i: number) => d.slice(10 + i * 64, 10 + (i + 1) * 64);
  try {
    if (sel === "0x095ea7b3" || sel === "0x39509351") {        // approve / increaseAllowance
      const amt = BigInt("0x" + (word(1) || "0"));
      return amt >= MAX_UINT_HALF ? "unlimited" : null;
    }
    if (sel === "0xa22cb465") {                                 // setApprovalForAll
      return BigInt("0x" + (word(1) || "0")) !== 0n ? "operator" : null;
    }
  } catch { /* malformed calldata: not an approval we can read */ }
  return null;
}

export interface RiskFacts {
  movesValue: boolean;
  hasCalldata: boolean;
  isContract: boolean;
  isToken: boolean;
  verified: boolean;
  isDelegatedEoa: boolean;
  approval: "unlimited" | "operator" | null;
  /** Only for a token target; null when the target is not a token. */
  honeypot: HoneypotVerdict | null;
}

/** THE verdict. Every branch names the measured fact that decided it. */
export function measuredRiskVerdict(f: RiskFacts): { verdict: RiskGateVerdict; reasons: string[] } {
  if (f.honeypot === "HONEYPOT") {
    return { verdict: "ABORT", reasons: ["the target token measures as a honeypot (sell tax ≥ 50%) — it cannot be sold"] };
  }
  if (f.approval === "unlimited") {
    return { verdict: "CAUTION", reasons: ["the calldata grants an UNLIMITED token allowance — the spender can take the whole balance, now or later"] };
  }
  if (f.approval === "operator") {
    return { verdict: "CAUTION", reasons: ["the calldata is setApprovalForAll(true) — the operator can move every token in the collection"] };
  }
  if (!f.movesValue && !f.hasCalldata) {
    return { verdict: "PROCEED", reasons: ["no value and no calldata — the transaction moves nothing and executes nothing"] };
  }
  if (f.honeypot === "SUSPICIOUS") {
    return { verdict: "CAUTION", reasons: ["the target token has a measured sell lever (blacklist function or sell tax ≥ 10%)"] };
  }
  if (f.honeypot === "UNKNOWN") {
    return { verdict: "UNKNOWN", reasons: ["the target token's buy/sell tax could not be read — nothing measured either way"] };
  }
  if (f.isContract && !f.isToken && !f.isDelegatedEoa && f.hasCalldata && !f.verified) {
    return { verdict: "UNKNOWN", reasons: ["calldata into an UNVERIFIED contract — what it executes cannot be read from source"] };
  }
  return { verdict: "PROCEED", reasons: ["no measured risk signal for this transaction"] };
}

type Msg = { role: string; content: string };

// Bankr LLM (llm.bankr.bot) was 403-banned 2026-07-20 → route through callLLM
// (Virtuals). Signature/temperature defaults preserved so call sites are unchanged.
async function llm(system: string, user: string, temp = 0.2, tokens = 700): Promise<string> {
  return (await callLLM({ system, messages: [{ role: "user", content: user }] as Msg[], temperature: temp, maxTokens: tokens })).text;
}

function parseJson(t: string): Record<string, unknown> | null {
  let s = t.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const i = s.indexOf("{"), j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  try { return JSON.parse(s); } catch {
    try { return JSON.parse(s.replace(/[\x00-\x1F\x7F]/g, " ")); } catch { return null; }
  }
}

// Look up address type on Basescan
async function getAddressInfo(address: string): Promise<{
  isContract: boolean;
  verified: boolean;
  contractName: string | null;
  raw: string;
}> {
  const apiKey = process.env.BASESCAN_API_KEY ?? "";
  const base = "https://api.etherscan.io/v2/api?chainid=8453";
  const def = { isContract: false, verified: false, contractName: null, raw: "Basescan unavailable" };

  try {
    const res = await fetch(
      `${base}&module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`,
      { signal: AbortSignal.timeout(7000) }
    );
    if (!res.ok) return def;
    const data = await res.json() as { status: string; result?: { ContractName?: string; SourceCode?: string; ABI?: string }[] };
    if (data.status !== "1" || !data.result?.length) return def;
    const info   = data.result[0];
    const hasABI = info.ABI && info.ABI !== "Contract source code not verified";
    const verified = !!info.SourceCode && info.SourceCode.length > 0;
    return {
      isContract:   hasABI || verified,
      verified,
      contractName: info.ContractName ?? null,
      raw: `${verified ? `Verified contract: ${info.ContractName}` : "Contract source not verified or EOA"}.`,
    };
  } catch {
    return def;
  }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { action?: string; to?: string; value?: string; data?: string; token?: string; amount?: string } = {};
    try {
      const t = await req.text();
      if (t?.trim().startsWith("{")) body = JSON.parse(t);
    } catch {}

    const url = new URL(req.url);
    // Accept `to` or `token` or `address` as the target
    const to     = (body.to ?? body.token ?? url.searchParams.get("to") ?? url.searchParams.get("token") ?? "").trim();
    const action = (body.action ?? url.searchParams.get("action") ?? "transfer").trim();
    const value  = body.value ?? body.amount ?? url.searchParams.get("value") ?? "";
    const data   = body.data ?? "";

    if (!to) {
      return Response.json({ error: "to address is required (target contract or wallet)" }, { status: 400 });
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(to)) {
      return Response.json({ error: "Invalid address format. Must be 0x + 40 hex chars." }, { status: 400 });
    }

    // Authoritative contract detection via on-chain eth_getCode, plus the
    // Basescan verification lookup (verified source / contract name) in parallel.
    // eth_getCode — not Basescan — decides EOA vs contract.
    const [addrInfo, identity] = await Promise.all([
      getAddressInfo(to),
      getTokenIdentity(to),
    ]);
    const isContract = identity?.isContract ?? addrInfo.isContract;
    // An EIP-7702 delegated EOA has bytecode, so `addrInfo` (Basescan ABI/verified)
    // reads it as an unverified contract. getTokenIdentity resolves the designator
    // and returns isContract:false, which is why identity wins the `??` above.
    const delegation = identity?.delegation ?? null;
    const tokenDesc = identity?.isToken
      ? `Target is an ERC-20 token: ${identity.name ?? "?"} (${identity.symbol ?? "?"})`
      : delegation
      ? `Target is an externally-owned account (EOA / wallet) that has delegated its code to ${delegation.address} under EIP-7702${delegation.label ? ` ("${delegation.label}", verified on Basescan)` : " (delegate source unverified)"}. This is a normal wallet upgrade. Do NOT call it an unverified contract and do NOT raise the risk score because it has code.`
      : isContract ? "Target is a smart contract (non-token or unrecognized)" : "Target is an externally-owned account (EOA / wallet)";

    const txCtx = `
Transaction details (Base mainnet, chain ID 8453):
Action: ${action}
Target address: ${to}
Value: ${value || "0 ETH"}
Calldata present: ${data ? "yes" : "no"}
Target type (from on-chain eth_getCode — authoritative): ${delegation ? "EOA with an EIP-7702 delegation" : isContract ? "contract" : "EOA"}
${tokenDesc}
Basescan source verified: ${addrInfo.verified}
Contract name: ${addrInfo.contractName ?? "unknown"}
${addrInfo.raw}
`.trim();

    // Two passes in parallel: risk assessment + AML signal. The second keeps
    // its "You are MiroShark" prefix (retired persona, load-bearing prefix) —
    // see the 🔴 CANONICAL NOTE in api/_lib/llm.ts.
    const [blueRaw, msRaw] = await Promise.all([
      llm(
        `You are Blue Agent — transaction risk guard for Base (chain ID 8453).
Assess the risk of this transaction BEFORE it is executed.
Focus on: malicious contract patterns, phishing addresses, unusual calldata, AML red flags, drain/approval abuse, known attack vectors.

SCORE THE ACTION, NOT JUST THE TARGET (critical — avoid false ABORTs):
- Risk is about what THIS transaction does. A read-only action (e.g. "scan", "read", "view") and any transaction with value 0 AND no calldata transfers nothing and executes nothing — score it low (0-20) regardless of the target's verification status.
- Unverified source code is common for legitimate tokens and is NOT, by itself, grounds for CAUTION or ABORT. Do not raise the score solely because the target is unverified.
- Reserve high scores (>40) for transactions that actually move value, grant approvals, or execute calldata into a target with concrete red flags, and reserve ABORT (>70) for known drainers/phishing or clear drain/approval-abuse patterns.

CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "risk_score": <0-100>,
  "risk_level": "low|medium|high|critical",
  "red_flags": ["<flag>" or empty],
  "attack_vectors": ["<vector>" or empty],
  "aml_signals": ["<signal>" or empty],
  "assessment": "<2-3 sentences — is this transaction safe to execute?>"
}`,
        txCtx,
        0.2,
        600
      ),
      llm(
        `You are MiroShark — degen risk intelligence on Base.
Assess community risk signals for this transaction target — known drainer? phishing? rugpull history? suspicious contract?
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "community_risk": "none|low|medium|high",
  "known_drainer": <boolean>,
  "known_phishing": <boolean>,
  "risk_signals": ["<signal>" or empty],
  "community_assessment": "<1-2 sentences>"
}`,
        txCtx,
        0.3,
        400
      ),
    ]);

    const blue = parseJson(blueRaw) ?? {
      risk_score: 50,
      risk_level: "medium",
      red_flags: [],
      attack_vectors: [],
      aml_signals: [],
      assessment: "Unable to fully assess risk. Proceed with caution.",
    };

    const ms = parseJson(msRaw) ?? {
      community_risk: "medium",
      known_drainer: false,
      known_phishing: false,
      risk_signals: [],
      community_assessment: "No community data available.",
    };

    // W0-19: the verdict from measurements (see the header). A token target
    // gets the same measured honeypot read honeypot-check uses.
    const valueNum = parseFloat(String(value ?? ""));
    const movesValue = Number.isFinite(valueNum) ? valueNum > 0 : !!value && String(value).trim() !== "0";
    const honeypot = identity?.isToken ? measuredHoneypotVerdict(await readTokenTax(to)).verdict : null;
    const measured = measuredRiskVerdict({
      movesValue,
      hasCalldata: !!data && data !== "0x",
      isContract,
      isToken: !!identity?.isToken,
      verified: addrInfo.verified,
      isDelegatedEoa: !!delegation,
      approval: decodeApproval(data),
      honeypot,
    });
    const verdict = measured.verdict;
    const action_out =
      verdict === "ABORT" ? "DO_NOT_EXECUTE"
      : verdict === "CAUTION" ? "REVIEW_CAREFULLY"
      : verdict === "UNKNOWN" ? "VERIFY_BEFORE_EXECUTING"
      : "SAFE_TO_EXECUTE";
    // A bucket OF the verdict, never a model's number; null when nothing was
    // measured rather than a middling score that reads like a measurement.
    const riskScore = verdict === "ABORT" ? 90 : verdict === "CAUTION" ? 50 : verdict === "PROCEED" ? 10 : null;
    const riskLevel = verdict === "ABORT" ? "critical" : verdict === "CAUTION" ? "medium" : verdict === "PROCEED" ? "low" : "unknown";

    return Response.json({
      tool: "risk-gate",
      timestamp: new Date().toISOString(),
      transaction: {
        action,
        to,
        value: value || "0",
        hasCalldata: !!data,
      },
      chain: "base",
      chainId: 8453,
      target: {
        isContract,
        account_type: delegation ? "eoa_7702" : isContract ? "contract" : "eoa",
        delegate: delegation
          ? { address: delegation.address, label: delegation.label, verified: delegation.verified, explorer: `https://basescan.org/address/${delegation.address}` }
          : null,
        // For a 7702 EOA this is the EOA's own (always-absent) verification, not
        // the delegate's — read `delegate.verified` for that one.
        verified:   addrInfo.verified,
        contractName: addrInfo.contractName ?? (identity?.isToken ? `${identity.name ?? ""} (${identity.symbol ?? ""})`.trim() : null),
        url: `https://basescan.org/address/${to}`,
      },
      verdict,
      action: action_out,
      // Why, in measured terms — the only reasons the verdict had.
      verdict_basis: measured.reasons,
      token_honeypot: honeypot,
      risk_score:  riskScore,
      risk_level:  riskLevel,
      red_flags:   blue.red_flags ?? [],
      attack_vectors: blue.attack_vectors ?? [],
      aml_signals: blue.aml_signals ?? [],
      community: {
        risk:         ms.community_risk ?? "medium",
        known_drainer: ms.known_drainer ?? false,
        known_phishing: ms.known_phishing ?? false,
        risk_signals: ms.risk_signals ?? [],
        assessment:   ms.community_assessment ?? "",
        model_generated: true,
      },
      // What the model passes thought — labelled, and NOT a verdict input.
      model_opinion: {
        risk_score: typeof blue.risk_score === "number" ? blue.risk_score : null,
        risk_level: blue.risk_level ?? null,
        note: "model-generated opinion (no drainer/phishing list behind it) — not an input to verdict or action",
      },
      assessment: blue.assessment ?? "",
    });
  } catch (error) {
    console.error("[RiskGate]", error);
    return Response.json(
      { error: "Risk gate check failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
