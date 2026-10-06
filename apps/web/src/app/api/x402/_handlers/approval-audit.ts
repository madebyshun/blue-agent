// x402/approval-audit — what a wallet has granted, still live, and how to revoke it.
// Price: free (safety checks should never be gated)
//
// ERC-20 allowances, NFT operator-for-all and Permit2 grants, each re-read
// LIVE so a spent or revoked grant is not reported, with the amount exposed
// (min of allowance and balance), the spender screened (contract? flagged?),
// and an UNSIGNED revoke transaction per grant for the wallet owner to sign.
// All logic in lib/approval-audit.ts; no LLM.

import { approvalAudit } from "@/lib/approval-audit";
import { parseTxChain } from "@/lib/tx-chains";

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { chain?: unknown; wallet?: unknown; address?: unknown; fresh?: unknown } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const chain = parseTxChain(body.chain ?? url.searchParams.get("chain") ?? "base");
    const wallet = String(body.wallet ?? body.address ?? url.searchParams.get("wallet") ?? "").trim();
    if (!chain) return Response.json({ error: "chain must be base (8453) or robinhood (4663)" }, { status: 400 });
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) return Response.json({ error: "Provide `wallet` — a 0x address" }, { status: 400 });
    const audit = await approvalAudit(chain, wallet, { fresh: body.fresh === true });
    // Every history source unread = no answer. 502 so a paid caller is never
    // charged and nobody reads an empty list as "no approvals".
    if (audit.unread.length >= 3) {
      return Response.json({ tool: "approval-audit", ...audit, error: "The approval history could not be read (explorer rate limit or outage). This is not an empty list." }, { status: 502 });
    }
    return Response.json({
      tool: "approval-audit",
      ...audit,
      how_to_use: "Each grant carries an unsigned `revoke` tx {chain_id, to, data, value}; the wallet owner signs it. BLOCK = revoke now. A non-empty `unread` means the list may be incomplete.",
      data_sources: ["Blockscout getLogs (Approval, ApprovalForAll, Permit2)", "live allowance()/isApprovedForAll()/Permit2.allowance() over RPC", "GoPlus address_security"],
    });
  } catch (e) {
    return Response.json({ error: "approval-audit failed", message: (e as Error).message }, { status: 502 });
  }
}
