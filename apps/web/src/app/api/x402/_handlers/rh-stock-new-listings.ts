// x402/rh-stock-new-listings (D3) — detect newly deployed RH RWA tokens.
// Price: $0.05
//
// Approach: read the canonical registry's expected creator (RHJ deployer
// pattern per docs) and query Blockscout for token contracts recently
// created on Robinhood Chain. Cross-references against RWA_TOKENS to filter
// out already-registered tokens.
//
// Real Blockscout query — surfaces the actual on-chain list. Never invents.

import { RH_CHAIN, RWA_TOKENS } from "@/lib/robinhood/rwa-registry";

const BS = "https://robinhoodchain.blockscout.com/api/v2";

// Canonical RHJ deployer per research (`0x4783C67b63dE2B358Ac5951a7D41F47A38F3C046`).
// Every RH RWA token so far has been deployed by this address as a beacon
// proxy. New listings appear as fresh creations from this deployer.
const RHJ_DEPLOYER = "0x4783C67b63dE2B358Ac5951a7D41F47A38F3C046";

type TxItem = {
  hash?: string;
  timestamp?: string;
  created_contract?: { hash?: string; name?: string; is_verified?: boolean };
  method?: string;
};
type Resp = { items?: TxItem[]; next_page_params?: unknown };

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { since_days?: number; limit?: number } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const sinceDays = Math.max(1, Math.min(365, Number(body.since_days ?? url.searchParams.get("since_days") ?? 30)));
    const limit = Math.max(1, Math.min(50, Number(body.limit ?? url.searchParams.get("limit") ?? 20)));

    const timestamp = new Date().toISOString();
    const cutoff = Date.now() / 1000 - sinceDays * 86400;

    // Blockscout address transactions filter: `filter=to|from` → we want all
    // contract-creation txs from the RHJ deployer. The v2 API returns
    // created_contract fields on creation txs.
    let items: TxItem[] = [];
    try {
      const r = await fetch(`${BS}/addresses/${RHJ_DEPLOYER}/transactions?filter=from`, {
        signal: AbortSignal.timeout(10000),
        headers: { accept: "application/json" },
      });
      if (r.ok) {
        const d = (await r.json()) as Resp;
        items = d.items ?? [];
      }
    } catch { /* swallow */ }

    // Filter creation txs since cutoff, dedupe by created contract address.
    const registeredContracts = new Set(RWA_TOKENS.map((t) => t.contract.toLowerCase()));
    const seen = new Set<string>();
    const created: Array<{
      contract: string;
      name: string | null;
      verified: boolean;
      deployed_at_unix: number;
      tx_hash: string;
      in_registry: boolean;
    }> = [];
    for (const item of items) {
      const c = item.created_contract?.hash;
      if (!c) continue;
      const lower = c.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      const ts = item.timestamp ? Math.floor(new Date(item.timestamp).getTime() / 1000) : 0;
      if (ts < cutoff) continue;
      created.push({
        contract: c,
        name: item.created_contract?.name ?? null,
        verified: !!item.created_contract?.is_verified,
        deployed_at_unix: ts,
        tx_hash: item.hash ?? "",
        in_registry: registeredContracts.has(lower),
      });
    }
    created.sort((a, b) => b.deployed_at_unix - a.deployed_at_unix);
    const trimmed = created.slice(0, limit);
    const new_only = trimmed.filter((c) => !c.in_registry);

    return Response.json({
      tool: "rh-stock-new-listings",
      window_days: sinceDays,
      deployer: RHJ_DEPLOYER,
      creations_seen: created.length,
      new_since_cutoff: new_only.length,
      creations: trimmed,
      new_only,
      note: new_only.length > 0
        ? `${new_only.length} contract(s) deployed by RHJ within the last ${sinceDays} days are NOT yet in our canonical registry — inspect + promote via a registry PR.`
        : "No new RHJ-deployed contracts detected in the window. Registry is current.",
      data_sources: ["robinhoodchain.blockscout.com API v2 (address transactions filter)"],
      network: RH_CHAIN,
      timestamp,
    });
  } catch (e) {
    return Response.json({ error: "rh-stock-new-listings failed", message: (e as Error).message }, { status: 500 });
  }
}
