// x402/sign-check — "what will signing this do?" PASS / WARN / BLOCK.
// Price: free (safety checks should never be gated — same rule as pre-trade-check)
//
// The question a wallet should answer before the user signs, for the three
// things a dapp asks a wallet to sign: a transaction (decoded + simulated with
// eth_simulateV1), EIP-712 typed data (Permit, Permit2, Seaport — decoded,
// since an off-chain signature moves nothing until it is spent), and an
// EIP-7702 authorization. All logic in lib/sign-check.ts; no LLM.

import { signCheck } from "@/lib/sign-check";
import { parseTxChain } from "@/lib/tx-chains";

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: Record<string, unknown> = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const chain = parseTxChain(body.chain ?? "base");
    if (!chain) return Response.json({ error: "chain must be base (8453) or robinhood (4663)" }, { status: 400 });
    const tx = body.tx && typeof body.tx === "object" ? body.tx as { to?: string; data?: string; value?: string } : null;
    const typedData = body.typed_data ?? body.typedData ?? null;
    const authorization = body.authorization && typeof body.authorization === "object" ? body.authorization as { address?: string; chainId?: number } : null;
    if (!tx && (typedData == null || typedData === "") && !authorization) {
      return Response.json({ error: "Pass one of: tx {to, data?, value?} (with from), typed_data (EIP-712 object or JSON string), or authorization {address, chainId}" }, { status: 400 });
    }
    const check = await signCheck({ chain, from: typeof body.from === "string" ? body.from : null, tx, typedData, authorization });
    return Response.json({
      tool: "sign-check",
      chain,
      chain_id: chain === "robinhood" ? 4663 : 8453,
      ...check,
      how_to_use: "BLOCK: do not sign. WARN: show the summary and reasons to the user and sign only on an explicit yes. PASS: every effect was read and nothing measured against it — not a recommendation.",
      data_sources: ["eth_simulateV1 (traceTransfers) on the chain RPC", "calldata / EIP-712 decoding in code", "GoPlus address_security"],
    });
  } catch (e) {
    return Response.json({ error: "sign-check failed", message: (e as Error).message }, { status: 502 });
  }
}
